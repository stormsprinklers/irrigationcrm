export type CustomerTrackingData = {
  gclid?: string | null;
  gbraid?: string | null;
  wbraid?: string | null;
  fbc?: string | null;
  fbp?: string | null;
  metaLeadId?: string | null;
  userAgent?: string | null;
  attributionSource?: string | null;
  attributionMedium?: string | null;
  attributionCampaign?: string | null;
  attributionContent?: string | null;
  attributionTerm?: string | null;
};

const TRACKING_FIELDS: Array<[keyof CustomerTrackingData, string]> = [
  ["gclid", "gclid"],
  ["gbraid", "gbraid"],
  ["wbraid", "wbraid"],
  ["fbc", "fbc"],
  ["fbp", "fbp"],
  ["metaLeadId", "facebook_lead_id"],
  ["userAgent", "user_agent"],
  ["attributionSource", "utm_source"],
  ["attributionMedium", "utm_medium"],
  ["attributionCampaign", "utm_campaign"],
  ["attributionContent", "utm_content"],
  ["attributionTerm", "utm_term"],
];

export function TrackingDataDisclosure({
  data,
  className = "",
}: {
  data: CustomerTrackingData;
  className?: string;
}) {
  const values = TRACKING_FIELDS.filter(([key]) => Boolean(data[key]));

  return (
    <details className={`rounded-md border border-blue-200 bg-blue-50/50 text-sm ${className}`}>
      <summary className="cursor-pointer select-none px-3 py-2 font-medium text-blue-900">
        Customer Tracking Data
      </summary>
      <div className="border-t border-blue-200 px-3 py-2">
        {values.length ? (
          <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
            {values.map(([key, label]) => (
              <div key={key} className="min-w-0">
                <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
                <dd className="break-all text-foreground">{data[key]}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-muted-foreground">No tracking data captured.</p>
        )}
      </div>
    </details>
  );
}
