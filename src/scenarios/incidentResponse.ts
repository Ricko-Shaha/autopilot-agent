import type { ChatMessage, ToolCall } from "../llm/provider.ts";
import { hasToolResult, lastToolResult, type MockPlan } from "../llm/mock.ts";
import { ToolRegistry, type Tool } from "../tools/registry.ts";

/**
 * A second, completely different workflow on the SAME engine — proving Autopilot
 * generalizes: swap the tools, keep the loop + approval gate + audit trail. Here an
 * inbound monitoring alert is triaged: pull metrics, consult the runbook, propose a
 * disruptive remediation (restart) that requires human approval, then post status.
 */

export const SAMPLE_ALERT = `ALERT [sev2] service=api-gateway
error_rate=14% (threshold 2%), p99_latency=1820ms, duration=6m.
Pager fired — customers reporting 502s on checkout.`;

/** Simulated side-effect log (what the agent actually did to the system). */
export const incidentLog: Record<string, unknown>[] = [];

const queryMetrics: Tool = {
  schema: {
    name: "query_metrics",
    description: "Fetch current metrics for a service: cpu, memory, error rate, p99 latency, recent deploys.",
    parameters: { type: "object", properties: { service: { type: "string" } }, required: ["service"] },
  },
  async run(args) {
    return { service: String(args.service ?? ""), cpu: 0.83, memory: 0.71, errorRate: 0.14, p99ms: 1820, recentDeploy: "v412 (12m ago)" };
  },
};

const searchRunbook: Tool = {
  schema: {
    name: "search_runbook",
    description: "Look up the runbook for a symptom; returns the likely cause and recommended remediation.",
    parameters: { type: "object", properties: { symptom: { type: "string" } }, required: ["symptom"] },
  },
  async run() {
    return { match: "Error spike shortly after deploy", likelyCause: "bad deploy (v412)", recommended: "restart", steps: ["confirm recent deploy", "restart service to drop bad pods", "if it persists, roll back"] };
  },
};

const restartService: Tool = {
  requiresApproval: true, // disruptive → human checkpoint
  schema: {
    name: "restart_service",
    description: "Restart a service. Disruptive to live traffic — requires approval.",
    parameters: { type: "object", properties: { service: { type: "string" } }, required: ["service"] },
  },
  async run(args) {
    const r = { action: "restart", service: String(args.service ?? ""), at: new Date().toISOString() };
    incidentLog.push(r);
    return { restarted: true, ...r };
  },
};

const scaleService: Tool = {
  requiresApproval: true,
  schema: {
    name: "scale_service",
    description: "Scale a service to N replicas. Requires approval.",
    parameters: { type: "object", properties: { service: { type: "string" }, replicas: { type: "number" } }, required: ["service", "replicas"] },
  },
  async run(args) {
    const r = { action: "scale", service: String(args.service ?? ""), replicas: Number(args.replicas) || 0, at: new Date().toISOString() };
    incidentLog.push(r);
    return { scaled: true, ...r };
  },
};

const postStatus: Tool = {
  schema: {
    name: "post_status",
    description: "Post an update to the internal incident channel.",
    parameters: { type: "object", properties: { channel: { type: "string" }, message: { type: "string" } }, required: ["message"] },
  },
  async run(args) {
    const r = { channel: String(args.channel ?? "#incidents"), message: String(args.message ?? ""), at: new Date().toISOString() };
    incidentLog.push(r);
    return { posted: true };
  },
};

export function incidentTools(): ToolRegistry {
  const r = new ToolRegistry();
  for (const t of [queryMetrics, searchRunbook, restartService, scaleService, postStatus]) r.register(t);
  return r;
}

let idc = 0;
const mk = (name: string, args: Record<string, unknown>): ToolCall => ({ id: `ic_${++idc}`, name, arguments: args });
const serviceOf = (text: string) => (text.match(/service=([\w.-]+)/i)?.[1] ?? "api-gateway");

export function incidentPlan(): MockPlan {
  return (messages: ChatMessage[]) => {
    const alert = messages.find((m) => m.role === "user")?.content ?? "";
    const svc = serviceOf(alert);
    if (!hasToolResult(messages, "query_metrics")) return { content: `Pulling current metrics for ${svc}.`, toolCalls: [mk("query_metrics", { service: svc })] };
    if (!hasToolResult(messages, "search_runbook")) return { content: "Consulting the runbook for this symptom.", toolCalls: [mk("search_runbook", { symptom: "high error rate after deploy" })] };
    if (!hasToolResult(messages, "restart_service")) return { content: `Runbook points to a bad deploy (v412). Proposing a restart of ${svc} — needs approval.`, toolCalls: [mk("restart_service", { service: svc })] };
    if (!hasToolResult(messages, "post_status")) {
      const ok = lastToolResult<any>(messages, "restart_service")?.restarted === true;
      return { content: "Posting an incident update.", toolCalls: [mk("post_status", { channel: "#incidents", message: ok ? `Restarted ${svc} after a post-deploy error spike (v412). Monitoring recovery.` : `Restart of ${svc} not approved — escalating to on-call.` })] };
    }
    const ok = lastToolResult<any>(messages, "restart_service")?.restarted === true;
    return {
      content: `Triaged ${svc}: 14% error rate after deploy v412. ${ok ? "Restarted after human approval" : "Restart declined — escalated to on-call"}; posted an incident update.`,
      toolCalls: [],
    };
  };
}
