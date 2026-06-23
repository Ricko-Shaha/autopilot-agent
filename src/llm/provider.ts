/**
 * Provider-agnostic LLM interface.
 *
 * The whole agent is written against this interface, so the same engine runs on
 * Qwen Cloud (the hackathon requirement), on a deterministic mock (offline tests
 * and the no-key demo), or on any other tool-calling chat model. Swapping the
 * provider does not touch a single line of agent logic.
 */

/** A JSON-Schema description of a tool the model may call. */
export interface ToolSchema {
  name: string;
  description: string;
  /** JSON Schema for the tool's arguments object. */
  parameters: Record<string, unknown>;
}

/** A tool invocation requested by the model. */
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export type Role = "system" | "user" | "assistant" | "tool";

export interface ChatMessage {
  role: Role;
  content: string;
  /** Present on assistant turns that requested tools. */
  toolCalls?: ToolCall[];
  /** Present on tool-result turns: which call this answers. */
  toolCallId?: string;
  /** Tool name, for tool-result turns. */
  name?: string;
}

export interface ChatResponse {
  /** Natural-language content (may be empty when the model only calls tools). */
  content: string;
  /** Tools the model wants to run this turn (empty when it's a final answer). */
  toolCalls: ToolCall[];
  /** Optional token accounting, when the provider reports it. */
  usage?: { promptTokens?: number; completionTokens?: number };
}

export interface LLMProvider {
  /** Human-readable provider id, surfaced in the audit log. */
  readonly name: string;
  chat(messages: ChatMessage[], tools: ToolSchema[]): Promise<ChatResponse>;
}
