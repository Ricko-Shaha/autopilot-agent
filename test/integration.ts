import assert from "node:assert/strict";
import process from "node:process";

/** Drives the running HTTP server exactly as the browser does: start a run,
 *  read the SSE trace, auto-approve at the checkpoint, assert it completes. */
const BASE = process.env.BASE ?? "http://localhost:8787";
const SCENARIO = process.env.SCENARIO ?? "sales";

const sample = await (await fetch(BASE + "/api/sample?scenario=" + SCENARIO)).json();
const { runId } = await (
  await fetch(BASE + "/api/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inquiry: sample.inquiry, scenario: SCENARIO }) })
).json();

const resp = await fetch(BASE + "/api/stream?runId=" + runId);
const reader = (resp.body as ReadableStream<Uint8Array>).getReader();
const dec = new TextDecoder();
let buf = "";
let approved = false;
let outcome: any = null;
const kinds: string[] = [];

outer: while (true) {
  const { value, done } = await reader.read();
  if (done) break;
  buf += dec.decode(value, { stream: true });
  let idx: number;
  while ((idx = buf.indexOf("\n\n")) >= 0) {
    const chunk = buf.slice(0, idx);
    buf = buf.slice(idx + 2);
    const m = chunk.match(/data: (.*)/s);
    if (!m) continue;
    const e = JSON.parse(m[1]);
    kinds.push(e.kind);
    if (e.kind === "approval_requested" && !approved) {
      approved = true;
      await fetch(BASE + "/api/decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId, callId: e.data.call.id, approved: true, editedBody: e.data.call.arguments.body }),
      });
    }
    if (e.kind === "completed" && e.summary === "DONE") {
      outcome = e.data;
      break outer;
    }
  }
}

console.log(`[${SCENARIO}] trace kinds:`, kinds.join(" → "));
console.log(`[${SCENARIO}] outcome:`, outcome?.output);
assert.ok(outcome?.completed, "workflow should complete via the HTTP/SSE path");
assert.ok(approved, "approval checkpoint should have fired");
if (SCENARIO === "sales") assert.ok(String(outcome.output).includes("42300"), "outcome should reflect the computed quote");

// Error-path checks
const bogusStream = await fetch(BASE + "/api/stream?runId=does-not-exist");
assert.equal(bogusStream.status, 404, "unknown run should 404");
const bogusDecision = await fetch(BASE + "/api/decision", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ runId: "x", callId: "y", approved: true }) });
assert.equal(bogusDecision.status, 404, "decision for unknown approval should 404");

console.log(`\n✅ INTEGRATION OK [${SCENARIO}] — server, SSE, interactive approval, and error paths all work`);
process.exit(0);
