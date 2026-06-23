import type { MockPlan } from "../llm/mock.ts";
import type { ToolRegistry } from "../tools/registry.ts";
import { SAMPLE_INQUIRY, salesInquiryPlan, salesTools } from "./salesInquiry.ts";
import { SAMPLE_ALERT, incidentPlan, incidentTools } from "./incidentResponse.ts";

/**
 * Scenario registry. Each scenario is the SAME agent engine with a different tool
 * set + sample task — demonstrating that Autopilot generalizes across domains. The
 * `plan()` is only used by the offline mock provider; on Qwen the real model drives.
 */
export interface Scenario {
  key: string;
  label: string;
  sampleTask: string;
  tools: () => ToolRegistry;
  plan: () => MockPlan;
}

export const SCENARIOS: Record<string, Scenario> = {
  sales: { key: "sales", label: "Sales inquiry → quote", sampleTask: SAMPLE_INQUIRY, tools: salesTools, plan: salesInquiryPlan },
  incident: { key: "incident", label: "Incident alert → remediation", sampleTask: SAMPLE_ALERT, tools: incidentTools, plan: incidentPlan },
};

export function getScenario(key?: string): Scenario {
  return SCENARIOS[key ?? "sales"] ?? SCENARIOS.sales;
}
