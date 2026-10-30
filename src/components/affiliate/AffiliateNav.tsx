"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { KeyRound, LogOut, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const links = [
  { href: "/affiliate", label: "Customer API", icon: KeyRound },
  { href: "/affiliate/pipeline", label: "My pipeline", icon: TrendingUp },
];

export function AffiliateNav({ name }: { name: string }) {
  const pathname = usePathname();
  return (
    <header className="shrink-0 border-b bg-card">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
        <Link href="/affiliate" className="mr-2 font-display text-lg font-bold">
          Affiliate portal
        </Link>
        <nav className="flex items-center gap-1">
          {links.map((item) => {
            const active = item.href === "/affiliate"
              ? pathname === item.href
              : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Button key={item.href} variant={active ? "secondary" : "ghost"} size="sm" asChild>
                <Link href={item.href} className={cn(active && "font-semibold")}>
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{item.label}</span>
                </Link>
              </Button>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden text-sm text-muted-foreground md:inline">{name}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void signOut({ callbackUrl: "/login" })}
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
