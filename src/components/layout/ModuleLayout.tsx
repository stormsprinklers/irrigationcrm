"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import type { NavSection } from "@/config/navigation";
import { ModuleSidebar } from "@/components/layout/ModuleSidebar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ModuleLayoutProps = {
  title: string;
  sections: NavSection[];
  children: React.ReactNode;
  className?: string;
  scrollable?: boolean;
  /**
   * Hide the mobile hamburger bar and drawer. Use for nested settings layouts
   * so SettingsShell owns the single mobile menu.
   */
  desktopSidebarOnly?: boolean;
};

export function ModuleLayout({
  title,
  sections,
  children,
  className,
  scrollable = true,
  desktopSidebarOnly = false,
}: ModuleLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className={cn("flex h-full min-h-0 w-full overflow-hidden", className)}>
      {!desktopSidebarOnly && sidebarOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          aria-label={`Close ${title} menu`}
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      {desktopSidebarOnly ? (
        <div className="hidden lg:flex">
          <ModuleSidebar title={title} sections={sections} open />
        </div>
      ) : (
        <ModuleSidebar
          title={title}
          sections={sections}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />
      )}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {!desktopSidebarOnly ? (
          <div className="flex shrink-0 items-center gap-2 border-b border-border bg-card px-4 py-2.5 lg:hidden">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => setSidebarOpen(true)}
              aria-label={`Open ${title} menu`}
              aria-expanded={sidebarOpen}
            >
              <Menu className="h-4 w-4" />
            </Button>
            <h2 className="truncate font-display text-base font-bold text-foreground">{title}</h2>
          </div>
        ) : null}

        <div
          className={cn(
            "min-h-0 min-w-0 flex-1",
            scrollable ? "overflow-y-auto" : "flex flex-col overflow-y-auto"
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
