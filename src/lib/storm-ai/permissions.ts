import { isFieldRole } from "@/lib/employees";
import { STORM_AI_TOOLS } from "./tools";
import type { StormAiOpenAiTool } from "./types";

export const TECH_ASSIST_TOOL_NAMES = [
  "match_tech_issue",
  "get_active_tech_assist",
  "start_tech_assist",
  "continue_tech_assist",
  "search_parts_info",
  "get_parts_info",
] as const;

const POLICY_TOOL_NAMES = ["search_company_policies", "get_company_policy"] as const;

const CUSTOMER_AND_PRICE_TOOLS = [
  "search_customers",
  "get_customer",
  "get_customer_history",
  "search_price_book",
] as const;

const FIELD_CORE_TOOLS = [
  "get_technician_performance",
  ...TECH_ASSIST_TOOL_NAMES,
  ...POLICY_TOOL_NAMES,
] as const;

/** Service techs: field tools plus customer lookup and price book. Installers stay field-only. */
const TECH_TOOLS = new Set<string>([...FIELD_CORE_TOOLS, ...CUSTOMER_AND_PRICE_TOOLS]);

const INSTALLER_TOOLS = new Set<string>([...FIELD_CORE_TOOLS]);

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
  ...POLICY_TOOL_NAMES,
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
  if (role === "TECH") return TECH_TOOLS.has(toolName);
  if (role === "INSTALLER") return INSTALLER_TOOLS.has(toolName);
  if (role === "CSR") return CSR_TOOLS.has(toolName);
  if (TECH_ASSIST_TOOL_NAMES.includes(toolName as (typeof TECH_ASSIST_TOOL_NAMES)[number])) {
    return false;
  }
  return true;
}

export function stormAiToolsForRole(role: string): StormAiOpenAiTool[] {
  return STORM_AI_TOOLS.filter((tool) => canUseStormAiTool(role, tool.function.name));
}

export function stormAiCapabilityLines(role: string) {
  if (role === "ADMIN" || role === "MANAGER") {
    return "You may use every available tool, including technician field workflows and company policies.";
  }
  if (role === "TECH") {
    return "You may use technician KPIs (yourself), customers, price book, company policies, and the technician assistant (diagnostic workflows plus parts info: match_tech_issue, get_active_tech_assist, start_tech_assist, continue_tech_assist, search_parts_info, get_parts_info, search_customers, get_customer, get_customer_history, search_price_book, search_company_policies, get_company_policy). You cannot use marketing, revenue, fleet, or company-wide performance tools.";
  }
  if (role === "INSTALLER") {
    return "You may only use technician KPIs (yourself), company policies, and the technician assistant (diagnostic workflows plus parts info: match_tech_issue, get_active_tech_assist, start_tech_assist, continue_tech_assist, search_parts_info, get_parts_info, search_company_policies, get_company_policy). You cannot look up customers or the price book.";
  }
  if (role === "CSR") {
    return "You may use customers, schedule, invoices, inbound call coaching (analyze_inbound_calls), price book, company policies, and the technician assistant (including parts info). You cannot use marketing, revenue, fleet, or company performance tools.";
  }
  return "Use only the tools provided. Technician assistant workflows are not available for your role.";
}
