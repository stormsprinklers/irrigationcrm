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
      description:
        "Technician KPIs for a date range: average ticket, callback rate, 5-star review count, Google review share, jobs completed, and revenue. Look up by technicianId or name.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          technicianId: { type: "string" },
          name: { type: "string", description: "Technician display name if id is unknown" },
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
      description:
        "Company or customer outstanding invoice balance. Returns totalOutstanding (full AR: draft + sent + partial remaining balances). Do not sum the invoices sample.",
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
  {
    type: "function",
    function: {
      name: "get_marketing_metrics",
      description:
        "Marketing KPIs overall and per lead channel: ad spend, CPL, CAC, conversion rate, booking rate, average ticket, invoice revenue, ROAS. Optional channel filter (google_ads, google_lsa, meta_ads, organic, referral, gbp, direct).",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          channel: {
            type: "string",
            description: "Optional channel name such as Google LSA, Meta, organic, referral",
          },
          range: dateRangeProps,
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_maintenance_plan_metrics",
      description:
        "Maintenance plan recurring revenue: MRR, ARR, number of accounts on a plan, enrollment count, and breakdown by plan template.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_price_book",
      description:
        "Search the company price book for services and materials. Returns name, category, unit, and sell price. Use this for 'what do we charge for X' questions.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["query"],
        properties: {
          query: { type: "string", description: "Service or material name, SKU, or category" },
          type: {
            type: "string",
            enum: ["SERVICE", "MATERIAL"],
            description: "Optional filter",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_vehicles",
      description:
        "Fleet vehicles: mileage, oil/service due, open problems, and service history. Filter with focus needs_service or open_issues, or look up one vehicle by name, plate, or vehicleId.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          query: {
            type: "string",
            description: "Make, model, plate, or VIN search",
          },
          vehicleId: { type: "string" },
          focus: {
            type: "string",
            enum: ["all", "needs_service", "open_issues"],
          },
        },
      },
    },
  },
];
