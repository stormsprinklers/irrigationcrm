"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { ChevronDown, ExternalLink, Menu, Phone, Settings, X } from "lucide-react";
import {
  getPrimaryNavActive,
  isOtherNavActive,
  otherNav,
  primaryNav,
  type NavItem,
} from "@/config/navigation";
import { canAccessHiring } from "@/lib/hiring/permissions";
import { canViewVehicles } from "@/lib/vehicles/permissions";
import { stormBrand } from "@/lib/branding";
import { useCompanyBrand } from "@/components/layout/CompanyBrandProvider";
import { cn } from "@/lib/utils";
import { NewMenu } from "@/components/layout/NewMenu";
import { UserAccountMenu } from "@/components/layout/UserAccountMenu";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { GlobalSearchButton } from "@/components/layout/GlobalSearch";
import { InboxCountOrb } from "@/components/layout/InboxCountOrb";
import { VoiceDialerDialog } from "@/components/voice/VoiceDialer";
import { isStandaloneDisplay } from "@/lib/pwa/client";
import { Button } from "@/components/ui/button";
import { useInboxBadges } from "@/contexts/InboxBadgesProvider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function filterOtherNav(items: NavItem[], role: string | undefined) {
  return items.filter((item) => {
    if (item.href === "/hiring") return canAccessHiring(role);
    if (item.href === "/vehicles") return canViewVehicles(role);
    return true;
  });
}

function NavLink({
  item,
  pathname,
  onNavigate,
  className,
  badgeCount = 0,
}: {
  item: NavItem;
  pathname: string;
  onNavigate?: () => void;
  className?: string;
  badgeCount?: number;
}) {
  const active = getPrimaryNavActive(pathname, item.href);
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      className={cn(
        "relative px-3 py-4 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
        active && "text-foreground",
        className
      )}
    >
      <span className="relative inline-flex items-center pr-1">
        {item.label}
        <InboxCountOrb count={badgeCount} className="absolute -right-3.5 -top-2" />
      </span>
      {active ? (
        <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary" />
      ) : null}
    </Link>
  );
}

export function TopNav() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { brand } = useCompanyBrand();
  const inboxBadges = useInboxBadges();
  const [dialerOpen, setDialerOpen] = useState(false);
  const [standalonePwa, setStandalonePwa] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mobileOtherOpen, setMobileOtherOpen] = useState(false);
  const role = session?.user?.role;
  const navItems = primaryNav.filter((item) => {
    if (item.href === "/holiday-lighting/quote") {
      return brand.holidayLightingFeaturesEnabled;
    }
    if (item.href === "/maintenance-plans") {
      return brand.maintenancePlansFeaturesEnabled;
    }
    return true;
  });
  const otherItems = filterOtherNav(otherNav, role);
  const otherActive = isOtherNavActive(pathname, otherItems);
  const lmsUrl = process.env.NEXT_PUBLIC_LMS_URL?.replace(/\/$/, "") || "";

  useEffect(() => {
    setStandalonePwa(isStandaloneDisplay());
  }, []);

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-card">
      <div className="flex h-14 items-center gap-2 px-3 sm:h-[4.5rem] sm:gap-4 sm:px-4">
        <Button
          variant="ghost"
          size="icon"
          type="button"
          className="shrink-0 xl:hidden"
          aria-label={mobileNavOpen ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={mobileNavOpen}
          onClick={() => setMobileNavOpen((open) => !open)}
        >
          {mobileNavOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>

        <Link href="/home" className="flex shrink-0 items-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- brand logos may be blob proxy URLs */}
          <img
            src={brand.logoUrl || stormBrand.logoPath}
            alt={brand.companyName || "Company"}
            width={320}
            height={320}
            className="h-10 w-auto rounded-sm bg-card object-contain sm:h-[4.5rem]"
          />
        </Link>

        <nav className="hidden items-center gap-1 xl:flex" aria-label="Primary">
          {navItems.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              pathname={pathname}
              badgeCount={item.href === "/inbox" ? inboxBadges?.counts.total ?? 0 : 0}
            />
          ))}

          {otherItems.length > 0 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "relative inline-flex items-center gap-1 px-3 py-4 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
                    otherActive && "text-foreground"
                  )}
                >
                  Other
                  <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                  {otherActive ? (
                    <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary" />
                  ) : null}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-44">
                {otherItems.map((item) => {
                  const active = getPrimaryNavActive(pathname, item.href);
                  return (
                    <DropdownMenuItem key={item.href} asChild>
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={cn(active && "font-medium text-foreground")}
                      >
                        {item.label}
                      </Link>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}

          {lmsUrl ? (
            <a
              href={lmsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="relative inline-flex items-center gap-1.5 px-3 py-4 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Learning
              <ExternalLink className="h-3.5 w-3.5 opacity-70" />
            </a>
          ) : null}
        </nav>

        <div className="ml-auto flex min-w-0 shrink-0 items-center gap-0.5 sm:gap-1">
          <GlobalSearchButton />
          <NewMenu />

          <NotificationBell />

          {standalonePwa ? null : (
            <Button
              variant="ghost"
              size="icon"
              type="button"
              aria-label="Open phone dialer"
              onClick={() => setDialerOpen(true)}
            >
              <Phone className="h-5 w-5" />
            </Button>
          )}
          <Button variant="ghost" size="icon" asChild>
            <Link href="/settings">
              <Settings className="h-5 w-5" />
            </Link>
          </Button>

          <UserAccountMenu />
        </div>
      </div>

      {mobileNavOpen ? (
        <button
          type="button"
          className="fixed inset-0 top-14 z-40 bg-black/40 sm:top-[4.5rem] xl:hidden"
          aria-label="Close navigation menu"
          onClick={() => setMobileNavOpen(false)}
        />
      ) : null}

      <nav
        className={cn(
          "fixed left-0 z-50 flex w-72 flex-col border-r border-border bg-card shadow-lg transition-transform duration-200 xl:hidden",
          "top-14 bottom-0 sm:top-[4.5rem]",
          mobileNavOpen ? "translate-x-0" : "pointer-events-none -translate-x-full"
        )}
        aria-label="Primary"
        aria-hidden={!mobileNavOpen}
      >
        <div className="overflow-y-auto py-2">
          {navItems.map((item) => {
            const active = getPrimaryNavActive(pathname, item.href);
            const inboxCount = item.href === "/inbox" ? inboxBadges?.counts.total ?? 0 : 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                onClick={() => setMobileNavOpen(false)}
                className={cn(
                  "relative flex items-center justify-between px-4 py-3 text-sm font-medium transition-colors hover:bg-muted/60",
                  active ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {active ? (
                  <span className="absolute bottom-2 left-0 top-2 w-1 rounded-r bg-primary" />
                ) : null}
                <span>{item.label}</span>
                <InboxCountOrb count={inboxCount} />
              </Link>
            );
          })}

          {otherItems.length > 0 ? (
            <div>
              <button
                type="button"
                onClick={() => setMobileOtherOpen((open) => !open)}
                className={cn(
                  "relative flex w-full items-center justify-between px-4 py-3 text-sm font-medium transition-colors hover:bg-muted/60",
                  otherActive ? "text-foreground" : "text-muted-foreground"
                )}
                aria-expanded={mobileOtherOpen}
              >
                <span className="flex items-center gap-2">
                  {otherActive ? (
                    <span className="absolute bottom-2 left-0 top-2 w-1 rounded-r bg-primary" />
                  ) : null}
                  Other
                </span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 transition-transform",
                    mobileOtherOpen && "rotate-180"
                  )}
                />
              </button>
              {mobileOtherOpen || otherActive ? (
                <div className="pb-1">
                  {otherItems.map((item) => {
                    const active = getPrimaryNavActive(pathname, item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        onClick={() => setMobileNavOpen(false)}
                        className={cn(
                          "flex items-center px-4 py-2.5 pl-8 text-sm transition-colors hover:bg-muted/60",
                          active
                            ? "font-medium text-foreground"
                            : "text-muted-foreground"
                        )}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ) : null}

          {lmsUrl ? (
            <a
              href={lmsUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setMobileNavOpen(false)}
              className="flex items-center gap-2 px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            >
              Learning
              <ExternalLink className="h-3.5 w-3.5 opacity-70" />
            </a>
          ) : null}
        </div>
      </nav>

      <VoiceDialerDialog open={dialerOpen} onClose={() => setDialerOpen(false)} />
    </header>
  );
}
