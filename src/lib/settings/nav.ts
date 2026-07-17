import type { NavSection } from "@/config/navigation";
import {
  communicationsSettingsSidebar,
  companySettingsSidebar,
  customerSettingsSidebar,
  integrationsSettingsSidebar,
  isNavActive,
  jobSettingsSidebar,
  priceBookSettingsSidebar,
  settingsSidebar,
  teamSettingsSidebar,
  voiceSettingsSidebar,
} from "@/config/navigation";

export type SettingsSectionNav = {
  title: string;
  sections: NavSection[];
};

const SETTINGS_SECTIONS: Array<{
  title: string;
  match: (pathname: string) => boolean;
  sections: NavSection[];
}> = [
  {
    title: "Company",
    match: (pathname) =>
      pathname === "/settings" || pathname.startsWith("/settings/appearance"),
    sections: companySettingsSidebar,
  },
  {
    title: "Team",
    match: (pathname) =>
      ["/settings/employees", "/settings/compensation", "/settings/service-areas"].some(
        (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
      ),
    sections: teamSettingsSidebar,
  },
  {
    title: "Communications",
    match: (pathname) =>
      pathname.startsWith("/settings/notifications") || pathname.startsWith("/settings/inbox"),
    sections: communicationsSettingsSidebar,
  },
  {
    title: "Integrations",
    match: (pathname) =>
      pathname.startsWith("/settings/integrations") ||
      pathname.startsWith("/settings/serp-rankings") ||
      pathname.startsWith("/settings/migrations"),
    sections: integrationsSettingsSidebar,
  },
  {
    title: "Customer",
    match: (pathname) =>
      pathname.startsWith("/settings/booking") ||
      pathname.startsWith("/settings/customer-portal") ||
      pathname.startsWith("/settings/leads"),
    sections: customerSettingsSidebar,
  },
  {
    title: "Voice",
    match: (pathname) => pathname.startsWith("/settings/voice"),
    sections: voiceSettingsSidebar,
  },
  {
    title: "Price Book",
    match: (pathname) => pathname.startsWith("/settings/price-book"),
    sections: priceBookSettingsSidebar,
  },
  {
    title: "Job settings",
    match: (pathname) =>
      ["/settings/estimates", "/settings/checklists", "/settings/invoices", "/settings/maintenance"].some(
        (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
      ),
    sections: jobSettingsSidebar,
  },
];

export function resolveSettingsSection(pathname: string): SettingsSectionNav | null {
  for (const section of SETTINGS_SECTIONS) {
    if (section.match(pathname)) {
      return { title: section.title, sections: section.sections };
    }
  }
  return null;
}

export function settingsRootSections() {
  return settingsSidebar;
}

export function isSettingsRootItemActive(pathname: string, href: string, exact?: boolean, activePrefixes?: string[]) {
  return isNavActive(pathname, href, exact, activePrefixes);
}
