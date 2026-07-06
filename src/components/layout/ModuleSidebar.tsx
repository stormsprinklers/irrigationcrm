"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import type { NavSection } from "@/config/navigation";
import { isNavActive } from "@/config/navigation";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

type ModuleSidebarProps = {
  title: string;
  sections: NavSection[];
  open?: boolean;
  onClose?: () => void;
};

export function ModuleSidebar({ title, sections, open = false, onClose }: ModuleSidebarProps) {
  const pathname = usePathname();

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
            {section.title ? (
              <p className="px-4 py-2 text-[11px] font-semibold tracking-wide text-muted-foreground">
                {section.title}
              </p>
            ) : null}
            <ul>
              {section.items.map((item) => {
                const active = isNavActive(pathname, item.href, item.exact);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      onClick={() => onClose?.()}
                      className={cn(
                        "relative flex items-center justify-between px-4 py-2 text-sm transition-colors hover:bg-muted/60",
                        active ? "font-medium text-foreground" : "text-muted-foreground"
                      )}
                    >
                      {active ? (
                        <span className="absolute left-0 top-1 bottom-1 w-1 rounded-r bg-primary" />
                      ) : null}
                      <span>{item.label}</span>
                      {item.badge ? (
                        <Badge
                          variant={item.badge === "Add on" ? "addon" : "new"}
                          className="text-[10px]"
                        >
                          {item.badge}
                        </Badge>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
