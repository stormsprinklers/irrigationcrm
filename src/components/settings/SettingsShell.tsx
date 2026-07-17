"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ModuleSidebar } from "@/components/layout/ModuleSidebar";
import {
  isSettingsRootItemActive,
  resolveSettingsSection,
  settingsRootSections,
} from "@/lib/settings/nav";
import { cn } from "@/lib/utils";

type DrawerLevel = "root" | "section";

/**
 * Settings shell with one mobile menu bar ("Settings > Team") and hierarchical
 * drawer navigation (section items with "< Settings" back). Desktop keeps the
 * outer Settings sidebar; nested layouts add their own desktop sidebars.
 */
export function SettingsShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const section = resolveSettingsSection(pathname);
  const [open, setOpen] = useState(false);
  const [level, setLevel] = useState<DrawerLevel>("root");

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  function openMenu() {
    setLevel(section ? "section" : "root");
    setOpen(true);
  }

  const barLabel = section ? `Settings > ${section.title}` : "Settings";
  const rootSections = settingsRootSections();
  const drawerSections =
    level === "section" && section ? section.sections : rootSections;

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden">
      {open ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          aria-label="Close Settings menu"
          onClick={() => setOpen(false)}
        />
      ) : null}

      {/* Desktop outer Settings sidebar */}
      <div className="hidden lg:flex">
        <ModuleSidebar title="Settings" sections={rootSections} open />
      </div>

      {/* Mobile hierarchical drawer */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-56 flex-col border-r border-border bg-card shadow-lg lg:hidden",
          !open && "hidden"
        )}
      >
        <div className="flex items-center justify-between border-b border-border px-3 py-3">
          {level === "section" && section ? (
            <button
              type="button"
              className="flex min-w-0 items-center gap-1 text-sm font-medium text-foreground"
              onClick={() => setLevel("root")}
            >
              <ChevronLeft className="h-4 w-4 shrink-0" />
              <span className="truncate">Settings</span>
            </button>
          ) : (
            <h2 className="font-display text-lg font-bold text-foreground">Settings</h2>
          )}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded p-1 hover:bg-muted"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {level === "section" && section ? (
          <p className="border-b border-border px-4 py-2 text-[11px] font-semibold tracking-wide text-muted-foreground">
            {section.title.toUpperCase()}
          </p>
        ) : null}

        <nav className="flex-1 overflow-y-auto py-2" aria-label="Settings navigation">
          {drawerSections.map((navSection, sectionIndex) => (
            <div key={navSection.title ?? sectionIndex} className="mb-2">
              {navSection.title && level === "root" ? (
                <p className="px-4 py-2 text-[11px] font-semibold tracking-wide text-muted-foreground">
                  {navSection.title}
                </p>
              ) : null}
              <ul>
                {navSection.items.map((item) => {
                  const active = isSettingsRootItemActive(
                    pathname,
                    item.href,
                    item.exact,
                    item.activePrefixes
                  );
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        onClick={() => setOpen(false)}
                        className={cn(
                          "relative flex items-center justify-between px-4 py-2 text-sm transition-colors hover:bg-muted/60",
                          active ? "font-medium text-foreground" : "text-muted-foreground"
                        )}
                      >
                        {active ? (
                          <span className="absolute bottom-1 left-0 top-1 w-1 rounded-r bg-primary" />
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

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 items-center gap-2 border-b border-border bg-card px-4 py-2.5 lg:hidden">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={openMenu}
            aria-label="Open Settings menu"
            aria-expanded={open}
          >
            <Menu className="h-4 w-4" />
          </Button>
          <h2 className="truncate font-display text-base font-bold text-foreground">{barLabel}</h2>
        </div>

        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
