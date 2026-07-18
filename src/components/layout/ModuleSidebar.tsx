"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, X } from "lucide-react";
import type { NavItem, NavSection } from "@/config/navigation";
import { isNavActive } from "@/config/navigation";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

type ModuleSidebarProps = {
  title: string;
  sections: NavSection[];
  open?: boolean;
  onClose?: () => void;
};

function itemOrChildActive(pathname: string, item: NavItem) {
  if (isNavActive(pathname, item.href, item.exact, item.activePrefixes)) return true;
  return (item.children ?? []).some((child) =>
    isNavActive(pathname, child.href, child.exact, child.activePrefixes)
  );
}

function NavLink({
  item,
  pathname,
  onClose,
  nested,
}: {
  item: NavItem;
  pathname: string;
  onClose?: () => void;
  nested?: boolean;
}) {
  const active = isNavActive(pathname, item.href, item.exact, item.activePrefixes);
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      onClick={() => onClose?.()}
      className={cn(
        "relative flex items-center justify-between py-2 text-sm transition-colors hover:bg-muted/60",
        nested ? "px-4 pl-8" : "px-4",
        active ? "font-medium text-foreground" : "text-muted-foreground"
      )}
    >
      {active ? (
        <span className="absolute bottom-1 left-0 top-1 w-1 rounded-r bg-primary" />
      ) : null}
      <span>{item.label}</span>
      {item.badge ? (
        <Badge variant={item.badge === "Add on" ? "addon" : "new"} className="text-[10px]">
          {item.badge}
        </Badge>
      ) : null}
    </Link>
  );
}

function ExpandableNavItem({
  item,
  pathname,
  onClose,
}: {
  item: NavItem;
  pathname: string;
  onClose?: () => void;
}) {
  const children = item.children ?? [];
  const groupActive = itemOrChildActive(pathname, item);
  const [expanded, setExpanded] = useState(groupActive);

  useEffect(() => {
    if (groupActive) setExpanded(true);
  }, [groupActive, pathname]);

  if (!children.length) {
    return (
      <li>
        <NavLink item={item} pathname={pathname} onClose={onClose} />
      </li>
    );
  }

  return (
    <li>
      <button
        type="button"
        className={cn(
          "relative flex w-full items-center justify-between px-4 py-2 text-left text-sm transition-colors hover:bg-muted/60",
          groupActive ? "font-medium text-foreground" : "text-muted-foreground"
        )}
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        {groupActive ? (
          <span className="absolute bottom-1 left-0 top-1 w-1 rounded-r bg-primary" />
        ) : null}
        <span>{item.label}</span>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 transition-transform", expanded && "rotate-180")}
        />
      </button>
      {expanded ? (
        <ul>
          {children.map((child) => (
            <li key={child.href}>
              <NavLink item={child} pathname={pathname} onClose={onClose} nested />
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function ModuleSidebar({ title, sections, open = false, onClose }: ModuleSidebarProps) {
  const pathname = usePathname();
  const hasExpandable = useMemo(
    () => sections.some((section) => section.items.some((item) => (item.children?.length ?? 0) > 0)),
    [sections]
  );

  return (
    <aside
      className={cn(
        "flex w-56 shrink-0 flex-col border-r border-border bg-card",
        "max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:z-50 max-lg:shadow-lg",
        !open && "max-lg:hidden",
        "lg:relative lg:flex lg:shadow-none"
      )}
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-4">
        <h2 className="font-display text-lg font-bold text-foreground">{title}</h2>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 hover:bg-muted lg:hidden"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <nav className="flex-1 overflow-y-auto py-2" aria-label={`${title} navigation`}>
        {sections.map((section, sectionIndex) => (
          <div key={section.title ?? sectionIndex} className="mb-2">
            {section.title && !hasExpandable ? (
              <p className="px-4 py-2 text-[11px] font-semibold tracking-wide text-muted-foreground">
                {section.title}
              </p>
            ) : null}
            <ul>
              {section.items.map((item) => (
                <ExpandableNavItem
                  key={item.href + item.label}
                  item={item}
                  pathname={pathname}
                  onClose={onClose}
                />
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
