import type { Tool } from "./registry.ts";

/**
 * A small, self-contained "business backend" plus the tools that operate on it.
 * In production these would hit a real catalog DB, pricing service, CRM, and mail
 * gateway; here they're in-memory so the project runs end-to-end out of the box.
 * The agent does not know or care — it sees tool schemas, not implementations.
 */

interface Product {
  sku: string;
  name: string;
  unitPrice: number;
  stock: number;
  keywords: string[];
}

const CATALOG: Product[] = [
  { sku: "WK-STD", name: "Workstation Pro 14\"", unitPrice: 1200, stock: 80, keywords: ["laptop", "workstation", "notebook", "computer"] },
  { sku: "MON-27", name: "27\" 4K Monitor", unitPrice: 380, stock: 140, keywords: ["monitor", "display", "screen", "4k"] },
  { sku: "DOCK-TB", name: "Thunderbolt Dock", unitPrice: 220, stock: 60, keywords: ["dock", "docking", "thunderbolt", "hub"] },
  { sku: "CHAIR-ERG", name: "Ergonomic Chair", unitPrice: 310, stock: 35, keywords: ["chair", "seat", "ergonomic"] },
];

/** Volume + tier discount policy. */
const TIER_DISCOUNT: Record<string, number> = { standard: 0, business: 0.05, enterprise: 0.1 };
function volumeDiscount(qty: number): number {
  if (qty >= 50) return 0.1;
  if (qty >= 20) return 0.06;
  if (qty >= 10) return 0.03;
  return 0;
}

/** Simulated "sent" mailbox so the demo/server can show what would go out. */
export const sentMail: { to: string; subject: string; body: string; at: string }[] = [];
/** Simulated CRM. */
export const crmRecords: Record<string, unknown>[] = [];

export const lookupCatalog: Tool = {
  schema: {
    name: "lookup_catalog",
    description: "Search the product catalog by free-text query. Returns matching SKUs with unit price and stock.",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "Product name or keywords, e.g. 'laptops and monitors'" } },
      required: ["query"],
    },
  },
  async run(args) {
    const q = String(args.query ?? "").toLowerCase();
    const matches = CATALOG.filter(
      (p) => p.keywords.some((k) => q.includes(k)) || q.includes(p.name.toLowerCase()) || q.includes(p.sku.toLowerCase()),
    );
    return {
      matches: (matches.length ? matches : CATALOG).map((p) => ({ sku: p.sku, name: p.name, unitPrice: p.unitPrice, stock: p.stock })),
    };
  },
};

export const computeQuote: Tool = {
  schema: {
    name: "compute_quote",
    description: "Compute a priced quote from line items, applying customer-tier and volume discounts. Verifies stock.",
    parameters: {
      type: "object",
      properties: {
        customerTier: { type: "string", enum: ["standard", "business", "enterprise"], description: "Customer pricing tier" },
        items: {
          type: "array",
          description: "Line items to quote",
          items: {
            type: "object",
            properties: { sku: { type: "string" }, quantity: { type: "number" } },
            required: ["sku", "quantity"],
          },
        },
      },
      required: ["items"],
    },
  },
  async run(args) {
    const tier = String(args.customerTier ?? "standard");
    const items = (args.items as { sku: string; quantity: number }[]) ?? [];
    const tierOff = TIER_DISCOUNT[tier] ?? 0;
    const lines = items.map((it) => {
      const product = CATALOG.find((p) => p.sku === it.sku);
      if (!product) return { sku: it.sku, error: "unknown SKU" };
      const qty = Number(it.quantity) || 0;
      const discount = Math.max(tierOff, volumeDiscount(qty));
      const gross = product.unitPrice * qty;
      const net = Math.round(gross * (1 - discount) * 100) / 100;
      return {
        sku: product.sku,
        name: product.name,
        quantity: qty,
        unitPrice: product.unitPrice,
        discountPct: Math.round(discount * 100),
        lineTotal: net,
        inStock: product.stock >= qty,
      };
    });
    const total = Math.round(lines.reduce((s, l) => s + (("lineTotal" in l ? l.lineTotal : 0) || 0), 0) * 100) / 100;
    return { tier, lines, total, currency: "USD" };
  },
};

export const draftReply: Tool = {
  schema: {
    name: "draft_reply",
    description: "Compose a professional email reply containing the quote. Does NOT send — returns the draft for review.",
    parameters: {
      type: "object",
      properties: {
        toName: { type: "string" },
        subject: { type: "string" },
        body: { type: "string", description: "Full email body, including the itemized quote and total." },
      },
      required: ["subject", "body"],
    },
  },
  async run(args) {
    return { subject: String(args.subject ?? ""), body: String(args.body ?? ""), toName: args.toName ?? null };
  },
};

export const sendReply: Tool = {
  // Irreversible, customer-facing → must pass the human checkpoint.
  requiresApproval: true,
  schema: {
    name: "send_reply",
    description: "Send the approved email reply to the customer. This contacts the customer and cannot be undone.",
    parameters: {
      type: "object",
      properties: {
        to: { type: "string", description: "Customer email address" },
        subject: { type: "string" },
        body: { type: "string" },
      },
      required: ["to", "subject", "body"],
    },
  },
  async run(args) {
    const record = { to: String(args.to ?? ""), subject: String(args.subject ?? ""), body: String(args.body ?? ""), at: new Date().toISOString() };
    sentMail.push(record);
    return { sent: true, to: record.to, at: record.at };
  },
};

export const logToCrm: Tool = {
  schema: {
    name: "log_to_crm",
    description: "Record the opportunity in the CRM for follow-up.",
    parameters: {
      type: "object",
      properties: {
        customer: { type: "string" },
        stage: { type: "string", enum: ["quoted", "won", "lost"] },
        amount: { type: "number" },
      },
      required: ["customer", "stage"],
    },
  },
  async run(args) {
    const record = { ...args, at: new Date().toISOString() };
    crmRecords.push(record);
    return { logged: true, id: `crm_${crmRecords.length}` };
  },
};

export const businessTools: Tool[] = [lookupCatalog, computeQuote, draftReply, sendReply, logToCrm];
