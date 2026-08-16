"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import Link from "next/link";
import { PortalShell } from "./PortalShell";
import { absolutePublicBlobUrl } from "@/lib/blob/urls";

type VisitDetail = {
  id: string;
  title: string;
  startAt: string | null;
  endAt: string | null;
  workSummary: string | null;
  technician: { name: string; photoUrl: string | null; title: string | null } | null;
  lineItems: Array<{
    id: string;
    name: string;
    description: string | null;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
  attachments: Array<{
    id: string;
    fileName: string;
    mimeType: string;
    url: string;
    isImage: boolean;
    isVideo?: boolean;
  }>;
};

function money(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function formatVisitWhen(startAt: string | null, endAt: string | null) {
  if (!startAt) return null;
  const start = new Date(startAt);
  const datePart = format(start, "EEEE, MMMM d, yyyy");
  const startTime = format(start, "h:mm a");
  if (endAt) {
    const end = new Date(endAt);
    return `${datePart} · ${startTime} – ${format(end, "h:mm a")}`;
  }
  return `${datePart} · ${startTime}`;
}

export function PortalVisitDetail({ slug, visitId }: { slug: string; visitId: string }) {
  const [me, setMe] = useState<{
    company: { name: string; emailLogoUrl: string | null; features: Record<string, boolean> };
  } | null>(null);
  const [visit, setVisit] = useState<VisitDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [meRes, visitRes] = await Promise.all([
      fetch("/api/portal/me"),
      fetch(`/api/portal/visits/${visitId}`),
    ]);
    const meData = await meRes.json();
    const visitData = await visitRes.json();
    setMe(meData);
    if (!visitRes.ok) {
      setError(visitData.error ?? "Visit not found");
      setVisit(null);
      return;
    }
    setVisit(visitData.visit);
    setError(null);
  }, [visitId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!me) return <p className="text-sm text-muted-foreground">Loading...</p>;
  if (error) {
    return (
      <PortalShell
        slug={slug}
        companyName={me.company.name}
        emailLogoUrl={me.company.emailLogoUrl}
        features={me.company.features as never}
      >
        <p className="text-sm text-destructive">{error}</p>
      </PortalShell>
    );
  }
  if (!visit) return <p className="text-sm text-muted-foreground">Loading...</p>;

  const when = formatVisitWhen(visit.startAt, visit.endAt);
  const lineTotal = visit.lineItems.reduce((sum, item) => sum + item.total, 0);

  return (
    <PortalShell
      slug={slug}
      companyName={me.company.name}
      emailLogoUrl={me.company.emailLogoUrl}
      features={me.company.features as never}
    >
      <div className="space-y-6">
        <Link href={`/portal/${slug}/visits`} className="text-sm text-primary hover:underline">
          ← Back to visits
        </Link>

        <div>
          <h1 className="text-2xl font-semibold text-storm-navy">{visit.title}</h1>
          {when ? <p className="mt-2 text-sm text-slate-700">{when}</p> : null}
        </div>

        {visit.technician ? (
          <section className="rounded-lg border border-border bg-white p-4">
            <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">
              Technician
            </h2>
            <div className="mt-3 flex items-center gap-3">
              {visit.technician.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={absolutePublicBlobUrl(visit.technician.photoUrl) ?? visit.technician.photoUrl}
                  alt=""
                  className="h-12 w-12 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-sm font-medium">
                  {visit.technician.name.charAt(0)}
                </div>
              )}
              <div>
                <p className="font-medium">{visit.technician.name}</p>
                {visit.technician.title ? (
                  <p className="text-sm text-muted-foreground">{visit.technician.title}</p>
                ) : null}
              </div>
            </div>
          </section>
        ) : null}

        {visit.workSummary ? (
          <section className="rounded-lg border border-border bg-white p-4">
            <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">
              Work summary
            </h2>
            <p className="mt-3 whitespace-pre-wrap text-sm text-slate-800">{visit.workSummary}</p>
          </section>
        ) : null}

        {visit.lineItems.length > 0 ? (
          <section className="rounded-lg border border-border bg-white p-4">
            <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">
              Line items
            </h2>
            <ul className="mt-3 divide-y divide-border">
              {visit.lineItems.map((item) => (
                <li key={item.id} className="flex items-start justify-between gap-4 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">{item.name}</p>
                    {item.description ? (
                      <p className="mt-0.5 text-muted-foreground">{item.description}</p>
                    ) : null}
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Qty {item.quantity}
                      {item.unitPrice > 0 ? ` · ${money(item.unitPrice)} each` : ""}
                    </p>
                  </div>
                  <p className="shrink-0 font-medium tabular-nums">{money(item.total)}</p>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex justify-between border-t border-border pt-3 text-sm font-semibold">
              <span>Total</span>
              <span className="tabular-nums">{money(lineTotal)}</span>
            </div>
          </section>
        ) : null}

        {visit.attachments.length > 0 ? (
          <section className="rounded-lg border border-border bg-white p-4">
            <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">
              Photos & attachments
            </h2>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {visit.attachments.map((file) =>
                file.isImage ? (
                  <a
                    key={file.id}
                    href={file.url}
                    target="_blank"
                    rel="noreferrer"
                    className="overflow-hidden rounded-lg border border-border bg-slate-50"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={file.url}
                      alt={file.fileName}
                      className="aspect-square w-full object-cover"
                    />
                  </a>
                ) : file.isVideo ? (
                  <video
                    key={file.id}
                    src={file.url}
                    controls
                    className="aspect-square w-full rounded-lg border border-border bg-slate-50 object-cover"
                  />
                ) : (
                  <a
                    key={file.id}
                    href={file.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex aspect-square items-center justify-center rounded-lg border border-border bg-slate-50 p-3 text-center text-xs font-medium text-storm-sky hover:underline"
                  >
                    {file.fileName}
                  </a>
                )
              )}
            </div>
          </section>
        ) : null}

        {!visit.workSummary &&
        !visit.technician &&
        visit.lineItems.length === 0 &&
        visit.attachments.length === 0 &&
        !when ? (
          <p className="text-sm text-muted-foreground">No visit details are available yet.</p>
        ) : null}
      </div>
    </PortalShell>
  );
}
