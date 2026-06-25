"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useState } from "react";
import { Phone, Settings } from "lucide-react";
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
  const userName = session?.user?.name ?? "User";

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-card">
      <div className="flex h-[4.5rem] items-center gap-4 px-4">
        <Link href="/" className="flex shrink-0 items-center">
          <Image
            src={stormBrand.logoPath}
            alt="Storm Sprinklers"
            width={320}
            height={320}
            priority
            className="h-[4.5rem] w-auto rounded-sm bg-card object-contain"
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

        <div className="ml-auto flex items-center gap-1">
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

          <Avatar className="ml-1 h-8 w-8">
            <AvatarFallback className="bg-primary/10 text-xs text-primary">
              {getInitials(userName)}
            </AvatarFallback>
          </Avatar>
        </div>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto border-t border-border px-4 py-2 xl:hidden">
        {primaryNav.map((item) => {
          const active = getPrimaryNavActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium",
                active
                  ? "bg-primary text-white"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </div>

      <VoiceDialerDialog open={dialerOpen} onClose={() => setDialerOpen(false)} />
    </header>
  );
}
