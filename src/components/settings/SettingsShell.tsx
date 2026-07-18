"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModuleSidebar } from "@/components/layout/ModuleSidebar";
import { settingsRootSections } from "@/lib/settings/nav";

/**
 * Single expandable Settings sidebar — nested section layouts no longer add a
 * second desktop menu beside this one.
 */
export function SettingsShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const rootSections = settingsRootSections();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

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

      <div className="hidden lg:flex">
        <ModuleSidebar title="Settings" sections={rootSections} open />
      </div>

      <div className="lg:hidden">
        <ModuleSidebar
          title="Settings"
          sections={rootSections}
          open={open}
          onClose={() => setOpen(false)}
        />
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 items-center gap-2 border-b border-border bg-card px-4 py-2.5 lg:hidden">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => setOpen(true)}
            aria-label="Open Settings menu"
            aria-expanded={open}
          >
            <Menu className="h-4 w-4" />
          </Button>
          <h2 className="truncate font-display text-base font-bold text-foreground">Settings</h2>
        </div>

        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
