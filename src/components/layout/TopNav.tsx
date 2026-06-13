"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  ChevronDown,
  Droplets,
  Grid3X3,
  MapPin,
  Phone,
  Search,
  Settings,
} from "lucide-react";
import { getPrimaryNavActive, primaryNav } from "@/config/navigation";
import { currentUser } from "@/lib/mock/user";
import { cn } from "@/lib/utils";
import { NewMenu } from "@/components/layout/NewMenu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function TopNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-white">
      <div className="flex h-14 items-center gap-4 px-4">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
            <Droplets className="h-5 w-5 text-primary" />
          </div>
          <span className="hidden text-sm font-semibold text-foreground lg:inline">
            Storm Sprinklers
          </span>
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

        <div className="mx-auto hidden max-w-md flex-1 md:block">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search" className="h-9 rounded-full bg-muted/50 pl-9" />
          </div>
        </div>

        <div className="ml-auto flex items-center gap-1">
          <NewMenu />

          <Button variant="ghost" size="icon" className="relative">
            <Bell className="h-5 w-5" />
            <Badge variant="unread" className="absolute -right-0.5 -top-0.5 h-5 min-w-5 px-1 text-[10px]">
              23
            </Badge>
          </Button>
          <Button variant="ghost" size="icon">
            <Phone className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon">
            <MapPin className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon">
            <Grid3X3 className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" asChild>
            <Link href="/settings">
              <Settings className="h-5 w-5" />
            </Link>
          </Button>

          <Avatar className="ml-1 h-8 w-8">
            <AvatarFallback className="bg-primary/10 text-xs text-primary">
              {currentUser.avatarInitials}
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
        <Button variant="ghost" size="sm" className="shrink-0 text-xs">
          More
          <ChevronDown className="h-3 w-3" />
        </Button>
      </div>
    </header>
  );
}
