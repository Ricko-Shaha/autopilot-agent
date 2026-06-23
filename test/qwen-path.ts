import http from "node:http";
import assert from "node:assert/strict";
import process from "node:process";
import { QwenProvider } from "../src/llm/qwen.ts";
import { runAutopilot } from "../src/agent/agent.ts";
import { SAMPLE_INQUIRY, salesTools } from "../src/scenarios/salesInquiry.ts";
import { sentMail } from "../src/tools/businessTools.ts";

/**
 * QA for the real Qwen code path WITHOUT a key: a mock OpenAI-compatible server
 * mimics Qwen Cloud's chat/completions, returning native tool_calls. This exercises
 * QwenProvider's request shaping, tool-schema serialization, tool_call parsing
 * (arguments as a JSON string), and multi-turn message threading end to end.
 */
let sawTools = false, sawAuth = false, sawToolRole = false;

function nextCall(messages: any[]) {
  const have = (n: string) => messages.some((m) => m.role === "tool" && m.name === n);
  let i = 0;
  const mk = (name: string, args: unknown) => ({ id: `c${++i}_${name}`, type: "function", function: { name, arguments: JSON.stringify(args) } });
  if (!have("lookup_catalog")) return mk("lookup_catalog", { query: "laptops and monitors" });
  if (!have("compute_quote")) return mk("compute_quote", { customerTier: "business", items: [{ sku: "WK-STD", quantity: 25 }, { sku: "MON-27", quantity: 25 }] });
  if (!have("draft_reply")) return mk("draft_reply", { toName: "Dana", subject: "Your quote", body: "Quote attached." });
  if (!have("send_reply")) return mk("send_reply", { to: "dana@brightloop.io", subject: "Your quote", body: "Quote attached." });
  return null;
}

const server = http.createServer((req, res) => {
  let b = "";
  req.on("data", (c) => (b += c));
  req.on("end", () => {
    if (req.headers.authorization?.startsWith("Bearer ")) sawAuth = true;
    const body = JSON.parse(b || "{}");
    if (Array.isArray(body.tools) && body.tools[0]?.type === "function" && body.tools[0]?.function?.name) sawTools = true;
    if ((body.messages || []).some((m: any) => m.role === "tool" && m.tool_call_id)) sawToolRole = true;
    const tc = nextCall(body.messages || []);
    const message = tc ? { role: "assistant", content: "", tool_calls: [tc] } : { role: "assistant", content: "Done — quote sent and logged." };
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ choices: [{ message }], usage: { prompt_tokens: 10, completion_tokens: 5 } }));
  });
});

await new Promise<void>((r) => server.listen(0, r));
const port = (server.address() as any).port;

sentMail.length = 0;
const provider = new QwenProvider({ apiKey: "test-key", baseUrl: `http://localhost:${port}`, model: "qwen-plus" });
const result = await runAutopilot({ task: SAMPLE_INQUIRY, provider, tools: salesTools(), approver: { async request() { return { approved: true }; } } });
server.close();

let pass = 0, fail = 0;
const check = (n: string, c: boolean) => { c ? (pass++, console.log(`  ✅ ${n}`)) : (fail++, console.log(`  ❌ ${n}`)); };
console.log("Qwen provider HTTP-path QA\n");
check("provider name reflects model", provider.name === "qwen:qwen-plus");
check("Authorization: Bearer header sent", sawAuth);
check("tools serialized as OpenAI function schema", sawTools);
check("tool-result turns threaded back with tool_call_id", sawToolRole);
check("tool_calls parsed → tools executed → email sent", sentMail.length === 1);
check("workflow completed over the HTTP path", result.completed);
check("multi-step loop ran (>=4 model turns)", result.steps >= 4);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
