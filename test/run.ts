import assert from "node:assert/strict";
import process from "node:process";
import { runAutopilot, type Approver } from "../src/agent/agent.ts";
import { MockProvider } from "../src/llm/mock.ts";
import { SAMPLE_INQUIRY, salesInquiryPlan, salesTools } from "../src/scenarios/salesInquiry.ts";
import { crmRecords, sentMail } from "../src/tools/businessTools.ts";
import { SAMPLE_ALERT, incidentLog, incidentPlan, incidentTools } from "../src/scenarios/incidentResponse.ts";

/** Minimal dependency-free test runner. */
let passed = 0;
let failed = 0;
async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ❌ ${name}\n     ${(err as Error).message}`);
  }
}

function reset() {
  sentMail.length = 0;
  crmRecords.length = 0;
}

const approveAll: Approver = { async request() { return { approved: true }; } };
const rejectAll: Approver = { async request() { return { approved: false, reason: "test reject" }; } };

console.log("Autopilot test suite\n");

await test("happy path completes the workflow and sends one email", async () => {
  reset();
  const r = await runAutopilot({ task: SAMPLE_INQUIRY, provider: new MockProvider(salesInquiryPlan()), tools: salesTools(), approver: approveAll });
  assert.equal(r.completed, true, "workflow should complete");
  assert.equal(sentMail.length, 1, "exactly one email should be sent");
  assert.equal(crmRecords.length, 1, "one CRM record should be written");
});

await test("quote math: business-tier 6% volume discount on 3×25 line items = $42,300", async () => {
  reset();
  await runAutopilot({ task: SAMPLE_INQUIRY, provider: new MockProvider(salesInquiryPlan()), tools: salesTools(), approver: approveAll });
  assert.ok(sentMail[0].body.includes("$42300"), "sent email should contain the computed total");
});

await test("human-in-the-loop: rejecting approval blocks the customer email", async () => {
  reset();
  const r = await runAutopilot({ task: SAMPLE_INQUIRY, provider: new MockProvider(salesInquiryPlan()), tools: salesTools(), approver: rejectAll });
  assert.equal(r.completed, true, "workflow still completes gracefully");
  assert.equal(sentMail.length, 0, "no email should be sent when rejected");
  assert.equal(crmRecords.length, 1, "CRM is still updated (non-destructive step)");
});

await test("audit trail records an approval checkpoint and the tool calls", async () => {
  reset();
  const r = await runAutopilot({ task: SAMPLE_INQUIRY, provider: new MockProvider(salesInquiryPlan()), tools: salesTools(), approver: approveAll });
  const kinds = r.audit.map((e) => e.kind);
  assert.ok(kinds.includes("approval_requested"), "should request approval");
  assert.ok(kinds.includes("approval_decision"), "should record the decision");
  assert.ok(kinds.filter((k) => k === "tool_call").length >= 4, "should call several tools");
  assert.equal(kinds.at(-1), "completed", "should end completed");
});

await test("only customer-facing send_reply is gated for approval", () => {
  const reg = salesTools();
  assert.equal(reg.get("send_reply")?.requiresApproval, true, "send_reply must require approval");
  assert.notEqual(reg.get("lookup_catalog")?.requiresApproval, true, "read tools must not require approval");
  assert.notEqual(reg.get("compute_quote")?.requiresApproval, true, "pricing must not require approval");
});

await test("incident workflow: same engine, different tools — triages and restarts on approval", async () => {
  incidentLog.length = 0;
  const r = await runAutopilot({ task: SAMPLE_ALERT, provider: new MockProvider(incidentPlan()), tools: incidentTools(), approver: approveAll });
  assert.equal(r.completed, true);
  assert.ok(incidentLog.some((a) => a.action === "restart"), "should restart the service after approval");
  assert.ok(incidentLog.some((a) => a.channel === "#incidents"), "should post a status update");
});

await test("incident workflow: rejecting approval blocks the disruptive restart", async () => {
  incidentLog.length = 0;
  const r = await runAutopilot({ task: SAMPLE_ALERT, provider: new MockProvider(incidentPlan()), tools: incidentTools(), approver: rejectAll });
  assert.equal(r.completed, true, "still completes (escalates instead)");
  assert.equal(incidentLog.some((a) => a.action === "restart"), false, "no restart should happen when rejected");
});

await test("incident workflow gates only the disruptive tools", () => {
  const reg = incidentTools();
  assert.equal(reg.get("restart_service")?.requiresApproval, true);
  assert.equal(reg.get("scale_service")?.requiresApproval, true);
  assert.notEqual(reg.get("query_metrics")?.requiresApproval, true);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
