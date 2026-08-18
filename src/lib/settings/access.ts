import type { NavItem, NavSection } from "@/config/navigation";
import { isFieldRole } from "@/lib/employees";
import { canUseRolePreview, type RolePreviewUser } from "@/lib/role-preview";
import { canViewVehicles } from "@/lib/vehicles/permissions";

export type SettingsAccessMode = "hidden" | "read" | "write";

export function isCsrRole(role: string | null | undefined) {
  return role === "CSR";
}

/** CSR + field roles share the limited office nav (no marketing/reporting). */
export function isLimitedOfficeRole(role: string | null | undefined) {
  return role === "CSR" || isFieldRole(role ?? "");
}

export function canViewSettingsNav(role: string | null | undefined) {
  return Boolean(role) && !isFieldRole(role ?? "");
}

export function canViewMaintenancePlansNav(role: string | null | undefined) {
  return Boolean(role) && !isFieldRole(role ?? "");
}

/** Marketing module — CSRs and technicians should not see the tab or pages. */
export function canViewMarketing(role: string | null | undefined) {
  return Boolean(role) && !isLimitedOfficeRole(role);
}

/** Reporting module — CSRs and technicians should not see the tab or pages. */
export function canViewReporting(role: string | null | undefined) {
  return Boolean(role) && !isLimitedOfficeRole(role);
}

/** Company / communications / customer / visits writes (not appearance). */
export function canWriteCompanySettings(role: string | null | undefined) {
  return role === "ADMIN" || role === "MANAGER";
}

function normalizePath(pathname: string) {
  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.slice(0, -1);
  return pathname || "/";
}

function startsWithPath(pathname: string, prefix: string) {
  const path = normalizePath(pathname);
  const base = normalizePath(prefix);
  return path === base || path.startsWith(`${base}/`);
}

/**
 * Settings access for a path or nav href.
 * Uses the effective role so CSR preview matches a real CSR, except Role preview
 * which is gated on the true (DB) admin role.
 */
export function settingsPathAccess(
  pathname: string,
  user: RolePreviewUser | null | undefined
): SettingsAccessMode {
  const path = normalizePath(pathname);
  if (!user?.role) return "write";

  if (startsWithPath(path, "/settings/role-preview")) {
    return canUseRolePreview(user) ? "write" : "hidden";
  }

  if (!isCsrRole(user.role) && !isFieldRole(user.role)) return "write";

  if (isFieldRole(user.role)) {
    return "hidden";
  }

  if (path === "/settings") return "read";
  if (startsWithPath(path, "/settings/appearance")) return "write";
  if (startsWithPath(path, "/settings/holiday-lighting")) return "hidden";
  if (startsWithPath(path, "/settings/expense-cards")) return "hidden";
  if (startsWithPath(path, "/settings/storm-ai")) return "hidden";
  if (startsWithPath(path, "/settings/employees")) return "write";
  if (startsWithPath(path, "/settings/field-devices")) return "write";
  if (startsWithPath(path, "/settings/compensation")) return "hidden";
  if (startsWithPath(path, "/settings/service-areas")) return "write";
  if (
    startsWithPath(path, "/settings/notifications") ||
    startsWithPath(path, "/settings/campaign-links") ||
    startsWithPath(path, "/settings/media-library") ||
    startsWithPath(path, "/settings/inbox") ||
    startsWithPath(path, "/settings/voice")
  ) {
    return "read";
  }
  if (startsWithPath(path, "/settings/parts-suppliers")) return "read";
  if (
    startsWithPath(path, "/settings/integrations") ||
    startsWithPath(path, "/settings/serp-rankings") ||
    startsWithPath(path, "/settings/migrations")
  ) {
    return "hidden";
  }
  if (
    startsWithPath(path, "/settings/booking") ||
    startsWithPath(path, "/settings/customer-portal") ||
    startsWithPath(path, "/settings/leads") ||
    startsWithPath(path, "/settings/customer-intake")
  ) {
    return "read";
  }
  if (startsWithPath(path, "/settings/price-book")) return "hidden";
  if (startsWithPath(path, "/settings/maintenance")) return "hidden";
  if (
    startsWithPath(path, "/settings/estimates") ||
    startsWithPath(path, "/settings/checklists") ||
    startsWithPath(path, "/settings/invoices")
  ) {
    return "read";
  }
  if (startsWithPath(path, "/settings/billing") || startsWithPath(path, "/settings/refer")) {
    return "hidden";
  }

  return "read";
}

export function isSettingsPathHidden(
  pathname: string,
  user: RolePreviewUser | null | undefined
) {
  return settingsPathAccess(pathname, user) === "hidden";
}

export function canWriteSettingsPath(
  pathname: string,
  user: RolePreviewUser | null | undefined
) {
  return settingsPathAccess(pathname, user) === "write";
}

function filterNavItems(
  items: NavItem[],
  user: RolePreviewUser | null | undefined
): NavItem[] {
  return items
    .filter((item) => settingsPathAccess(item.href, user) !== "hidden")
    .map((item) => ({
      ...item,
      children: item.children ? filterNavItems(item.children, user) : undefined,
    }));
}

export function filterSettingsNavForUser(
  sections: NavSection[],
  user: RolePreviewUser | null | undefined
): NavSection[] {
  return sections.map((section) => ({
    ...section,
    items: filterNavItems(section.items, user),
  }));
}

/** Hide marketing / reporting / restricted settings pages from global search. */
export function canSearchCrmPage(
  href: string,
  user: RolePreviewUser | null | undefined
) {
  if (!user?.role) return false;
  if (href === "/marketing" || href.startsWith("/marketing/")) {
    return canViewMarketing(user.role);
  }
  if (href === "/reporting" || href.startsWith("/reporting/")) {
    return canViewReporting(user.role);
  }
  if (href === "/vehicles" || href.startsWith("/vehicles/")) {
    return canViewVehicles(user.role);
  }
  if (href === "/maintenance-plans" || href.startsWith("/maintenance-plans/")) {
    return canViewMaintenancePlansNav(user.role);
  }
  if (href === "/settings" || href.startsWith("/settings/")) {
    return settingsPathAccess(href, user) !== "hidden";
  }
  if (isFieldRole(user.role)) {
    if (
      href.startsWith("/inbox/voice") ||
      href.startsWith("/inbox/leads") ||
      href.startsWith("/inbox/social") ||
      href.startsWith("/inbox/compose") ||
      href.startsWith("/inbox/reviews")
    ) {
      return false;
    }
  }
  return true;
}

export function filterInboxSidebarForUser(
  sections: NavSection[],
  role: string | null | undefined
): NavSection[] {
  if (!isFieldRole(role ?? "")) return sections;
  return sections.map((section) => ({
    ...section,
    items: section.items.filter((item) => item.href.startsWith("/inbox/sms")),
  }));
}
