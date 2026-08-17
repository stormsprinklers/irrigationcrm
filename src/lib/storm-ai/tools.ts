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
        "Technician KPIs for a date range: average ticket, callback rate, 5-star review count, Google review share, jobs completed, and revenue. Omit name (or pass name all) to rank every active technician. Pass technicianId or name for one person.",
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
        "Paid-channel marketing KPIs: ad spend, CPL (spend ÷ Google/Meta/LSA conversions, never unpaid channels), CAC, CRM conversion/booking rates, average ticket, ROAS. Optional channel filter.",
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
      name: "analyze_inbound_calls",
      description:
        "Inbound call coaching: booking rates by employee and lead source, plus AI summaries and transcript excerpts. Use for why booking rate is low, how CSRs can improve, or what happened on calls. Optional filters: employee name, lead source, a single callId.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          range: dateRangeProps,
          employeeName: {
            type: "string",
            description: "Filter to calls answered by this employee",
          },
          leadSource: {
            type: "string",
            description: "Filter such as Google LSA, Google Ads, PPC, primary",
          },
          callId: {
            type: "string",
            description: "Load one call's full summary and transcript",
          },
          includeTranscripts: {
            type: "boolean",
            description: "Include short transcript excerpts from unbooked answered calls (default true)",
          },
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
  {
    type: "function",
    function: {
      name: "match_tech_issue",
      description:
        "Search technician assistant issues by title and description for a field problem (valve, solenoid, no water, zone, wiring, pressure, etc.). Returns matching issue id/title/description pairs only — never a full procedure. Then call start_tech_assist with the best issueId.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["query"],
        properties: {
          query: {
            type: "string",
            description: "Technician's symptom or issue description",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "start_tech_assist",
      description:
        "Start a technician assistant session for one matched issue. Returns only the first diagnostic (test, tips, options). Never dump the rest of the workflow.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["issueId"],
        properties: { issueId: { type: "string" } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "continue_tech_assist",
      description:
        "Advance the current technician assistant session with the technician's answer or measurement. Match their reply to one of the diagnostic options when provided. Returns only the next diagnostic or a final resolution.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["sessionId"],
        properties: {
          sessionId: { type: "string" },
          result: {
            type: "string",
            description:
              "Technician answer: yes/no, number, or the option label that best matches their reply",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_parts_info",
      description:
        "Search the technician parts knowledge base (sections of parts with visual/technical descriptions, photos, and manuals). Use when identifying a part from a photo or text, looking up a part number, wiring/specs, or finding a manual. After viewing a user photo, pass a detailed visual description as the query. Returns matching parts with short descriptions and photo URLs — never invent part data.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["query"],
        properties: {
          query: {
            type: "string",
            description:
              "Part name, number, manufacturer, visual description from a photo (shape, ports, labels, colors), or the symptom/component the tech is holding",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_parts_info",
      description:
        "Load full details for one parts-info entry: visual description, technical description, photo URLs, and manual (PDF or external URL). Call after search_parts_info when you need the complete write-up or manual. Share manualUrl with the tech when present.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["partId"],
        properties: {
          partId: { type: "string" },
        },
      },
    },
  },
];
