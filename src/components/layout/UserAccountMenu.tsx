"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import {
  ArrowLeftRight,
  Building2,
  Check,
  Loader2,
  LogOut,
  UserPlus,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

type AccountOption = {
  userId: string;
  name: string;
  email: string;
  role: string;
  companyId: string;
  companyName: string;
  source: "same-email" | "linked";
};

function getInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function UserAccountMenu() {
  const { data: session, update } = useSession();
  const [current, setCurrent] = useState<AccountOption | null>(null);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [switching, setSwitching] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/account/companies");
      if (!res.ok) return;
      const data = await res.json();
      setCurrent(data.current ?? null);
      setAccounts(data.switchable ?? data.linked ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (session?.user?.id) void load();
  }, [session?.user?.id, load]);

  const switchTo = async (userId: string) => {
    if (switching || userId === current?.userId) return;
    setSwitching(true);
    try {
      const res = await fetch("/api/account/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (!res.ok) return;
      await update({
        user: {
          id: data.session.id,
          email: data.session.email,
          name: data.session.name,
          companyId: data.session.companyId,
          role: data.session.role,
        },
      });
      window.location.href = "/home";
    } finally {
      setSwitching(false);
    }
  };

  const userName = session?.user?.name ?? current?.name ?? "User";
  const userEmail = session?.user?.email ?? current?.email ?? "";
  const companyName = current?.companyName ?? "Company";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="ml-0.5 flex items-center gap-2 rounded-full outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring sm:ml-1"
          aria-label="Account menu"
        >
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-primary/10 text-xs text-primary">
              {switching ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                getInitials(userName)
              )}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="font-normal">
          <div className="truncate font-medium">{userName}</div>
          <div className="truncate text-xs text-muted-foreground">{userEmail}</div>
          <div className="mt-1 flex items-center gap-1 truncate text-xs text-muted-foreground">
            <Building2 className="h-3 w-3 shrink-0" />
            {companyName}
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuSub>
          <DropdownMenuSubTrigger disabled={switching}>
            <ArrowLeftRight className="mr-2 h-4 w-4" />
            Switch accounts
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-64">
            <DropdownMenuLabel>Accounts</DropdownMenuLabel>
            <DropdownMenuItem disabled className="opacity-100">
              <Check className="mr-2 h-4 w-4 shrink-0" />
              <div className="min-w-0">
                <div className="truncate font-medium">{companyName}</div>
                <div className="truncate text-xs text-muted-foreground">Current</div>
              </div>
            </DropdownMenuItem>
            {accounts.map((acct) => (
              <DropdownMenuItem
                key={acct.userId}
                onClick={() => void switchTo(acct.userId)}
                disabled={switching}
              >
                <Building2 className="mr-2 h-4 w-4 shrink-0 opacity-60" />
                <div className="min-w-0">
                  <div className="truncate font-medium">{acct.companyName}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {acct.email}
                  </div>
                </div>
              </DropdownMenuItem>
            ))}
            {accounts.length === 0 ? (
              <DropdownMenuItem disabled className="text-muted-foreground">
                No other accounts yet
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuItem asChild>
          <Link href="/settings/integrations/account-links">
            <UserPlus className="mr-2 h-4 w-4" />
            Add account
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onClick={() => void signOut({ callbackUrl: "/login" })}
        >
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
