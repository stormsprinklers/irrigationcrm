"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Building2, Check, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

type AccountOption = {
  userId: string;
  name: string;
  email: string;
  role: string;
  companyId: string;
  companyName: string;
};

export function CompanySwitcher() {
  const { data: session, update } = useSession();
  const [current, setCurrent] = useState<AccountOption | null>(null);
  const [linked, setLinked] = useState<AccountOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [switching, setSwitching] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/account/companies");
      if (!res.ok) return;
      const data = await res.json();
      setCurrent(data.current ?? null);
      setLinked(data.linked ?? []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
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

  if (!current || linked.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="hidden max-w-[11rem] gap-1.5 truncate sm:inline-flex"
          disabled={switching || loading}
        >
          {switching ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Building2 className="h-3.5 w-3.5 shrink-0" />
          )}
          <span className="truncate">{current.companyName}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Switch company</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled className="opacity-100">
          <Check className="mr-2 h-4 w-4" />
          <div className="min-w-0">
            <div className="truncate font-medium">{current.companyName}</div>
            <div className="truncate text-xs text-muted-foreground">{current.email}</div>
          </div>
        </DropdownMenuItem>
        {linked.map((acct) => (
          <DropdownMenuItem key={acct.userId} onClick={() => void switchTo(acct.userId)}>
            <Building2 className="mr-2 h-4 w-4 opacity-60" />
            <div className="min-w-0">
              <div className="truncate font-medium">{acct.companyName}</div>
              <div className="truncate text-xs text-muted-foreground">{acct.email}</div>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
