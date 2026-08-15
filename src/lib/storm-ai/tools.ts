import type { StormAiOpenAiTool } from "./types";

const dateRangeProps = {
  type: "object",
  additionalProperties: false,
  properties: {
    preset: {
      type: "string",
      enum: ["today", "week", "month", "mtd", "ytd", "last30", "overall", "custom"],
    },
    start: { type: "string", description: "ISO date when preset is custom" },
    end: { type: "string", description: "ISO date when preset is custom" },
  },
};

export const STORM_AI_TOOLS: StormAiOpenAiTool[] = [
  {
    type: "function",
    function: {
      name: "search_customers",
      description: "Search customers by name, phone, email, city, or zip.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          query: { type: "string" },
          city: { type: "string" },
          zip: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_customer",
      description: "Get one customer profile and summary by id.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["customerId"],
        properties: { customerId: { type: "string" } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_customer_history",
      description: "Get recent visits, estimates, and invoices for a customer.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["customerId"],
        properties: { customerId: { type: "string" } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_schedule",
      description: "List scheduled visits in a date range. Field techs only see assigned visits.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          start: { type: "string", description: "ISO datetime" },
          end: { type: "string", description: "ISO datetime" },
          technicianId: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_availability",
      description: "Open booking slots plus a technician work schedule.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          technicianId: { type: "string" },
          days: { type: "number" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_technician",
      description: "Get a technician profile and service areas. Field techs may only load themselves.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: { technicianId: { type: "string" } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_technician_performance",
      description: "Technician KPI / performance cards for a date range.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          technicianId: { type: "string" },
          range: dateRangeProps,
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_revenue_summary",
      description:
        "Revenue and scheduled work for a range. Uses CRM KPIs and optional company monthly target.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: { range: dateRangeProps },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_business_performance",
      description: "Company or personal performance snapshot (KPI + schedule + insights when allowed).",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: { range: dateRangeProps },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_invoice",
      description: "Get one invoice. Only ADMIN and CSR roles can use this.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["invoiceId"],
        properties: { invoiceId: { type: "string" } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_unpaid_invoices",
      description: "List unpaid invoices. Only ADMIN and CSR roles can use this.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          customerId: { type: "string" },
          search: { type: "string" },
        },
      },
    },
  },
];
