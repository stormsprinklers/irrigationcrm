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
  googleReviews: 0,
  total: 0,
};

type InboxBadgesContextValue = {
  counts: InboxBadgeCounts;
  timeOffPending: number;
  refresh: () => Promise<void>;
  countForHref: (href: string) => number;
};

const InboxBadgesContext = createContext<InboxBadgesContextValue | null>(null);

const BADGES_CHANGED_EVENT = "storm-inbox-badges-changed";
const TIME_OFF_CHANGED_EVENT = "storm-time-off-pending-changed";
const TIME_OFF_REVIEW_ROLES = new Set(["ADMIN", "MANAGER", "CSR"]);

export function notifyInboxBadgesChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(BADGES_CHANGED_EVENT));
}

export function notifyTimeOffPendingChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(TIME_OFF_CHANGED_EVENT));
}

export function InboxBadgesProvider({ children }: { children: ReactNode }) {
  const { status, data: session } = useSession();
  const pathname = usePathname();
  const [counts, setCounts] = useState<InboxBadgeCounts>(EMPTY);
  const [timeOffPending, setTimeOffPending] = useState(0);
  const canReviewTimeOff = TIME_OFF_REVIEW_ROLES.has(session?.user?.role ?? "");

  const refresh = useCallback(async () => {
    if (status !== "authenticated") return;
    try {
      const inboxRes = await fetch("/api/inbox/badges");
      if (inboxRes.ok) {
        const data = (await inboxRes.json()) as InboxBadgeCounts;
        setCounts({
          sms: Number(data.sms) || 0,
          social: Number(data.social) || 0,
          leads: Number(data.leads) || 0,
          missedCalls: Number(data.missedCalls) || 0,
          googleReviews: Number(data.googleReviews) || 0,
          total: Number(data.total) || 0,
        });
      }
    } catch {
      /* ignore poll errors */
    }

    if (!canReviewTimeOff) {
      setTimeOffPending(0);
      return;
    }
    try {
      const timeOffRes = await fetch("/api/schedule/time-off/pending");
      if (!timeOffRes.ok) {
        setTimeOffPending(0);
        return;
      }
      const data = (await timeOffRes.json()) as { count?: number; requests?: unknown[] };
      setTimeOffPending(
        typeof data.count === "number" ? data.count : Array.isArray(data.requests) ? data.requests.length : 0
      );
    } catch {
      /* ignore poll errors */
    }
  }, [status, canReviewTimeOff]);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 15_000);
    const onChanged = () => void refresh();
    window.addEventListener(BADGES_CHANGED_EVENT, onChanged);
    window.addEventListener(TIME_OFF_CHANGED_EVENT, onChanged);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener(BADGES_CHANGED_EVENT, onChanged);
      window.removeEventListener(TIME_OFF_CHANGED_EVENT, onChanged);
    };
  }, [refresh, pathname]);

  const value = useMemo(
    () => ({
      counts,
      timeOffPending,
      refresh,
      countForHref: (href: string) => inboxCountForHref(href, counts),
    }),
    [counts, timeOffPending, refresh]
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
