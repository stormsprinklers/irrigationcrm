"use client";
import { useEffect, useState } from "react";

type Live = { visitors: number; pages: { label: string; count: number }[]; updatedAt: string };
export function LiveVisitors() {
  const [live, setLive] = useState<Live | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let busy = false;
    const refresh = async () => {
      if (busy || document.visibilityState !== "visible") return;
      busy = true;
      try {
        const res = await fetch("/api/marketing/website-analytics/live", { signal: controller.signal, cache: "no-store" });
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (!controller.signal.aborted) { setLive(data); setFailed(false); }
      } catch { if (!controller.signal.aborted) setFailed(true); }
      finally { busy = false; }
    };
    void refresh();
    const timer = window.setInterval(refresh, 30000);
    document.addEventListener("visibilitychange", refresh);
    return () => { controller.abort(); window.clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, []);
  return <section className="grid gap-5 rounded-lg border bg-card p-5 sm:grid-cols-2">
    <div className="border-l-4 border-primary pl-4"><h2 className="text-sm font-medium">Live visitors</h2><p className="my-2 text-4xl font-semibold text-primary" aria-live="polite">{failed ? "—" : live?.visitors ?? "…"}</p><p className="text-xs text-muted-foreground">Browsers active in the last 2 minutes. Refreshes every 30 seconds.</p><p className="mt-2 text-xs text-muted-foreground">{failed ? "Unavailable — retrying automatically" : live ? `Updated ${new Date(live.updatedAt).toLocaleTimeString()}` : "Connecting…"}</p></div>
    <div><h3 className="mb-3 text-sm font-medium">Pages being viewed now</h3>{!failed && live?.pages.length ? <ul className="space-y-2 text-sm">{live.pages.slice(0,5).map((p) => <li key={p.label} className="flex justify-between gap-3"><span className="truncate">{p.label}</span><strong>{p.count}</strong></li>)}</ul> : <p className="text-sm text-muted-foreground">{failed ? "Live pages unavailable." : "No recent activity recorded."}</p>}</div>
    <p className="text-xs text-muted-foreground sm:col-span-2">Live data starts with the updated website tracker. Counts use anonymous browser IDs, not individual people.</p>
  </section>;
}
