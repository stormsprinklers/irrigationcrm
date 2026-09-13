"use client";

export type TrendPoint = { date: string; value: number | null };

/** Small, responsive charts inherit the company's primary brand color. */
export function MetricTrend({ points, label, unit = "", large = false, compact = false }: {
  points: TrendPoint[]; label: string; unit?: string; large?: boolean; compact?: boolean;
}) {
  const values = points.flatMap((p) => p.value == null ? [] : [p.value]);
  if (!values.length) return <p className="mt-3 text-xs text-muted-foreground">No trend data yet.</p>;
  const max = Math.max(1, ...values);
  const x = (i: number) => 8 + i * 304 / Math.max(1, points.length - 1);
  const y = (v: number) => 88 - v / max * 76;
  let previousValid = false;
  const path = points.map((p, i) => {
    if (p.value == null) { previousValid = false; return ""; }
    const command = previousValid ? "L" : "M";
    previousValid = true;
    return `${command}${x(i)},${y(p.value)}`;
  }).join(" ");
  return <figure className="mt-4 min-w-0">
    <div className="mb-1 flex justify-between text-[10px] text-muted-foreground"><span>{label}{unit ? ` (${unit})` : ""}</span><span>0–{Number(max.toFixed(1)).toLocaleString()}</span></div>
    <svg viewBox="0 0 320 100" className={large ? "h-48 w-full text-primary" : compact ? "h-14 w-full text-primary" : "h-20 w-full text-primary"} role="img" aria-label={`${label} over time`}>
      <path d="M8 88H312 M8 50H312 M8 12H312" stroke="currentColor" strokeOpacity="0.12" fill="none" />
      <path d={path} stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinejoin="round" />
      {points.map((p, i) => p.value == null ? null : <circle key={p.date} cx={x(i)} cy={y(p.value)} r="3" fill="currentColor" tabIndex={0} aria-label={`${p.date}: ${p.value} ${unit}`}><title>{p.date}: {p.value.toLocaleString()} {unit}</title></circle>)}
    </svg>
    <figcaption className="flex justify-between text-[10px] text-muted-foreground"><span>{points[0]?.date}</span><span>Date (UTC)</span><span>{points.at(-1)?.date}</span></figcaption>
    {large && <details className="mt-2 text-xs text-muted-foreground"><summary className="cursor-pointer">View daily values</summary><div className="mt-2 max-h-40 overflow-auto">{points.map((p) => <p key={p.date}>{p.date}: {p.value ?? "No data"} {unit}</p>)}</div></details>}
  </figure>;
}
