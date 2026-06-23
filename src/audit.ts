/**
 * Structured, append-only audit trail. Every model turn, tool call, approval
 * decision, and error is recorded — this is what makes an agent auditable and
 * "production-ready" rather than a black box, and it's what the demo UI renders.
 */
export type AuditKind =
  | "task_received"
  | "model_turn"
  | "tool_call"
  | "tool_result"
  | "approval_requested"
  | "approval_decision"
  | "error"
  | "completed";

export interface AuditEntry {
  seq: number;
  ts: string;
  kind: AuditKind;
  summary: string;
  data?: unknown;
}

export class Audit {
  private entries: AuditEntry[] = [];
  private seq = 0;
  private sink?: (e: AuditEntry) => void;
  constructor(sink?: (e: AuditEntry) => void) {
    this.sink = sink;
  }

  log(kind: AuditKind, summary: string, data?: unknown): AuditEntry {
    const entry: AuditEntry = { seq: ++this.seq, ts: new Date().toISOString(), kind, summary, data };
    this.entries.push(entry);
    this.sink?.(entry);
    return entry;
  }

  all(): readonly AuditEntry[] {
    return this.entries;
  }
}
