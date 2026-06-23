import type { ChatMessage, ChatResponse, LLMProvider, ToolSchema } from "./provider.ts";

/**
 * Deterministic provider for offline use: tests and the no-API-key demo.
 *
 * It takes a `plan` function — a stand-in for the model's reasoning — so a
 * scenario can drive the exact same agent loop the real Qwen model drives,
 * with zero network and fully reproducible output. This is how we verify the
 * orchestration, tool wiring, and approval gate without spending a token.
 */
export type MockPlan = (messages: ChatMessage[], tools: ToolSchema[]) => ChatResponse;

export class MockProvider implements LLMProvider {
  readonly name = "mock";
  private plan: MockPlan;
  constructor(plan: MockPlan) {
    this.plan = plan;
  }
  async chat(messages: ChatMessage[], tools: ToolSchema[]): Promise<ChatResponse> {
    return this.plan(messages, tools);
  }
}

/** Return the parsed JSON result of the most recent successful call to `toolName`. */
export function lastToolResult<T = any>(messages: ChatMessage[], toolName: string): T | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "tool" && m.name === toolName) {
      try {
        return JSON.parse(m.content) as T;
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

/** True once a successful result for `toolName` exists in the transcript. */
export function hasToolResult(messages: ChatMessage[], toolName: string): boolean {
  return messages.some((m) => m.role === "tool" && m.name === toolName);
}
