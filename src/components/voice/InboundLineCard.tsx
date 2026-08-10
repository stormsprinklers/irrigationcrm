"use client";

import { formatPhoneDisplay } from "@/lib/inbox/phone";

export type InboundLineInfo = {
  /** PhoneNumber.friendlyName — e.g. "PPC Repair tracking". */
  title: string | null;
  /** Company number the caller dialed (E.164). */
  e164: string | null;
  /** PhoneNumber.trackingSource / CallLog.trackingSource when set. */
  trackingSource: string | null;
};

export function hasInboundLineInfo(info: InboundLineInfo | null | undefined): boolean {
  if (!info) return false;
  return Boolean(
    info.title?.trim() || info.trackingSource?.trim() || info.e164?.trim()
  );
}

/**
 * Distinct card for the company line that was dialed — never mixed with the caller's phone.
 */
export function InboundLineCard({
  info,
  className = "",
}: {
  info: InboundLineInfo | null | undefined;
  className?: string;
}) {
  if (!hasInboundLineInfo(info) || !info) return null;

  const title = info.title?.trim() || null;
  const source = info.trackingSource?.trim() || null;
  const e164 = info.e164?.trim() || null;
  const e164Display = e164 ? formatPhoneDisplay(e164) : null;

  return (
    <div
      className={`rounded-md border border-sky-200 bg-sky-50 px-3 py-2.5 text-sm text-sky-950 ${className}`}
      role="group"
      aria-label="Inbound company line"
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-800/80">
        Called our line
      </p>
      <dl className="mt-1.5 space-y-1">
        {title ? (
          <div>
            <dt className="text-xs text-sky-800/70">Line title</dt>
            <dd className="font-medium leading-snug">{title}</dd>
          </div>
        ) : null}
        {source ? (
          <div>
            <dt className="text-xs text-sky-800/70">Lead source</dt>
            <dd className="font-medium leading-snug">{source}</dd>
          </div>
        ) : null}
        {e164Display && !title ? (
          <div>
            <dt className="text-xs text-sky-800/70">Number</dt>
            <dd className="font-medium tabular-nums leading-snug">{e164Display}</dd>
          </div>
        ) : null}
        {e164Display && title ? (
          <p className="text-xs tabular-nums text-sky-800/70">{e164Display}</p>
        ) : null}
      </dl>
    </div>
  );
}
