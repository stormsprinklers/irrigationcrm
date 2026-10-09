"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  inboxCountForHref,
  type CompanyInboxBadgeCounts,
  type InboxBadgeCounts,
  type InboxBadgeResponse,
} from "@/lib/inbox/badge-types";
import { useNotificationSound } from "@/hooks/useNotificationSound";

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
  companies: CompanyInboxBadgeCounts[];
  timeOffPending: number;
  refresh: () => Promise<void>;
  countForHref: (href: string) => number;
  companyCountsForHref: (href: string) => CompanyInboxBadgeCounts[];
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
  const [companies, setCompanies] = useState<CompanyInboxBadgeCounts[]>([]);
  const [timeOffPending, setTimeOffPending] = useState(0);
  const previousSmsCountRef = useRef<number | null>(null);
  const playNotificationSound = useNotificationSound();
  const canReviewTimeOff = TIME_OFF_REVIEW_ROLES.has(session?.user?.role ?? "");

  const refresh = useCallback(async () => {
    if (status !== "authenticated") return;
    try {
      const inboxRes = await fetch("/api/inbox/badges", { cache: "no-store" });
      if (inboxRes.ok) {
        const data = (await inboxRes.json()) as InboxBadgeResponse;
        const nextCounts = {
          sms: Number(data.sms) || 0,
          social: Number(data.social) || 0,
          leads: Number(data.leads) || 0,
          missedCalls: Number(data.missedCalls) || 0,
          googleReviews: Number(data.googleReviews) || 0,
          total: Number(data.total) || 0,
        };
        if (
          previousSmsCountRef.current !== null &&
          nextCounts.sms > previousSmsCountRef.current
        ) {
          void playNotificationSound();
        }
        previousSmsCountRef.current = nextCounts.sms;
        setCounts(nextCounts);
        setCompanies(
          Array.isArray(data.companies)
            ? data.companies.map((company) => ({
                companyId: company.companyId,
                companyName: company.companyName,
                brandPrimary: company.brandPrimary,
                switchUserId: company.switchUserId,
                counts: {
                  sms: Number(company.counts?.sms) || 0,
                  social: Number(company.counts?.social) || 0,
                  leads: Number(company.counts?.leads) || 0,
                  missedCalls: Number(company.counts?.missedCalls) || 0,
                  googleReviews: Number(company.counts?.googleReviews) || 0,
                  total: Number(company.counts?.total) || 0,
                },
              }))
            : []
        );
      }
    } catch {
      /* ignore poll errors */
    }

    if (!canReviewTimeOff) {
      setTimeOffPending(0);
      return;
    }
    try {
      const timeOffRes = await fetch("/api/schedule/time-off/pending", { cache: "no-store" });
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
  }, [status, canReviewTimeOff, playNotificationSound]);

  useEffect(() => {
    previousSmsCountRef.current = null;
  }, [session?.user?.id]);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => {
      void refresh();
    }, 5_000);
    const onChanged = () => void refresh();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener(BADGES_CHANGED_EVENT, onChanged);
    window.addEventListener(TIME_OFF_CHANGED_EVENT, onChanged);
    window.addEventListener("focus", onChanged);
    window.addEventListener("pageshow", onChanged);
    window.addEventListener("online", onChanged);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener(BADGES_CHANGED_EVENT, onChanged);
      window.removeEventListener(TIME_OFF_CHANGED_EVENT, onChanged);
      window.removeEventListener("focus", onChanged);
      window.removeEventListener("pageshow", onChanged);
      window.removeEventListener("online", onChanged);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [refresh, pathname]);

  const value = useMemo(
    () => ({
      counts,
      companies,
      timeOffPending,
      refresh,
      countForHref: (href: string) => inboxCountForHref(href, counts),
      companyCountsForHref: (href: string) =>
        companies
          .map((company) => ({
            ...company,
            counts: {
              ...company.counts,
              total: inboxCountForHref(href, company.counts),
            },
          }))
          .filter((company) => company.counts.total > 0),
    }),
    [counts, companies, timeOffPending, refresh]
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
