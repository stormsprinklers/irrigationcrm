"use client";

import { useCallback, useEffect, useState } from "react";
import { PortalShell } from "./PortalShell";

type TrackPayload = {
  company: {
    name: string;
    phone: string | null;
    emailLogoUrl: string | null;
    slug: string;
  };
  visit: {
    title: string;
    status: string;
    destination: string | null;
  };
  technician: {
    name: string;
    photoUrl: string | null;
    firstName: string;
  };
  tracking: {
    active: boolean;
    stale: boolean;
    lat: number | null;
    lng: number | null;
    updatedAt: string | null;
    etaLabel: string | null;
    etaMinutes: number | null;
    etaArrivalAt: string | null;
    mapEmbedUrl: string | null;
  };
};

type Props = {
  slug: string;
  token: string;
};

export function PortalLiveTrackView({ slug, token }: Props) {
  const [data, setData] = useState<TrackPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/portal/track/${encodeURIComponent(token)}`, {
        cache: "no-store",
      });
      const json = (await res.json()) as TrackPayload & { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Tracking unavailable");
        setData(null);
        return;
      }
      if (json.company.slug !== slug) {
        setError("Tracking link does not match this portal");
        setData(null);
        return;
      }
      setData(json);
      setError(null);
    } catch {
      setError("Failed to load tracking");
    } finally {
      setLoading(false);
    }
  }, [slug, token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!data?.tracking.active) return;
    const id = window.setInterval(() => void load(), 12_000);
    return () => window.clearInterval(id);
  }, [data?.tracking.active, load]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f8fafc] text-sm text-slate-600">
        Loading live tracking…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f8fafc] px-4">
        <div className="max-w-md rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-slate-900">Tracking unavailable</h1>
          <p className="mt-2 text-sm text-slate-600">
            {error ?? "This link may have expired or the technician has already arrived."}
          </p>
        </div>
      </div>
    );
  }

  const { company, visit, technician, tracking } = data;
  const updatedLabel = tracking.updatedAt
    ? new Date(tracking.updatedAt).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  return (
    <PortalShell
      slug={slug}
      companyName={company.name}
      emailLogoUrl={company.emailLogoUrl}
      features={{
        jobs: false,
        invoices: false,
        estimates: false,
        maintenance: false,
        checklists: false,
        rachio: false,
        offers: false,
        referrals: false,
        allowSchedule: false,
      }}
      guest
    >
      <div className="portal-container space-y-5 py-6">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
            Live technician tracking
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">
            {technician.firstName} is on the way
          </h1>
          <p className="mt-1 text-sm text-slate-600">{visit.title}</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            {technician.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={technician.photoUrl}
                alt={technician.name}
                className="h-14 w-14 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-lg font-semibold text-slate-600">
                {technician.firstName.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div>
              <p className="font-medium text-slate-900">{technician.name}</p>
              {tracking.active ? (
                <p className="text-sm text-emerald-700">
                  {tracking.stale
                    ? "Waiting for a fresh location update…"
                    : "Sharing live location"}
                </p>
              ) : (
                <p className="text-sm text-slate-600">
                  Tracking ended — your technician may have arrived.
                </p>
              )}
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              <p className="text-xs uppercase tracking-wide text-slate-500">ETA</p>
              <p className="mt-0.5 text-sm font-medium text-slate-900">
                {tracking.etaLabel ?? "Updating soon"}
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              <p className="text-xs uppercase tracking-wide text-slate-500">Last update</p>
              <p className="mt-0.5 text-sm font-medium text-slate-900">
                {updatedLabel ?? "—"}
              </p>
            </div>
          </div>

          {visit.destination ? (
            <p className="mt-3 text-sm text-slate-600">
              Heading to <span className="font-medium text-slate-800">{visit.destination}</span>
            </p>
          ) : null}
        </div>

        {tracking.mapEmbedUrl ? (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <iframe
              key={tracking.updatedAt ?? tracking.mapEmbedUrl}
              title="Technician location map"
              src={tracking.mapEmbedUrl}
              className="h-[360px] w-full border-0 sm:h-[420px]"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
            />
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-600">
            Map will appear once location is available.
          </div>
        )}

        {company.phone ? (
          <p className="text-center text-sm text-slate-500">
            Questions? Call{" "}
            <a className="font-medium text-slate-800 underline" href={`tel:${company.phone}`}>
              {company.phone}
            </a>
          </p>
        ) : null}
      </div>
    </PortalShell>
  );
}
