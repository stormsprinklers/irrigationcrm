"use client";

import { useCallback, useEffect, useState } from "react";
import { Ban } from "lucide-react";
import Link from "next/link";

type FreezeStatus = {
  disabled: boolean;
  reason: string | null;
  canManage: boolean;
};

export function OutboundCommsBanner() {
  const [status, setStatus] = useState<FreezeStatus | null>(null);

  const load = useCallback(() => {
    fetch("/api/settings/communications-freeze")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: FreezeStatus | null) => setStatus(data))
      .catch(() => setStatus(null));
  }, []);

  useEffect(() => {
    load();
    const onChange = () => load();
    window.addEventListener("outbound-comms-changed", onChange);
    const interval = window.setInterval(load, 60_000);
    return () => {
      window.removeEventListener("outbound-comms-changed", onChange);
      window.clearInterval(interval);
    };
  }, [load]);

  if (!status?.disabled) return null;

  return (
    <div className="flex items-center justify-center gap-2 bg-destructive px-4 py-2 text-center text-sm font-medium text-white">
      <Ban className="h-4 w-4 shrink-0" />
      <span>
        Outbound texts, calls, and emails are paused.
        {status.reason ? ` ${status.reason}` : ""}
        {status.canManage ? (
          <>
            {" "}
            <Link
              href="/settings/notifications"
              className="underline underline-offset-2"
            >
              Manage
            </Link>
          </>
        ) : null}
      </span>
    </div>
  );
}
