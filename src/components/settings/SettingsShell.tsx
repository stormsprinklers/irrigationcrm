"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModuleSidebar } from "@/components/layout/ModuleSidebar";
import {
  useHolidayLightingFeatures,
  useIrrigationFeatures,
} from "@/components/layout/CompanyBrandProvider";
import type { NavItem, NavSection } from "@/config/navigation";
import { HOLIDAY_LIGHTING_NAV_HREFS, IRRIGATION_SETTINGS_HREFS } from "@/lib/company/features";
import {
  canWriteSettingsPath,
  filterSettingsNavForUser,
  isSettingsPathHidden,
} from "@/lib/settings/access";
import { isFieldRole } from "@/lib/employees";
import { settingsRootSections } from "@/lib/settings/nav";

function filterFeatureNavItems(
  items: NavItem[],
  irrigationEnabled: boolean,
  holidayEnabled: boolean
): NavItem[] {
  return items
    .filter((item) => {
      if (!irrigationEnabled && IRRIGATION_SETTINGS_HREFS.has(item.href)) return false;
      if (!holidayEnabled && HOLIDAY_LIGHTING_NAV_HREFS.has(item.href)) return false;
      return true;
    })
    .map((item) => ({
      ...item,
      children: item.children
        ? filterFeatureNavItems(item.children, irrigationEnabled, holidayEnabled)
        : undefined,
    }));
}

function filterFeatureNav(
  sections: NavSection[],
  irrigationEnabled: boolean,
  holidayEnabled: boolean
): NavSection[] {
  return sections.map((section) => ({
    ...section,
    items: filterFeatureNavItems(section.items, irrigationEnabled, holidayEnabled),
  }));
}

/**
 * Single expandable Settings sidebar — nested section layouts no longer add a
 * second desktop menu beside this one.
 */
export function SettingsShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const { enabled: irrigationEnabled } = useIrrigationFeatures();
  const { enabled: holidayEnabled } = useHolidayLightingFeatures();
  const user = session?.user ?? null;
  const canWrite = canWriteSettingsPath(pathname, user);
  const rootSections = useMemo(
    () =>
      filterSettingsNavForUser(
        filterFeatureNav(settingsRootSections(), irrigationEnabled, holidayEnabled),
        user
      ),
    [irrigationEnabled, holidayEnabled, user]
  );

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!user) return;
    if (isSettingsPathHidden(pathname, user)) {
      router.replace(isFieldRole(user.role ?? "") ? "/home" : "/settings");
    }
  }, [pathname, router, user]);

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

        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
          {canWrite ? (
            children
          ) : (
            <fieldset disabled className="min-w-0 border-0 p-0">
              <div className="border-b border-border bg-muted/40 px-4 py-2 text-sm text-muted-foreground">
                You can view these settings but cannot change them.
              </div>
              {children}
            </fieldset>
          )}
        </div>
      </div>
    </div>
  );
}
