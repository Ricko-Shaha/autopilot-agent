import type { ChatMessage, ToolCall } from "../llm/provider.ts";
import { hasToolResult, lastToolResult, type MockPlan } from "../llm/mock.ts";
import { ToolRegistry } from "../tools/registry.ts";
import { businessTools } from "../tools/businessTools.ts";

/**
 * Showcase workflow for the Autopilot track: an inbound sales-inquiry email is
 * turned into a priced quote, a drafted reply, a human-approved send, and a CRM
 * record — fully autonomously, with one checkpoint before the customer is emailed.
 *
 * `salesInquiryPlan()` is the offline stand-in for the model's reasoning so the
 * demo and tests run with zero API cost. On Qwen, this plan is replaced by the
 * real model — the agent loop, tools, and approval gate are identical.
 */

export const SAMPLE_INQUIRY = `From: Dana Okafor <dana@brightloop.io>
Subject: Quote request — office refresh

Hi there,

We're Brightloop, a ~30-person company on a business account. We're refreshing the
office and would like a quote for 25 Workstation Pro laptops, 25 of your 27" 4K
monitors, and 25 Thunderbolt docks. Could you send pricing?

Thanks,
Dana`;

export function salesTools(): ToolRegistry {
  const reg = new ToolRegistry();
  for (const t of businessTools) reg.register(t);
  return reg;
}

const PRODUCT_HINTS: { re: RegExp; sku: string }[] = [
  { re: /workstation|laptop|notebook/i, sku: "WK-STD" },
  { re: /monitor|display|screen|4k/i, sku: "MON-27" },
  { re: /dock|thunderbolt|hub/i, sku: "DOCK-TB" },
  { re: /chair|ergonomic/i, sku: "CHAIR-ERG" },
];

function parseLineItems(text: string): { sku: string; quantity: number }[] {
  const items: { sku: string; quantity: number }[] = [];
  const seen = new Set<string>();
  const regex = /(\d{1,4})\s+([^,.;]+?)(?=,|\.|;|\band\b|\bplus\b|$)/gi;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text))) {
    const qty = parseInt(m[1], 10);
    const hint = PRODUCT_HINTS.find((h) => h.re.test(m![2]));
    if (hint && !seen.has(hint.sku)) {
      items.push({ sku: hint.sku, quantity: qty });
      seen.add(hint.sku);
    }
  }
  return items;
}

function renderQuoteEmail(quote: any): string {
  const lines = (quote?.lines ?? [])
    .map((l: any) => `  • ${l.quantity}× ${l.name} (${l.sku}) — $${l.lineTotal} (${l.discountPct}% off)`)
    .join("\n");
  return [
    "Hi Dana,",
    "",
    "Thanks for reaching out! Here's your quote for the office refresh:",
    "",
    lines,
    "",
    `Total: ${quote?.currency ?? "USD"} $${quote?.total} (business-tier pricing applied).`,
    "Everything listed is in stock and can ship this week.",
    "",
    "Happy to adjust quantities or add ergonomic chairs if useful.",
    "",
    "Best,",
    "Sales Team",
  ].join("\n");
}

let idc = 0;
function mkCall(name: string, args: Record<string, unknown>): ToolCall {
  return { id: `call_${++idc}`, name, arguments: args };
}

export function salesInquiryPlan(): MockPlan {
  return (messages: ChatMessage[]) => {
    const inquiry = messages.find((m) => m.role === "user")?.content ?? "";
    const tier = /enterprise/i.test(inquiry) ? "enterprise" : /business/i.test(inquiry) ? "business" : "standard";

    if (!hasToolResult(messages, "lookup_catalog")) {
      return { content: "Checking the catalog for the requested items.", toolCalls: [mkCall("lookup_catalog", { query: inquiry })] };
    }
    if (!hasToolResult(messages, "compute_quote")) {
      const items = parseLineItems(inquiry);
      return {
        content: `Pricing ${items.length} line items at the ${tier} tier.`,
        toolCalls: [mkCall("compute_quote", { customerTier: tier, items })],
      };
    }
    if (!hasToolResult(messages, "draft_reply")) {
      const quote = lastToolResult<any>(messages, "compute_quote");
      return {
        content: "Drafting the reply with the itemized quote.",
        toolCalls: [mkCall("draft_reply", { toName: "Dana", subject: "Your Brightloop quote", body: renderQuoteEmail(quote) })],
      };
    }
    if (!hasToolResult(messages, "send_reply")) {
      const draft = lastToolResult<any>(messages, "draft_reply");
      return {
        content: "The draft is ready — requesting approval before I email the customer.",
        toolCalls: [mkCall("send_reply", { to: "dana@brightloop.io", subject: draft?.subject, body: draft?.body })],
      };
    }
    if (!hasToolResult(messages, "log_to_crm")) {
      const quote = lastToolResult<any>(messages, "compute_quote");
      return {
        content: "Logging the opportunity to CRM.",
        toolCalls: [mkCall("log_to_crm", { customer: "Brightloop", stage: "quoted", amount: quote?.total })],
      };
    }

    const quote = lastToolResult<any>(messages, "compute_quote");
    const sendRes = lastToolResult<any>(messages, "send_reply");
    const sent = sendRes?.sent === true;
    return {
      content:
        `Done. Quoted Brightloop ${quote?.currency} $${quote?.total} across ${quote?.lines?.length} line items; ` +
        `${sent ? "sent the reply after human approval" : "held the reply (approval declined)"}; logged the opportunity to CRM.`,
      toolCalls: [],
    };
  };
}
