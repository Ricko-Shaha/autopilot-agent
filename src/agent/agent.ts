import type { ChatMessage, LLMProvider, ToolCall } from "../llm/provider.ts";
import type { Tool, ToolRegistry } from "../tools/registry.ts";
import { Audit, type AuditEntry } from "../audit.ts";

/** A human (or policy) decision on a checkpointed action. */
export interface ApprovalDecision {
  approved: boolean;
  reason?: string;
  /** Optional human edits to the action's arguments before it runs. */
  editedArgs?: Record<string, unknown>;
}

/** Anything that can answer an approval checkpoint: a UI, a Slack prompt, a policy. */
export interface Approver {
  request(call: ToolCall, tool: Tool): Promise<ApprovalDecision>;
}

/** Auto-approve everything — used by tests/offline demo unless overridden. */
export const autoApprove: Approver = {
  async request() {
    return { approved: true, reason: "auto-approved (no human approver configured)" };
  },
};

export interface AutopilotOptions {
  task: string;
  provider: LLMProvider;
  tools: ToolRegistry;
  approver?: Approver;
  systemPrompt?: string;
  maxSteps?: number;
  onAudit?: (e: AuditEntry) => void;
}

export interface AutopilotResult {
  output: string;
  steps: number;
  completed: boolean;
  audit: readonly AuditEntry[];
  messages: ChatMessage[];
}

const DEFAULT_SYSTEM = `You are Autopilot, an operations agent that completes business workflows end-to-end.
Work step by step: gather the facts you need by calling tools, reason about ambiguous input,
and only then act. Never invent data — if a tool can give you the answer, call it.
Actions that contact a customer or change records are gated by a human checkpoint;
propose them clearly. When the workflow is done, reply with a concise summary of what you did.`;

/**
 * Run one workflow to completion. The model drives; this loop executes the tools
 * it asks for, routes irreversible actions through the human-in-the-loop approver,
 * records everything to the audit trail, and stops when the model gives a final
 * answer or the step budget is exhausted.
 */
export async function runAutopilot(opts: AutopilotOptions): Promise<AutopilotResult> {
  const approver = opts.approver ?? autoApprove;
  const maxSteps = opts.maxSteps ?? 12;
  const audit = new Audit(opts.onAudit);

  const messages: ChatMessage[] = [
    { role: "system", content: opts.systemPrompt ?? DEFAULT_SYSTEM },
    { role: "user", content: opts.task },
  ];
  audit.log("task_received", "Workflow task received", { task: opts.task, provider: opts.provider.name });

  let steps = 0;
  while (steps < maxSteps) {
    steps++;
    const resp = await opts.provider.chat(messages, opts.tools.schemas());
    audit.log("model_turn", resp.toolCalls.length ? `Model requested ${resp.toolCalls.length} tool(s)` : "Model produced final answer", {
      content: resp.content,
      toolCalls: resp.toolCalls,
      usage: resp.usage,
    });

    // Final answer: no tools requested.
    if (resp.toolCalls.length === 0) {
      messages.push({ role: "assistant", content: resp.content });
      audit.log("completed", "Workflow completed", { output: resp.content, steps });
      return { output: resp.content, steps, completed: true, audit: audit.all(), messages };
    }

    // Record the assistant's tool-calling turn, then execute each call.
    messages.push({ role: "assistant", content: resp.content, toolCalls: resp.toolCalls });

    for (const call of resp.toolCalls) {
      const tool = opts.tools.get(call.name);
      if (!tool) {
        const msg = `Unknown tool: ${call.name}`;
        audit.log("error", msg, { call });
        messages.push({ role: "tool", name: call.name, toolCallId: call.id, content: JSON.stringify({ error: msg }) });
        continue;
      }

      let args = call.arguments;

      // Human-in-the-loop checkpoint for irreversible actions.
      if (tool.requiresApproval) {
        audit.log("approval_requested", `Approval needed to run ${call.name}`, { call });
        const decision = await approver.request(call, tool);
        audit.log("approval_decision", `${call.name} ${decision.approved ? "approved" : "rejected"}`, decision);
        if (!decision.approved) {
          messages.push({
            role: "tool",
            name: call.name,
            toolCallId: call.id,
            content: JSON.stringify({ skipped: true, reason: decision.reason ?? "rejected by human reviewer" }),
          });
          continue;
        }
        if (decision.editedArgs) args = { ...args, ...decision.editedArgs };
      }

      try {
        audit.log("tool_call", `Calling ${call.name}`, { args });
        const result = await tool.run(args);
        audit.log("tool_result", `${call.name} returned`, { result });
        messages.push({ role: "tool", name: call.name, toolCallId: call.id, content: JSON.stringify(result) });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        audit.log("error", `${call.name} threw: ${message}`, { args });
        messages.push({ role: "tool", name: call.name, toolCallId: call.id, content: JSON.stringify({ error: message }) });
      }
    }
  }

  audit.log("error", "Step budget exhausted before completion", { maxSteps });
  return { output: "Workflow stopped: step budget exhausted.", steps, completed: false, audit: audit.all(), messages };
}
