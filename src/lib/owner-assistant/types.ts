export const OWNER_ASSISTANT_VOICES = ["alloy", "ash", "ballad", "coral", "echo", "sage", "shimmer", "verse"] as const;
export type OwnerAssistantVoice = (typeof OWNER_ASSISTANT_VOICES)[number];

export const OWNER_ASSISTANT_TOOL_NAMES = [
  "list_companies",
  "list_employees",
  "search_customers",
  "get_customer",
  "get_customer_history",
  "get_schedule",
  "get_availability",
  "resolve_visit_time",
  "get_business_performance",
  "get_marketing_metrics",
  "analyze_inbound_calls",
  "create_customer",
  "create_visit",
  "reschedule_visit",
  "cancel_visit",
  "add_customer_note",
] as const;
export type OwnerAssistantToolName = (typeof OWNER_ASSISTANT_TOOL_NAMES)[number];

const company = { companyId: { type: "string", description: "Company id from list_companies" } };
export const OWNER_ASSISTANT_TOOLS = [
  { name: "list_companies", description: "List the companies this owner is allowed to access.", properties: {}, required: [] },
  { name: "list_employees", description: "List or search active employees in one company so employee names can be resolved without asking the owner for internal IDs.", properties: { ...company, query: { type: "string", description: "Optional employee name or email search" } }, required: ["companyId"] },
  { name: "search_customers", description: "Search customers in one company.", properties: { ...company, query: { type: "string" }, city: { type: "string" }, zip: { type: "string" } }, required: ["companyId"] },
  { name: "get_customer", description: "Get a customer profile.", properties: { ...company, customerId: { type: "string" } }, required: ["companyId", "customerId"] },
  { name: "get_customer_history", description: "Get customer visit, estimate, and invoice history.", properties: { ...company, customerId: { type: "string" } }, required: ["companyId", "customerId"] },
  { name: "get_schedule", description: "Get scheduled visits.", properties: { ...company, start: { type: "string" }, end: { type: "string" }, technicianId: { type: "string" } }, required: ["companyId"] },
  { name: "get_availability", description: "Get open scheduling slots.", properties: { ...company, technicianId: { type: "string" }, days: { type: "number" } }, required: ["companyId"] },
  { name: "resolve_visit_time", description: "Validate a proposed future visit time and return its authoritative weekday, full local date, time, and company timezone. Always use this before asking the owner to confirm a new or rescheduled visit; never calculate a weekday yourself.", properties: { ...company, startAt: { type: "string", description: "Future RFC 3339 timestamp with an explicit Z or UTC offset" }, endAt: { type: "string", description: "Future RFC 3339 timestamp with an explicit Z or UTC offset" } }, required: ["companyId", "startAt", "endAt"] },
  { name: "get_business_performance", description: "Get business KPI and schedule insights without changing data.", properties: { ...company, range: { type: "object", additionalProperties: true } }, required: ["companyId"] },
  { name: "get_marketing_metrics", description: "Get marketing performance insights without changing data.", properties: { ...company, channel: { type: "string" }, range: { type: "object", additionalProperties: true } }, required: ["companyId"] },
  { name: "analyze_inbound_calls", description: "Analyze inbound call and booking performance.", properties: { ...company, employeeName: { type: "string" }, leadSource: { type: "string" }, range: { type: "object", additionalProperties: true } }, required: ["companyId"] },
  { name: "create_customer", description: "Create a customer only after the owner explicitly confirms the details.", properties: { ...company, confirmed: { type: "boolean" }, name: { type: "string" }, phone: { type: "string" }, email: { type: "string" }, address: { type: "string" }, city: { type: "string" }, state: { type: "string" }, zip: { type: "string" }, leadSource: { type: "string" } }, required: ["companyId", "confirmed", "name"] },
  { name: "create_visit", description: "Create a future visit only after the owner explicitly confirms company, customer, full calendar date and year, local time, company timezone, title, and employee assignments. Resolve named employees with list_employees or pass their names directly. Existing CRM notification automations may notify the customer.", properties: { ...company, confirmed: { type: "boolean" }, customerId: { type: "string" }, propertyId: { type: "string" }, title: { type: "string" }, startAt: { type: "string", description: "Future RFC 3339 timestamp with an explicit Z or UTC offset, for example 2026-11-21T09:00:00-07:00" }, endAt: { type: "string", description: "Future RFC 3339 timestamp with an explicit Z or UTC offset" }, division: { type: "string", enum: ["SERVICE", "INSTALL", "HOLIDAY_LIGHTS"] }, assignedEmployeeNames: { type: "array", items: { type: "string" }, description: "Employee names exactly as the owner provided them" }, assignedUserIds: { type: "array", items: { type: "string" }, description: "Employee IDs returned by list_employees; never ask the owner for these" }, assignedUserId: { type: "string", description: "Legacy single employee ID returned by list_employees" }, notes: { type: "string" } }, required: ["companyId", "confirmed", "customerId", "title", "startAt", "endAt"] },
  { name: "reschedule_visit", description: "Move a scheduled visit to a new future time only after the owner explicitly confirms the visit, full calendar date and year, local start/end time, company timezone, and that existing CRM notification automations may notify the customer. Find the visit with get_schedule; never ask the owner for an internal visit ID.", properties: { ...company, confirmed: { type: "boolean" }, visitId: { type: "string", description: "Visit ID returned by get_schedule" }, startAt: { type: "string", description: "Future RFC 3339 timestamp with an explicit Z or UTC offset" }, endAt: { type: "string", description: "Future RFC 3339 timestamp with an explicit Z or UTC offset" } }, required: ["companyId", "confirmed", "visitId", "startAt", "endAt"] },
  { name: "cancel_visit", description: "Cancel a scheduled visit only after the owner explicitly confirms the company, customer/visit, scheduled date and time, and that existing CRM notification automations may notify the customer. Find the visit with get_schedule; never ask the owner for an internal visit ID. This keeps the visit record and marks it cancelled.", properties: { ...company, confirmed: { type: "boolean" }, visitId: { type: "string", description: "Visit ID returned by get_schedule" }, reason: { type: "string", description: "Optional internal cancellation reason" } }, required: ["companyId", "confirmed", "visitId"] },
  { name: "add_customer_note", description: "Add an internal customer note only after explicit owner confirmation.", properties: { ...company, confirmed: { type: "boolean" }, customerId: { type: "string" }, body: { type: "string" } }, required: ["companyId", "confirmed", "customerId", "body"] },
].map((tool) => ({
  type: "function" as const,
  name: tool.name,
  description: tool.description,
  parameters: { type: "object", additionalProperties: false, properties: tool.properties, required: tool.required },
}));
