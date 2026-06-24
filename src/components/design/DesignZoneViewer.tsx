"use client";

import { useMemo, useState } from "react";

type DesignSnapshot = {
  zones?: Array<{ id: string; name: string; hydrozoneIds?: string[] }>;
  heads?: Array<{ id: string; zoneId: string; position: { x: number; y: number } }>;
  pipes?: Array<{ id: string; zoneId: string; points: Array<{ x: number; y: number }> }>;
  valves?: Array<{ id: string; zoneId: string; position: { x: number; y: number } }>;
  hydrozones?: Array<{ id: string; name: string; vertices: Array<{ x: number; y: number }>; zoneId?: string }>;
};

const ZONE_COLORS = ["#22c55e", "#3b82f6", "#f59e0b", "#a855f7", "#ef4444", "#06b6d4"];

type Props = {
  snapshot: DesignSnapshot;
  showPartsCounts?: boolean;
  internalBom?: Array<{ description?: string; quantity?: number }> | null;
};

export function DesignZoneViewer({ snapshot, showPartsCounts = false }: Props) {
  const [activeZoneId, setActiveZoneId] = useState<string | null>(snapshot.zones?.[0]?.id ?? null);

  const bounds = useMemo(() => {
    const points: Array<{ x: number; y: number }> = [];
    for (const hz of snapshot.hydrozones ?? []) points.push(...hz.vertices);
    for (const head of snapshot.heads ?? []) points.push(head.position);
    if (!points.length) return { minX: 0, minY: 0, maxX: 400, maxY: 300 };
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    return {
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...xs),
      maxY: Math.max(...ys),
    };
  }, [snapshot]);

  const width = Math.max(320, bounds.maxX - bounds.minX + 40);
  const height = Math.max(240, bounds.maxY - bounds.minY + 40);

  function mapPoint(p: { x: number; y: number }) {
    return {
      x: p.x - bounds.minX + 20,
      y: p.y - bounds.minY + 20,
    };
  }

  const activeZone = snapshot.zones?.find((z) => z.id === activeZoneId);
  const zoneHeads = (snapshot.heads ?? []).filter((h) => h.zoneId === activeZoneId);
  const zonePipes = (snapshot.pipes ?? []).filter((p) => p.zoneId === activeZoneId);
  const zoneValves = (snapshot.valves ?? []).filter((v) => v.zoneId === activeZoneId);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {(snapshot.zones ?? []).map((zone, index) => (
          <button
            key={zone.id}
            type="button"
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              activeZoneId === zone.id ? "text-white" : "bg-muted text-foreground"
            }`}
            style={activeZoneId === zone.id ? { backgroundColor: ZONE_COLORS[index % ZONE_COLORS.length] } : undefined}
            onClick={() => setActiveZoneId(zone.id)}
          >
            {zone.name}
          </button>
        ))}
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} className="w-full rounded border bg-slate-50">
        {(snapshot.hydrozones ?? []).map((hz) => {
          const mapped = hz.vertices.map(mapPoint);
          const points = mapped.map((p) => `${p.x},${p.y}`).join(" ");
          const isActive = hz.zoneId === activeZoneId || activeZone?.hydrozoneIds?.includes(hz.id);
          return (
            <polygon
              key={hz.id}
              points={points}
              fill={isActive ? "rgba(34,197,94,0.25)" : "rgba(148,163,184,0.15)"}
              stroke={isActive ? "#16a34a" : "#94a3b8"}
              strokeWidth={isActive ? 2 : 1}
            />
          );
        })}

        {zonePipes.map((pipe) => (
          <polyline
            key={pipe.id}
            points={pipe.points.map((p) => {
              const m = mapPoint(p);
              return `${m.x},${m.y}`;
            }).join(" ")}
            fill="none"
            stroke="#1d4ed8"
            strokeWidth={4}
          />
        ))}

        {zoneValves.map((valve) => {
          const m = mapPoint(valve.position);
          return <circle key={valve.id} cx={m.x} cy={m.y} r={8} fill="#dc2626" />;
        })}

        {zoneHeads.map((head) => {
          const m = mapPoint(head.position);
          return <circle key={head.id} cx={m.x} cy={m.y} r={5} fill="#2563eb" />;
        })}
      </svg>

      {activeZone ? (
        <p className="text-sm text-muted-foreground">
          {activeZone.name}: {zoneHeads.length} heads · {zonePipes.length} pipe runs · {zoneValves.length} valves
          {showPartsCounts ? "" : " — click zones to explore your system layout"}
        </p>
      ) : null}
    </div>
  );
}
