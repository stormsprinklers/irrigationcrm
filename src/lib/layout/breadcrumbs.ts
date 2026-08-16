/**
 * Hierarchical breadcrumb label → href map.
 * Walk crumbs in order so ambiguous labels (e.g. Marketing under Reporting vs top-level) resolve correctly.
 */

export type BreadcrumbNode = {
  href?: string;
  children?: Record<string, BreadcrumbNode>;
};

function normKey(label: string) {
  return label.trim().toLowerCase();
}

function node(
  href: string | undefined,
  children?: Record<string, BreadcrumbNode>
): BreadcrumbNode {
  return { href, children };
}

/** Build a case-insensitive children map. */
function kids(entries: Record<string, BreadcrumbNode>): Record<string, BreadcrumbNode> {
  const out: Record<string, BreadcrumbNode> = {};
  for (const [k, v] of Object.entries(entries)) {
    out[normKey(k)] = v;
  }
  return out;
}

const BREADCRUMB_ROOT: Record<string, BreadcrumbNode> = kids({
  Home: node("/home"),
  Customers: node("/customers", kids({
    "All Customers": node("/customers"),
    Visits: node("/customers/jobs"),
    Estimates: node("/customers/estimates"),
    Leads: node("/customers/leads"),
    Invoices: node("/customers/invoices"),
  })),
  Inbox: node("/inbox", kids({
    Voice: node("/inbox/voice/desk", kids({
      "CSR Desk": node("/inbox/voice/desk"),
    })),
    SMS: node("/inbox/sms/customers"),
    Leads: node("/inbox/leads"),
    "Social DMs": node("/inbox/social"),
  })),
  Schedule: node("/schedule"),
  "Maintenance Plans": node("/maintenance-plans", kids({
    Templates: node("/maintenance-plans/templates", kids({
      New: node("/maintenance-plans/templates/new"),
      Edit: node("/maintenance-plans/templates"),
    })),
  })),
  "Holiday Lighting": node("/holiday-lighting/quote", kids({
    Quote: node("/holiday-lighting/quote"),
    "New quote": node("/holiday-lighting/quote/new"),
  })),
  "Holiday lighting": node("/holiday-lighting/quote", kids({
    Quote: node("/holiday-lighting/quote"),
    "New quote": node("/holiday-lighting/quote/new"),
  })),
  Marketing: node("/marketing", kids({
    Overview: node("/marketing"),
    Campaigns: node("/marketing/campaigns", kids({
      New: node("/marketing/campaigns/new"),
    })),
    "Social Media": node("/marketing/social"),
    SEO: node("/marketing/seo"),
    Ads: node("/marketing/ads"),
    "Google Business Profile": node("/marketing/google-business"),
    Referrals: node("/marketing/referrals"),
    "Google OAuth verification preview": node("/marketing/google-oauth-demo"),
  })),
  Reporting: node("/reporting", kids({
    "KPI Dashboard": node("/reporting"),
    "Business insights": node("/reporting/insights"),
    "Tech Performance": node("/reporting/tech-performance"),
    Financial: node("/reporting/financial"),
    CSR: node("/reporting/csr"),
    Estimates: node("/reporting/estimates"),
    Leads: node("/reporting/leads"),
    Marketing: node("/reporting/marketing"),
    Voice: node("/reporting/voice"),
    "Service plans": node("/reporting/service-plans"),
    Invoices: node("/reporting/invoices"),
    Payments: node("/reporting/payments"),
    Custom: node("/reporting/custom"),
  })),
  Settings: node("/settings", kids({
    Company: node("/settings"),
    Appearance: node("/settings/appearance"),
    "Storm AI": node("/settings/storm-ai", kids({
      General: node("/settings/storm-ai"),
      "Technician Assistant": node("/settings/storm-ai/technician-assistant"),
    })),
    "Holiday lighting": node("/settings/holiday-lighting"),
    "Company Expense Cards": node("/settings/expense-cards"),
    Team: node("/settings/employees"),
    Employees: node("/settings/employees"),
    "Field devices": node("/settings/field-devices"),
    Compensation: node("/settings/compensation"),
    "Service areas": node("/settings/service-areas"),
    Communications: node("/settings/notifications"),
    Notifications: node("/settings/notifications"),
    Inbox: node("/settings/inbox"),
    Voice: node("/settings/voice", kids({
      Overview: node("/settings/voice"),
      Numbers: node("/settings/voice/numbers"),
      "Phone numbers": node("/settings/voice/numbers"),
      "Call flows": node("/settings/voice/flows"),
      "Audio clips": node("/settings/voice/clips"),
      "Agent groups": node("/settings/voice/groups"),
      "Business hours": node("/settings/voice/hours"),
    })),
    Integrations: node("/settings/integrations", kids({
      Overview: node("/settings/integrations"),
      Slack: node("/settings/integrations/slack"),
      "Meta webhooks": node("/settings/integrations/meta"),
      "Google Business Profile": node("/settings/integrations/google-business"),
      "Google Ads": node("/settings/integrations/google-ads"),
      "Meta Ads": node("/settings/integrations/meta-ads"),
      Rachio: node("/settings/integrations/rachio"),
      "Apple demo": node("/settings/integrations/apple-demo"),
    })),
    Customer: node("/settings/booking", kids({
      Booking: node("/settings/booking"),
      "Customer Portal": node("/settings/customer-portal"),
      "Customer portal": node("/settings/customer-portal"),
      Offers: node("/settings/customer-portal/offers"),
      "Lead Sources": node("/settings/leads"),
    })),
    "Customer Portal": node("/settings/customer-portal", kids({
      Offers: node("/settings/customer-portal/offers"),
    })),
    Booking: node("/settings/booking"),
    "Lead Sources": node("/settings/leads"),
    "Price Book": node("/settings/price-book", kids({
      Overview: node("/settings/price-book"),
      "Labor Rates": node("/settings/price-book/labor-rates"),
      "Material Markups": node("/settings/price-book/material-markups"),
      "Bulk Adjust": node("/settings/price-book/bulk-adjust"),
    })),
    Visits: node("/settings/estimates", kids({
      Estimates: node("/settings/estimates"),
      Checklists: node("/settings/checklists"),
      Invoices: node("/settings/invoices"),
    })),
    Estimates: node("/settings/estimates"),
    Checklists: node("/settings/checklists"),
    Invoices: node("/settings/invoices"),
    Billing: node("/settings/billing"),
    Suppliers: node("/settings/parts-suppliers"),
    "Customer Intake": node("/settings/customer-intake"),
    "Refer a Friend": node("/settings/refer"),
  })),
  "Price book": node("/price-book", kids({
    Services: node("/price-book"),
    Materials: node("/price-book/materials"),
    "Pricing forms": node("/price-book/pricing-forms"),
    "Estimate Templates": node("/price-book/estimate-templates"),
    Discounts: node("/price-book/discounts"),
  })),
  "Price Book": node("/price-book", kids({
    Services: node("/price-book"),
    Materials: node("/price-book/materials"),
    "Pricing forms": node("/price-book/pricing-forms"),
    "Estimate Templates": node("/price-book/estimate-templates"),
    Discounts: node("/price-book/discounts"),
  })),
  Hiring: node("/hiring", kids({
    Applicants: node("/hiring"),
    Setup: node("/hiring/setup"),
  })),
  Vehicles: node("/vehicles", kids({
    Fleet: node("/vehicles"),
    "Add vehicle": node("/vehicles/new"),
  })),
  Timesheets: node("/timesheets"),
  Campaigns: node("/campaigns", kids({
    New: node("/campaigns/new"),
  })),
  "Expense card": node("/expense-card"),
});

export type BreadcrumbInput = string | { label: string; href?: string | null };

export type ResolvedBreadcrumb = {
  label: string;
  href: string | null;
};

/**
 * Resolve breadcrumb labels to hrefs using hierarchical context.
 * Explicit `{ label, href }` entries win; unknown dynamic labels stay unlinked.
 */
export function resolveBreadcrumbs(items: BreadcrumbInput[]): ResolvedBreadcrumb[] {
  let level: Record<string, BreadcrumbNode> | undefined = BREADCRUMB_ROOT;
  const resolved: ResolvedBreadcrumb[] = [];

  for (const item of items) {
    if (typeof item === "object") {
      const label = item.label;
      const href = item.href ?? null;
      resolved.push({ label, href: href || null });
      // Keep walking if this label exists in the tree (for following crumbs).
      const child: BreadcrumbNode | undefined = level?.[normKey(label)];
      level = child?.children;
      continue;
    }

    const label = item;
    const child: BreadcrumbNode | undefined = level?.[normKey(label)];
    resolved.push({
      label,
      href: child?.href ?? null,
    });
    level = child?.children;
  }

  return resolved;
}
