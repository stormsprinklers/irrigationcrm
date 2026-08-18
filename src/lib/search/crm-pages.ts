import {
  customerSidebar,
  hiringSidebar,
  inboxSidebar,
  marketingSidebar,
  otherNav,
  priceBookSidebar,
  primaryNav,
  reportingSidebar,
  settingsSidebar,
  vehiclesSidebar,
  type NavItem,
} from "@/config/navigation";

export type CrmPageHit = {
  id: string;
  type: "page";
  title: string;
  href: string;
  /** Breadcrumb-style path for context, e.g. "Settings › Team" */
  path: string;
};

function walk(
  items: NavItem[],
  ancestors: string[],
  out: Map<string, CrmPageHit>
) {
  for (const item of items) {
    const labels = [...ancestors, item.label];
    const path = labels.join(" › ");
    if (!out.has(item.href)) {
      out.set(item.href, {
        id: `page:${item.href}`,
        type: "page",
        title: item.label,
        href: item.href,
        path: ancestors.length ? path : item.label,
      });
    }
    if (item.children?.length) {
      walk(item.children, labels, out);
    }
  }
}

/** Flattened CRM pages for global search (deduped by href). */
export function listSearchableCrmPages(): CrmPageHit[] {
  const out = new Map<string, CrmPageHit>();

  walk(primaryNav, [], out);
  walk(otherNav, [], out);
  walk(customerSidebar.flatMap((s) => s.items), ["Customers"], out);
  walk(inboxSidebar.flatMap((s) => s.items), ["Inbox"], out);
  walk(priceBookSidebar.flatMap((s) => s.items), ["Price Book"], out);
  walk(reportingSidebar.flatMap((s) => s.items), ["Reporting"], out);
  walk(marketingSidebar.flatMap((s) => s.items), ["Marketing"], out);
  walk(hiringSidebar.flatMap((s) => s.items), ["Hiring"], out);
  walk(vehiclesSidebar.flatMap((s) => s.items), ["Vehicles"], out);
  walk(settingsSidebar.flatMap((s) => s.items), ["Settings"], out);

  return [...out.values()].sort((a, b) => a.path.localeCompare(b.path));
}

export function searchCrmPages(
  query: string,
  limit = 8,
  includeHref: (href: string) => boolean = () => true
): CrmPageHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const pages = listSearchableCrmPages().filter((page) => includeHref(page.href));
  const scored = pages
    .map((page) => {
      const title = page.title.toLowerCase();
      const path = page.path.toLowerCase();
      let score = 0;
      if (title === q) score = 100;
      else if (title.startsWith(q)) score = 80;
      else if (title.includes(q)) score = 60;
      else if (path.includes(q)) score = 40;
      else return null;
      return { page, score };
    })
    .filter((row): row is { page: CrmPageHit; score: number } => row != null)
    .sort((a, b) => b.score - a.score || a.page.path.localeCompare(b.page.path));

  return scored.slice(0, limit).map((row) => row.page);
}
