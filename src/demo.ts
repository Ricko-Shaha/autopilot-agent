import process from "node:process";
import { runAutopilot, type Approver } from "./agent/agent.ts";
import { MockProvider } from "./llm/mock.ts";
import { QwenProvider } from "./llm/qwen.ts";
import { getScenario } from "./scenarios/index.ts";
import type { LLMProvider } from "./llm/provider.ts";

/**
 * End-to-end demo. Offline by default (mock, no key). Choose a workflow with
 * SCENARIO=sales|incident. Set LLM_PROVIDER=qwen + QWEN_API_KEY for the real model,
 * or APPROVE=reject to watch the human-in-the-loop checkpoint block the risky action.
 */
const scenario = getScenario(process.env.SCENARIO);

function buildProvider(): LLMProvider {
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

const reject = process.env.APPROVE === "reject";
const approver: Approver = {
  async request(call) {
    const a = (call.arguments ?? {}) as Record<string, unknown>;
    console.log(`\n  🔔 APPROVAL CHECKPOINT — ${call.name}`);
    for (const k of ["to", "subject", "service", "replicas"]) if (a[k] != null) console.log(`     ${k}: ${a[k]}`);
    console.log(`     decision: ${reject ? "❌ REJECTED (APPROVE=reject)" : "✅ APPROVED"}`);
    return { approved: !reject, reason: reject ? "reviewer declined" : "approved by reviewer" };
  },
};

console.log("════════════════════════════════════════════════════════");
console.log("  AUTOPILOT AGENT");
console.log(`  workflow: ${scenario.label}`);
console.log(`  provider: ${process.env.LLM_PROVIDER === "qwen" ? "Qwen Cloud" : "mock (offline)"}`);
console.log("════════════════════════════════════════════════════════");
console.log("\nINBOUND:\n" + scenario.sampleTask.split("\n").map((l) => "  " + l).join("\n"));
console.log("\n── live trace ──");

const result = await runAutopilot({
  task: scenario.sampleTask,
  provider: buildProvider(),
  tools: scenario.tools(),
  approver,
  onAudit: (e) => {
    if (e.kind === "model_turn" && (e.data as any)?.content) console.log(`🧠 ${(e.data as any).content}`);
    else if (e.kind === "tool_call") console.log(`🔧 ${e.summary}`);
  },
});

console.log("\n── outcome ──");
console.log(result.output);
const toolRuns = result.audit.filter((e) => e.kind === "tool_result").length;
const approvals = result.audit.filter((e) => e.kind === "approval_decision");
console.log(`\nsteps: ${result.steps} · completed: ${result.completed} · tools executed: ${toolRuns} · approvals: ${approvals.length} · audit entries: ${result.audit.length}`);
process.exit(result.completed ? 0 : 1);
