"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, CheckCheck, Mail, MessageSquare, UserPlus } from "lucide-react";
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
  type: "INBOX_EMAIL" | "INBOX_SMS" | "INBOX_LEAD" | "LEAD_CREATED";
  title: string;
  body?: string | null;
  href?: string | null;
  isRead: boolean;
  createdAt: string;
};

function notificationIcon(type: AppNotification["type"]) {
  switch (type) {
    case "INBOX_SMS":
      return MessageSquare;
    case "INBOX_LEAD":
    case "LEAD_CREATED":
      return UserPlus;
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

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);

  const loadNotifications = useCallback(async (showToasts = false) => {
    try {
      const res = await fetch("/api/notifications?limit=20");
      if (!res.ok) return;
      const data = await res.json();
      const items = (data.notifications ?? []) as AppNotification[];

      if (showToasts && initializedRef.current) {
        for (const item of items) {
          if (item.isRead || seenIdsRef.current.has(item.id)) continue;
          seenIdsRef.current.add(item.id);
          toast(item.title, {
            description: item.body ?? undefined,
            action: item.href
              ? {
                  label: "View",
                  onClick: () => {
                    window.location.href = item.href!;
                  },
                }
              : undefined,
          });
        }
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
  }, []);

  useEffect(() => {
    void loadNotifications(false);
    const interval = setInterval(() => loadNotifications(true), 20_000);
    return () => clearInterval(interval);
  }, [loadNotifications]);

  async function markRead(ids: string[]) {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    setNotifications((current) =>
      current.map((item) => (ids.includes(item.id) ? { ...item, isRead: true } : item))
    );
    setUnreadCount((count) => Math.max(0, count - ids.length));
  }

  async function markAllRead() {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
    setNotifications((current) => current.map((item) => ({ ...item, isRead: true })));
    setUnreadCount(0);
  }

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
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between gap-2">
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
        <DropdownMenuSeparator />
        {notifications.length === 0 ? (
          <p className="px-2 py-4 text-center text-sm text-muted-foreground">No notifications yet.</p>
        ) : (
          notifications.map((item) => {
            const Icon = notificationIcon(item.type);
            const content = (
              <div className="flex gap-2 py-0.5">
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
            );

            if (item.href) {
              return (
                <DropdownMenuItem key={item.id} asChild className="cursor-pointer">
                  <Link
                    href={item.href}
                    onClick={() => {
                      if (!item.isRead) void markRead([item.id]);
                      setOpen(false);
                    }}
                  >
                    {content}
                  </Link>
                </DropdownMenuItem>
              );
            }

            return (
              <DropdownMenuItem
                key={item.id}
                className="cursor-pointer"
                onClick={() => {
                  if (!item.isRead) void markRead([item.id]);
                }}
              >
                {content}
              </DropdownMenuItem>
            );
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
