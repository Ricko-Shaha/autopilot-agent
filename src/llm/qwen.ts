import type { ChatMessage, ChatResponse, LLMProvider, ToolCall, ToolSchema } from "./provider.ts";

/**
 * Qwen Cloud provider, via the OpenAI-compatible chat-completions endpoint that
 * Alibaba Cloud Model Studio / Qwen Cloud expose. No SDK — just `fetch` — so the
 * project has zero runtime dependencies and deploys cleanly to Alibaba Cloud.
 *
 * Docs (from the hackathon Resources page):
 *   - First API call:   https://bit.ly/qwencloud-first-api
 *   - Model selection:  https://bit.ly/qwencloud-modelselection
 *   - Get an API key:   https://bit.ly/qwencloud-getapi
 */
export interface QwenConfig {
  apiKey: string;
  baseUrl: string; // e.g. https://dashscope-intl.aliyuncs.com/compatible-mode/v1
  model: string; // e.g. qwen-plus, qwen-max, qwen-turbo
  temperature?: number;
}

export class QwenProvider implements LLMProvider {
  readonly name: string;
  private cfg: QwenConfig;
  constructor(cfg: QwenConfig) {
    this.cfg = cfg;
    this.name = `qwen:${cfg.model}`;
  }

  async chat(messages: ChatMessage[], tools: ToolSchema[]): Promise<ChatResponse> {
    const body = {
      model: this.cfg.model,
      temperature: this.cfg.temperature ?? 0.2,
      messages: messages.map(toOpenAIMessage),
      tools: tools.map((t) => ({
        type: "function",
        function: { name: t.name, description: t.description, parameters: t.parameters },
      })),
      tool_choice: "auto",
    };

    const res = await fetch(`${this.cfg.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.cfg.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Qwen API ${res.status}: ${text.slice(0, 500)}`);
    }

    const json = (await res.json()) as any;
    const choice = json.choices?.[0]?.message ?? {};
    const toolCalls: ToolCall[] = (choice.tool_calls ?? []).map((tc: any) => ({
      id: tc.id ?? `call_${Math.random().toString(36).slice(2)}`,
      name: tc.function?.name,
      arguments: safeParse(tc.function?.arguments),
    }));

    return {
      content: choice.content ?? "",
      toolCalls,
      usage: {
        promptTokens: json.usage?.prompt_tokens,
        completionTokens: json.usage?.completion_tokens,
      },
    };
  }
}

function toOpenAIMessage(m: ChatMessage): Record<string, unknown> {
  if (m.role === "tool") {
    return { role: "tool", content: m.content, tool_call_id: m.toolCallId, name: m.name };
  }
  if (m.role === "assistant" && m.toolCalls?.length) {
    return {
      role: "assistant",
      content: m.content || null,
      tool_calls: m.toolCalls.map((tc) => ({
        id: tc.id,
        type: "function",
        function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
      })),
    };
  }
  return { role: m.role, content: m.content };
}

function safeParse(s: unknown): Record<string, unknown> {
  if (typeof s !== "string") return (s as Record<string, unknown>) ?? {};
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}
