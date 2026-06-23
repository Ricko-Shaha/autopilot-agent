import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import process from "node:process";
import { runAutopilot, type Approver, type ApprovalDecision } from "./agent/agent.ts";
import { MockProvider } from "./llm/mock.ts";
import { QwenProvider } from "./llm/qwen.ts";
import { getScenario, SCENARIOS, type Scenario } from "./scenarios/index.ts";
import type { LLMProvider } from "./llm/provider.ts";
import type { AuditEntry } from "./audit.ts";

/**
 * Dependency-free HTTP server (Node's built-in `http`). Serves the approval UI,
 * streams the agent's live audit trail over Server-Sent Events, and routes the
 * human-in-the-loop checkpoint to Approve/Reject buttons in the browser.
 * Deploys cleanly to Alibaba Cloud (ECS / Function Compute) — see DEPLOY.md.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 8787);

function buildProvider(scenario: Scenario): LLMProvider {
  if (process.env.LLM_PROVIDER === "qwen") {
    const apiKey = process.env.QWEN_API_KEY;
    if (!apiKey) throw new Error("QWEN_API_KEY is required when LLM_PROVIDER=qwen");
    return new QwenProvider({
      apiKey,
      baseUrl: process.env.QWEN_BASE_URL ?? "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
      model: process.env.QWEN_MODEL ?? "qwen-plus",
    });
  }
  return new MockProvider(scenario.plan());
}

interface Run {
  id: string;
  buffer: AuditEntry[];
  clients: Set<http.ServerResponse>;
  pending: Map<string, (d: ApprovalDecision) => void>;
  done: boolean;
}
const runs = new Map<string, Run>();
let runSeq = 0;

function broadcast(run: Run, entry: AuditEntry) {
  run.buffer.push(entry);
  const line = `event: audit\ndata: ${JSON.stringify(entry)}\n\n`;
  for (const res of run.clients) res.write(line);
}

function startRun(inquiry: string, scenarioKey?: string): Run {
  const scenario = getScenario(scenarioKey);
  const run: Run = { id: `run_${++runSeq}`, buffer: [], clients: new Set(), pending: new Map(), done: false };
  runs.set(run.id, run);

  const approver: Approver = {
    request(call) {
      return new Promise<ApprovalDecision>((resolve) => run.pending.set(call.id, resolve));
    },
  };

  runAutopilot({ task: inquiry, provider: buildProvider(scenario), tools: scenario.tools(), approver, onAudit: (e) => broadcast(run, e) })
    .then((r) => broadcast(run, { seq: 9e9, ts: new Date().toISOString(), kind: "completed", summary: "DONE", data: { output: r.output, completed: r.completed } }))
    .catch((err) => broadcast(run, { seq: 9e9, ts: new Date().toISOString(), kind: "error", summary: String(err?.message ?? err) }))
    .finally(() => { run.done = true; });

  return run;
}

async function readBody(req: http.IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  try {
    return JSON.parse(Buffer.concat(chunks).toString() || "{}");
  } catch {
    return {};
  }
}

function json(res: http.ServerResponse, code: number, obj: unknown) {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

  if (req.method === "GET" && url.pathname === "/") {
    const html = await readFile(join(__dirname, "..", "public", "index.html"), "utf8");
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(html);
  }

  if (req.method === "GET" && url.pathname === "/api/scenarios") {
    return json(res, 200, {
      provider: process.env.LLM_PROVIDER === "qwen" ? "Qwen Cloud" : "mock (offline)",
      scenarios: Object.values(SCENARIOS).map((s) => ({ key: s.key, label: s.label })),
    });
  }

  if (req.method === "GET" && url.pathname === "/api/sample") {
    const scenario = getScenario(url.searchParams.get("scenario") ?? undefined);
    return json(res, 200, { inquiry: scenario.sampleTask, scenario: scenario.key, provider: process.env.LLM_PROVIDER === "qwen" ? "Qwen Cloud" : "mock (offline)" });
  }

  if (req.method === "POST" && url.pathname === "/api/run") {
    const body = await readBody(req);
    const scenario = getScenario(body.scenario);
    const run = startRun(String(body.inquiry || scenario.sampleTask), scenario.key);
    return json(res, 200, { runId: run.id });
  }

  if (req.method === "GET" && url.pathname === "/api/stream") {
    const run = runs.get(url.searchParams.get("runId") ?? "");
    if (!run) return json(res, 404, { error: "unknown run" });
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    for (const e of run.buffer) res.write(`event: audit\ndata: ${JSON.stringify(e)}\n\n`); // replay
    run.clients.add(res);
    req.on("close", () => run.clients.delete(res));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/decision") {
    const body = await readBody(req);
    const run = runs.get(String(body.runId));
    const resolve = run?.pending.get(String(body.callId));
    if (!resolve) return json(res, 404, { error: "no pending approval" });
    run!.pending.delete(String(body.callId));
    resolve({ approved: !!body.approved, reason: body.approved ? "approved in UI" : "rejected in UI", editedArgs: body.editedBody ? { body: String(body.editedBody) } : undefined });
    return json(res, 200, { ok: true });
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("not found");
});

server.listen(PORT, () => {
  console.log(`Autopilot UI on http://localhost:${PORT}  (provider: ${process.env.LLM_PROVIDER === "qwen" ? "Qwen Cloud" : "mock/offline"})`);
});
