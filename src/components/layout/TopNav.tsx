"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useState } from "react";
import { Menu, Phone, Settings, X } from "lucide-react";
import { getPrimaryNavActive, primaryNav } from "@/config/navigation";
import { stormBrand } from "@/lib/branding";
import { cn } from "@/lib/utils";
import { NewMenu } from "@/components/layout/NewMenu";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { VoiceDialerDialog } from "@/components/voice/VoiceDialer";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

function getInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function TopNav() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [dialerOpen, setDialerOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const userName = session?.user?.name ?? "User";

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
          <Image
            src={stormBrand.logoPath}
            alt="Storm Sprinklers"
            width={320}
            height={320}
            priority
            className="h-10 w-auto rounded-sm bg-card object-contain sm:h-[4.5rem]"
          />
        </Link>

        <nav className="hidden items-center gap-1 xl:flex" aria-label="Primary">
          {primaryNav.map((item) => {
            const active = getPrimaryNavActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative px-3 py-4 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
                  active && "text-foreground"
                )}
              >
                {item.label}
                {active && (
                  <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary" />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-0.5 sm:gap-1">
          <NewMenu />

          <NotificationBell />

          <Button
            variant="ghost"
            size="icon"
            type="button"
            aria-label="Open phone dialer"
            onClick={() => setDialerOpen(true)}
          >
            <Phone className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" asChild>
            <Link href="/settings">
              <Settings className="h-5 w-5" />
            </Link>
          </Button>

          <Avatar className="ml-0.5 h-8 w-8 sm:ml-1">
            <AvatarFallback className="bg-primary/10 text-xs text-primary">
              {getInitials(userName)}
            </AvatarFallback>
          </Avatar>
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
          mobileNavOpen ? "translate-x-0" : "-translate-x-full pointer-events-none"
        )}
        aria-label="Primary"
        aria-hidden={!mobileNavOpen}
      >
        <div className="overflow-y-auto py-2">
          {primaryNav.map((item) => {
            const active = getPrimaryNavActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                onClick={() => setMobileNavOpen(false)}
                className={cn(
                  "relative flex items-center px-4 py-3 text-sm font-medium transition-colors hover:bg-muted/60",
                  active ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {active ? (
                  <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r bg-primary" />
                ) : null}
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>

      <VoiceDialerDialog open={dialerOpen} onClose={() => setDialerOpen(false)} />
    </header>
  );
}
