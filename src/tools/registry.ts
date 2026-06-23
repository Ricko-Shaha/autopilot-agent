import type { ToolCall, ToolSchema } from "../llm/provider.ts";

/**
 * A tool the agent can call. Tools are plain async functions plus a schema.
 * `requiresApproval` marks state-changing / irreversible actions (sending an
 * email, charging a card) that must pass a human-in-the-loop checkpoint before
 * they run — the core safety property the "Autopilot" track asks for.
 */
export interface Tool {
  schema: ToolSchema;
  requiresApproval?: boolean;
  run(args: Record<string, unknown>): Promise<unknown>;
}

export class ToolRegistry {
  private tools = new Map<string, Tool>();

  register(tool: Tool): this {
    this.tools.set(tool.schema.name, tool);
    return this;
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  schemas(): ToolSchema[] {
    return [...this.tools.values()].map((t) => t.schema);
  }

  requiresApproval(call: ToolCall): boolean {
    return this.tools.get(call.name)?.requiresApproval === true;
  }
}
