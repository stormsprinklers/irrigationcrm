import { isFieldRole } from "@/lib/employees";
import { STORM_AI_TOOLS } from "./tools";
import type { StormAiOpenAiTool } from "./types";

export const TECH_ASSIST_TOOL_NAMES = [
  "match_tech_issue",
  "start_tech_assist",
  "continue_tech_assist",
  "search_parts_info",
  "get_parts_info",
] as const;

const FIELD_TOOLS = new Set<string>(["get_technician_performance", ...TECH_ASSIST_TOOL_NAMES]);

const CSR_TOOLS = new Set<string>([
  "search_customers",
  "get_customer",
  "get_customer_history",
  "get_schedule",
  "get_availability",
  "get_technician",
  "get_invoice",
  "get_unpaid_invoices",
  "analyze_inbound_calls",
  "search_price_book",
  ...TECH_ASSIST_TOOL_NAMES,
]);

export function canUseTechAssist(role: string) {
  return (
    role === "ADMIN" ||
    role === "MANAGER" ||
    role === "CSR" ||
    isFieldRole(role)
  );
}

export function canUseStormAiTool(role: string, toolName: string) {
  if (role === "ADMIN" || role === "MANAGER") return true;
  if (isFieldRole(role)) return FIELD_TOOLS.has(toolName);
  if (role === "CSR") return CSR_TOOLS.has(toolName);
  if (TECH_ASSIST_TOOL_NAMES.includes(toolName as (typeof TECH_ASSIST_TOOL_NAMES)[number])) {
    return false;
  }
  return true;
}

export function stormAiToolsForRole(role: string): StormAiOpenAiTool[] {
  return STORM_AI_TOOLS.filter((tool) => canUseStormAiTool(role, tool.function.name));
}

export function stormAiCapabilityLines(role: string): string {
  if (role === "ADMIN" || role === "MANAGER") {
    return "You may use every available tool, including technician field workflows.";
  }
  if (isFieldRole(role)) {
    return "You may only use technician KPIs (yourself) and the technician assistant (diagnostic workflows plus parts info: match_tech_issue, start_tech_assist, continue_tech_assist, search_parts_info, get_parts_info).";
  }
  if (role === "CSR") {
    return "You may use customers, schedule, invoices, inbound call coaching (analyze_inbound_calls), price book, and the technician assistant (including parts info). You cannot use marketing, revenue, fleet, or company performance tools.";
  }
  return "Use only the tools provided. Technician assistant workflows are not available for your role.";
}
