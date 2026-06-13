export type NavItem = {
  label: string;
  href: string;
  badge?: string;
};

export type NavSection = {
  title?: string;
  items: NavItem[];
};

export const primaryNav: NavItem[] = [
  { label: "Home", href: "/" },
  { label: "Customers", href: "/customers" },
  { label: "Inbox", href: "/inbox" },
  { label: "Schedule", href: "/schedule" },
  { label: "Price Book", href: "/price-book" },
  { label: "Maintenance Plans", href: "/maintenance-plans" },
  { label: "Reporting", href: "/reporting" },
  { label: "Settings", href: "/settings" },
];

export const customersSidebar: NavSection[] = [
  {
    items: [
      { label: "Customers", href: "/customers" },
      { label: "Jobs", href: "/customers/jobs" },
      { label: "Estimates", href: "/customers/estimates" },
      { label: "Leads", href: "/customers/leads" },
      { label: "Invoices", href: "/customers/invoices" },
    ],
  },
];

export const inboxSidebar: NavSection[] = [
  {
    title: "CHATS",
    items: [
      { label: "All comms", href: "/inbox" },
      { label: "Customers", href: "/inbox/customers" },
      { label: "Employees", href: "/inbox/employees" },
      { label: "AI team", href: "/inbox/ai-team" },
      { label: "Job inbox", href: "/inbox/job-inbox" },
    ],
  },
  {
    title: "CALLS",
    items: [
      { label: "Overview", href: "/inbox/calls" },
      { label: "Voice call log", href: "/inbox/voice-call-log" },
      { label: "HCP Assist", href: "/inbox/hcp-assist", badge: "Add on" },
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
      { label: "Jobs", href: "/reporting" },
      { label: "Estimates", href: "/reporting/estimates" },
      { label: "Leads", href: "/reporting/leads" },
      { label: "Voice", href: "/reporting/voice" },
      { label: "Service plans", href: "/reporting/service-plans" },
      { label: "Invoices", href: "/reporting/invoices" },
      { label: "Payments", href: "/reporting/payments" },
      { label: "Custom", href: "/reporting/custom" },
    ],
  },
];

export const settingsSidebar: NavSection[] = [
  {
    title: "GLOBAL SETTINGS",
    items: [
      { label: "Company", href: "/settings" },
      { label: "Billing", href: "/settings/billing" },
      { label: "Notifications", href: "/settings/notifications" },
      { label: "Refer a Friend", href: "/settings/refer" },
      { label: "Team & Permissions", href: "/settings/team" },
    ],
  },
  {
    title: "FEATURE CONFIGURATIONS",
    items: [
      { label: "Booking", href: "/settings/booking" },
      { label: "Leads", href: "/settings/leads" },
      { label: "Inbox", href: "/settings/inbox" },
      { label: "Customer Intake", href: "/settings/customer-intake" },
      { label: "Customer Portal", href: "/settings/customer-portal" },
      { label: "Estimates", href: "/settings/estimates" },
      { label: "Invoices", href: "/settings/invoices" },
    ],
  },
];

export function isNavActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href;
}

export function getPrimaryNavActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/customers") return pathname.startsWith("/customers");
  if (href === "/inbox") return pathname.startsWith("/inbox");
  if (href === "/price-book") return pathname.startsWith("/price-book");
  if (href === "/reporting") return pathname.startsWith("/reporting");
  if (href === "/settings") return pathname.startsWith("/settings");
  return pathname.startsWith(href);
}
