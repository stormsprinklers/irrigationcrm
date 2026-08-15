"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  inboxCountForHref,
  type InboxBadgeCounts,
} from "@/lib/inbox/badge-types";

const EMPTY: InboxBadgeCounts = {
  sms: 0,
  social: 0,
  leads: 0,
  missedCalls: 0,
  total: 0,
};

type InboxBadgesContextValue = {
  counts: InboxBadgeCounts;
  refresh: () => Promise<void>;
  countForHref: (href: string) => number;
};

const InboxBadgesContext = createContext<InboxBadgesContextValue | null>(null);

const BADGES_CHANGED_EVENT = "storm-inbox-badges-changed";

export function notifyInboxBadgesChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(BADGES_CHANGED_EVENT));
}

export function InboxBadgesProvider({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const pathname = usePathname();
  const [counts, setCounts] = useState<InboxBadgeCounts>(EMPTY);

  const refresh = useCallback(async () => {
    if (status !== "authenticated") return;
    try {
      const res = await fetch("/api/inbox/badges");
      if (!res.ok) return;
      const data = (await res.json()) as InboxBadgeCounts;
      setCounts({
        sms: Number(data.sms) || 0,
        social: Number(data.social) || 0,
        leads: Number(data.leads) || 0,
        missedCalls: Number(data.missedCalls) || 0,
        total: Number(data.total) || 0,
      });
    } catch {
      /* ignore poll errors */
    }
  }, [status]);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 15_000);
    const onChanged = () => void refresh();
    window.addEventListener(BADGES_CHANGED_EVENT, onChanged);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener(BADGES_CHANGED_EVENT, onChanged);
    };
  }, [refresh, pathname]);

  const value = useMemo(
    () => ({
      counts,
      refresh,
      countForHref: (href: string) => inboxCountForHref(href, counts),
    }),
    [counts, refresh]
  );

  return <InboxBadgesContext.Provider value={value}>{children}</InboxBadgesContext.Provider>;
}

export function useInboxBadges() {
  return useContext(InboxBadgesContext);
}

export function formatInboxBadgeCount(count: number) {
  if (count <= 0) return null;
  return count > 99 ? "99+" : String(count);
}
