export type NavItem = {
  label: string;
  href: string;
  badge?: string;
  /** When true, only highlight on an exact pathname match (not child routes). */
  exact?: boolean;
  /** Extra path prefixes that keep this item active (for grouped settings). */
  activePrefixes?: string[];
  /** Nested links shown when this item is expanded (single expandable sidebar). */
  children?: NavItem[];
};

export type NavSection = {
  title?: string;
  items: NavItem[];
};

export const primaryNav: NavItem[] = [
  { label: "Home", href: "/home" },
  { label: "Customers", href: "/customers" },
  { label: "Inbox", href: "/inbox" },
  { label: "Schedule", href: "/schedule" },
  { label: "Maintenance Plans", href: "/maintenance-plans" },
  { label: "Marketing", href: "/marketing" },
  { label: "Reporting", href: "/reporting" },
  { label: "Settings", href: "/settings" },
];

/** Secondary tools nested under the top-nav "Other" dropdown. */
export const otherNav: NavItem[] = [
  { label: "Price Book", href: "/price-book" },
  { label: "Hiring", href: "/hiring" },
  { label: "Vehicles", href: "/vehicles" },
  { label: "Timesheets", href: "/timesheets" },
];

export const vehiclesSidebar: NavSection[] = [
  {
    items: [
      { label: "Fleet", href: "/vehicles", exact: true },
      { label: "Add vehicle", href: "/vehicles/new" },
    ],
  },
];

export const hiringSidebar: NavSection[] = [
  {
    items: [
      { label: "Applicants", href: "/hiring" },
      { label: "Setup", href: "/hiring/setup" },
    ],
  },
];

export const customerSidebar: NavSection[] = [
  {
    items: [
      { label: "Customers", href: "/customers" },
      { label: "Visits", href: "/customers/jobs" },
      { label: "Estimates", href: "/customers/estimates" },
      { label: "Leads", href: "/customers/leads" },
      { label: "Invoices", href: "/customers/invoices" },
    ],
  },
];

export const inboxSidebar: NavSection[] = [
  {
    items: [
      { label: "CSR Desk", href: "/inbox/voice/desk" },
      {
        label: "SMS",
        href: "/inbox/sms/customers",
        activePrefixes: ["/inbox/sms"],
      },
      { label: "Leads", href: "/inbox/leads" },
      {
        label: "Social DMs",
        href: "/inbox/social",
        activePrefixes: ["/inbox/social"],
      },
    ],
  },
];

export const priceBookSidebar: NavSection[] = [
  {
    items: [
      { label: "Services", href: "/price-book" },
      { label: "Materials", href: "/price-book/materials" },
      { label: "Pricing forms", href: "/price-book/pricing-forms" },
      { label: "Estimate Templates", href: "/price-book/estimate-templates" },
      { label: "Discounts", href: "/price-book/discounts", badge: "New" },
    ],
  },
];

export const reportingSidebar: NavSection[] = [
  {
    items: [{ label: "KPI Dashboard", href: "/reporting" }],
  },
  {
    items: [{ label: "Business insights", href: "/reporting/insights", badge: "New" }],
  },
  {
    title: "DASHBOARDS",
    items: [
      { label: "Tech Performance", href: "/reporting/tech-performance" },
      { label: "Financial", href: "/reporting/financial" },
      { label: "CSR", href: "/reporting/csr" },
    ],
  },
  {
    title: "ALL REPORTS",
    items: [
      { label: "Estimates", href: "/reporting/estimates" },
      { label: "Leads", href: "/reporting/leads" },
      { label: "Marketing", href: "/reporting/marketing" },
      { label: "Voice", href: "/reporting/voice" },
      { label: "Service plans", href: "/reporting/service-plans" },
      { label: "Invoices", href: "/reporting/invoices" },
      { label: "Payments", href: "/reporting/payments" },
      { label: "Custom", href: "/reporting/custom" },
    ],
  },
];

export const marketingSidebar: NavSection[] = [
  {
    items: [
      { label: "Overview", href: "/marketing" },
      { label: "Campaigns", href: "/marketing/campaigns" },
      { label: "Social Media", href: "/marketing/social" },
      { label: "SEO", href: "/marketing/seo" },
      { label: "Ads", href: "/marketing/ads" },
      { label: "Google Business Profile", href: "/marketing/google-business" },
      { label: "Referrals", href: "/marketing/referrals" },
    ],
  },
];

export const companySettingsSidebar: NavSection[] = [
  {
    items: [
      { label: "Company details", href: "/settings", exact: true },
      { label: "Appearance", href: "/settings/appearance" },
      { label: "Company Expense Cards", href: "/settings/expense-cards" },
    ],
  },
];

export const teamSettingsSidebar: NavSection[] = [
  {
    items: [
      { label: "Employees", href: "/settings/employees" },
      { label: "Compensation", href: "/settings/compensation" },
      { label: "Service areas", href: "/settings/service-areas" },
    ],
  },
];

export const voiceSettingsSidebar: NavSection[] = [
  {
    items: [
      { label: "Overview", href: "/settings/voice" },
      { label: "Phone numbers", href: "/settings/voice/numbers" },
      { label: "Call flows", href: "/settings/voice/flows" },
      { label: "Audio clips", href: "/settings/voice/clips" },
      { label: "Agent groups", href: "/settings/voice/groups" },
      { label: "Business hours", href: "/settings/voice/hours" },
    ],
  },
];

export const communicationsSettingsSidebar: NavSection[] = [
  {
    items: [
      { label: "Notifications", href: "/settings/notifications" },
      { label: "Inbox", href: "/settings/inbox" },
      { label: "Voice overview", href: "/settings/voice", exact: true },
      { label: "Phone numbers", href: "/settings/voice/numbers" },
      { label: "Call flows", href: "/settings/voice/flows" },
      { label: "Audio clips", href: "/settings/voice/clips" },
      { label: "Agent groups", href: "/settings/voice/groups" },
      { label: "Business hours", href: "/settings/voice/hours" },
    ],
  },
];

export const customerSettingsSidebar: NavSection[] = [
  {
    items: [
      { label: "Booking", href: "/settings/booking" },
      { label: "Customer portal", href: "/settings/customer-portal" },
      { label: "Lead Sources", href: "/settings/leads" },
    ],
  },
];

export const integrationsSettingsSidebar: NavSection[] = [
  {
    items: [
      { label: "Overview", href: "/settings/integrations", exact: true },
      { label: "Slack", href: "/settings/integrations/slack" },
      { label: "Meta webhooks", href: "/settings/integrations/meta" },
      { label: "Google Business Profile", href: "/settings/integrations/google-business" },
      { label: "Google Ads", href: "/settings/integrations/google-ads" },
      { label: "Meta Ads", href: "/settings/integrations/meta-ads" },
      { label: "Rachio", href: "/settings/integrations/rachio" },
      { label: "Apple demo", href: "/settings/integrations/apple-demo" },
      { label: "Search rankings", href: "/settings/integrations/serp-rankings" },
      { label: "Data migration", href: "/settings/integrations/migrations/housecall-pro" },
    ],
  },
];

export const jobSettingsSidebar: NavSection[] = [
  {
    items: [
      { label: "Estimates", href: "/settings/estimates" },
      { label: "Checklists", href: "/settings/checklists" },
      { label: "Invoices", href: "/settings/invoices" },
    ],
  },
];

export const priceBookSettingsSidebar: NavSection[] = [
  {
    items: [
      { label: "Overview", href: "/settings/price-book" },
      { label: "Labor Rates", href: "/settings/price-book/labor-rates" },
      { label: "Material Markups", href: "/settings/price-book/material-markups" },
      { label: "Bulk Adjust", href: "/settings/price-book/bulk-adjust" },
    ],
  },
];

/** Single expandable Settings sidebar — no nested second menu. */
export const settingsSidebar: NavSection[] = [
  {
    items: [
      {
        label: "Company",
        href: "/settings",
        exact: true,
        activePrefixes: ["/settings/appearance", "/settings/expense-cards"],
        children: companySettingsSidebar[0]!.items,
      },
      {
        label: "Team",
        href: "/settings/employees",
        activePrefixes: [
          "/settings/employees",
          "/settings/compensation",
          "/settings/service-areas",
        ],
        children: teamSettingsSidebar[0]!.items,
      },
      {
        label: "Communications",
        href: "/settings/notifications",
        activePrefixes: [
          "/settings/notifications",
          "/settings/inbox",
          "/settings/voice",
        ],
        children: communicationsSettingsSidebar[0]!.items,
      },
      { label: "Suppliers", href: "/settings/parts-suppliers" },
      {
        label: "Integrations",
        href: "/settings/integrations",
        activePrefixes: [
          "/settings/integrations",
          "/settings/serp-rankings",
          "/settings/migrations",
        ],
        children: integrationsSettingsSidebar[0]!.items,
      },
      {
        label: "Customer",
        href: "/settings/booking",
        activePrefixes: [
          "/settings/booking",
          "/settings/customer-portal",
          "/settings/leads",
        ],
        children: customerSettingsSidebar[0]!.items,
      },
      {
        label: "Price Book",
        href: "/settings/price-book",
        children: priceBookSettingsSidebar[0]!.items,
      },
      {
        label: "Visits",
        href: "/settings/estimates",
        activePrefixes: [
          "/settings/estimates",
          "/settings/checklists",
          "/settings/invoices",
        ],
        children: jobSettingsSidebar[0]!.items,
      },
    ],
  },
];

export function isNavActive(
  pathname: string,
  href: string,
  exact?: boolean,
  activePrefixes?: string[]
) {
  if (activePrefixes?.length) {
    for (const prefix of activePrefixes) {
      if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return true;
    }
  }
  if (href === "/home") return pathname === "/home";
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function getPrimaryNavActive(pathname: string, href: string) {
  if (href === "/home") return pathname === "/home";
  if (href === "/customers") return pathname.startsWith("/customers");
  if (href === "/inbox") return pathname.startsWith("/inbox");
  if (href === "/price-book") return pathname.startsWith("/price-book");
  if (href === "/marketing") return pathname.startsWith("/marketing");
  if (href === "/hiring") return pathname.startsWith("/hiring");
  if (href === "/vehicles") return pathname.startsWith("/vehicles");
  if (href === "/campaigns") return pathname.startsWith("/campaigns") || pathname.startsWith("/marketing");
  if (href === "/reporting") return pathname.startsWith("/reporting");
  if (href === "/timesheets") return pathname.startsWith("/timesheets");
  if (href === "/settings") return pathname.startsWith("/settings");
  return pathname.startsWith(href);
}

export function isOtherNavActive(pathname: string, items: NavItem[] = otherNav) {
  return items.some((item) => getPrimaryNavActive(pathname, item.href));
}

export function getInboxSectionActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export { customerSidebar as customersSidebar };
