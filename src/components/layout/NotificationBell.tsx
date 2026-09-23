"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Bell, Briefcase, CalendarOff, Car, CheckCheck, Mail, MessageSquare, Moon, Phone, Star, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type AppNotification = {
  id: string;
  type:
    | "INBOX_EMAIL"
    | "INBOX_SMS"
    | "INBOX_LEAD"
    | "LEAD_CREATED"
    | "HIRING_APPLICANT"
    | "HIRING_SCREEN_BOOKED"
    | "VEHICLE_REMINDER"
    | "GOOGLE_REVIEW"
    | "PORTAL_CONTACT"
    | "TIME_OFF_REQUEST"
    | "CAMPAIGN_QUIET_HOURS";
  title: string;
  body?: string | null;
  href?: string | null;
  isRead: boolean;
  createdAt: string;
  companyId?: string | null;
  companyName?: string | null;
  brandPrimary?: string | null;
  switchUserId?: string | null;
};

function notificationIcon(type: AppNotification["type"]) {
  switch (type) {
    case "INBOX_SMS":
      return MessageSquare;
    case "INBOX_LEAD":
    case "LEAD_CREATED":
      return UserPlus;
    case "HIRING_APPLICANT":
      return Briefcase;
    case "HIRING_SCREEN_BOOKED":
      return Phone;
    case "VEHICLE_REMINDER":
      return Car;
    case "GOOGLE_REVIEW":
      return Star;
    case "PORTAL_CONTACT":
      return Phone;
    case "TIME_OFF_REQUEST":
      return CalendarOff;
    case "CAMPAIGN_QUIET_HOURS":
      return Moon;
    default:
      return Mail;
  }
}

function formatWhen(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 60_000) return "Just now";
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
  if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h ago`;
  return date.toLocaleDateString();
}

function CompanyColorBar({
  color,
  companyName,
}: {
  color?: string | null;
  companyName?: string | null;
}) {
  if (!color) return null;
  return (
    <>
      {companyName ? <span className="sr-only">{companyName}</span> : null}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-[3px] rounded-r-sm"
        style={{ backgroundColor: color }}
      />
    </>
  );
}

export function NotificationBell() {
  const router = useRouter();
  const { data: session, update } = useSession();
  const currentCompanyId = session?.user?.companyId ?? null;
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [switching, setSwitching] = useState(false);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const openNotificationRef = useRef<(item: AppNotification) => void>(() => {});

  const unlockNotificationSound = useCallback(async () => {
    if (typeof window === "undefined") return null;
    const AudioContextConstructor =
      window.AudioContext ??
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) return null;

    const context = audioContextRef.current ?? new AudioContextConstructor();
    audioContextRef.current = context;
    if (context.state === "suspended") {
      await context.resume().catch(() => undefined);
    }
    return context.state === "running" ? context : null;
  }, []);

  const playNotificationSound = useCallback(async () => {
    const context = await unlockNotificationSound();
    if (!context) return;

    const playTone = (frequency: number, delay: number) => {
      const start = context.currentTime + delay;
      const oscillator = context.createOscillator();
      const gain = context.createGain();

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.08, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.24);

      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.25);
      oscillator.addEventListener("ended", () => {
        oscillator.disconnect();
        gain.disconnect();
      });
    };

    playTone(659.25, 0);
    playTone(880, 0.11);
  }, [unlockNotificationSound]);

  useEffect(() => {
    const unlock = () => {
      void unlockNotificationSound();
    };
    window.addEventListener("pointerdown", unlock, { once: true, passive: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [unlockNotificationSound]);

  useEffect(
    () => () => {
      const context = audioContextRef.current;
      audioContextRef.current = null;
      if (context && context.state !== "closed") void context.close();
    },
    []
  );

  const loadNotifications = useCallback(async (showToasts = false) => {
    try {
      const res = await fetch("/api/notifications?limit=20");
      if (!res.ok) return;
      const data = await res.json();
      const items = (data.notifications ?? []) as AppNotification[];

      if (showToasts && initializedRef.current) {
        let receivedNewUnread = false;
        for (const item of items) {
          if (item.isRead || seenIdsRef.current.has(item.id)) continue;
          seenIdsRef.current.add(item.id);
          receivedNewUnread = true;
          toast(item.title, {
            description: item.body ?? undefined,
            style: item.brandPrimary
              ? { borderRight: `3px solid ${item.brandPrimary}` }
              : undefined,
            action: item.href
              ? {
                  label: "View",
                  onClick: () => openNotificationRef.current(item),
                }
              : undefined,
          });
        }
        if (receivedNewUnread) void playNotificationSound();
      }

      for (const item of items) {
        seenIdsRef.current.add(item.id);
      }
      initializedRef.current = true;

      setNotifications(items);
      setUnreadCount(data.unreadCount ?? 0);
    } catch {
      /* ignore poll errors */
    }
  }, [playNotificationSound]);

  useEffect(() => {
    void loadNotifications(false);
    const interval = setInterval(() => loadNotifications(true), 20_000);
    return () => clearInterval(interval);
  }, [loadNotifications, session?.user?.id]);

  const markRead = useCallback(async (ids: string[]) => {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    setNotifications((current) =>
      current.map((item) => (ids.includes(item.id) ? { ...item, isRead: true } : item))
    );
    setUnreadCount((count) => Math.max(0, count - ids.length));
  }, []);

  async function markAllRead() {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
    setNotifications((current) => current.map((item) => ({ ...item, isRead: true })));
    setUnreadCount(0);
  }

  const openNotification = useCallback(
    async (item: AppNotification) => {
      if (!item.isRead) void markRead([item.id]);
      setOpen(false);
      if (!item.href) return;

      const needsSwitch = Boolean(
        item.switchUserId && item.companyId && currentCompanyId && item.companyId !== currentCompanyId
      );
      if (needsSwitch && item.switchUserId) {
        if (switching) return;
        setSwitching(true);
        try {
          const res = await fetch("/api/account/switch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: item.switchUserId }),
          });
          const data = await res.json().catch(() => ({}));
          if (res.ok && data.session) {
            await update({
              user: {
                id: data.session.id,
                email: data.session.email,
                name: data.session.name,
                companyId: data.session.companyId,
                role: data.session.role,
                trueRole: null,
              },
            });
          }
          window.location.href = item.href;
        } finally {
          setSwitching(false);
        }
        return;
      }

      router.push(item.href);
    },
    [currentCompanyId, markRead, router, switching, update]
  );

  openNotificationRef.current = (item) => {
    void openNotification(item);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" type="button" aria-label="Notifications" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-white">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="flex max-h-[min(32rem,calc(100dvh-5rem))] w-[calc(100vw-2rem)] flex-col overflow-hidden sm:w-80"
      >
        <DropdownMenuLabel className="flex shrink-0 items-center justify-between gap-2">
          <span>Notifications</span>
          {unreadCount > 0 ? (
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs font-normal text-primary hover:underline"
              onClick={() => markAllRead()}
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all read
            </button>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="shrink-0" />
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {notifications.length === 0 ? (
            <p className="px-2 py-4 text-center text-sm text-muted-foreground">No notifications yet.</p>
          ) : (
            notifications.map((item) => {
              const Icon = notificationIcon(item.type);
              return (
                <DropdownMenuItem
                  key={item.id}
                  className="relative cursor-pointer overflow-hidden"
                  disabled={switching}
                  onClick={() => {
                    void openNotification(item);
                  }}
                >
                  <div className="flex w-full gap-2 py-0.5 pr-1.5">
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-sm leading-snug", !item.isRead && "font-medium")}>
                        {item.title}
                      </p>
                      {item.body ? (
                        <p className="truncate text-xs text-muted-foreground">{item.body}</p>
                      ) : null}
                      <p className="mt-0.5 text-[10px] text-muted-foreground">{formatWhen(item.createdAt)}</p>
                    </div>
                  </div>
                  <CompanyColorBar color={item.brandPrimary} companyName={item.companyName} />
                </DropdownMenuItem>
              );
            })
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
