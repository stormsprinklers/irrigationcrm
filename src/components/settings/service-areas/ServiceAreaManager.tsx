"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ServiceArea = {
  id: string;
  name: string;
  slug: string;
  color: string;
  sortOrder: number;
  _count: { zips: number; jobs: number };
};

type ZipRecord = { id: string; zipCode: string };

export function ServiceAreaManager() {
  const [areas, setAreas] = useState<ServiceArea[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zips, setZips] = useState<ZipRecord[]>([]);
  const [zipInput, setZipInput] = useState("");
  const [zipFilter, setZipFilter] = useState("");

  const loadAreas = useCallback(async () => {
    const res = await fetch("/api/settings/service-areas");
    if (!res.ok) {
      toast.error("Failed to load service areas");
      return;
    }
    const data = await res.json();
    setAreas(data);
    if (!selectedId && data.length) setSelectedId(data[0].id);
  }, [selectedId]);

  const loadZips = useCallback(async (areaId: string) => {
    const res = await fetch(`/api/settings/service-areas/${areaId}/zips`);
    if (res.ok) setZips(await res.json());
  }, []);

  useEffect(() => {
    loadAreas().finally(() => setLoading(false));
  }, [loadAreas]);

  useEffect(() => {
    if (selectedId) loadZips(selectedId);
  }, [selectedId, loadZips]);

  async function updateColor(areaId: string, color: string) {
    const res = await fetch(`/api/settings/service-areas/${areaId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ color }),
    });
    if (!res.ok) {
      toast.error("Failed to update color");
      return;
    }
    await loadAreas();
  }

  async function addZips() {
    if (!selectedId || !zipInput.trim()) return;
    const res = await fetch(`/api/settings/service-areas/${selectedId}/zips`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ zips: zipInput }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error ?? "Failed to add zip codes");
      return;
    }
    if (data.added?.length) toast.success(`Added ${data.added.length} zip code(s)`);
    if (data.skipped?.length) toast.message(`${data.skipped.length} zip(s) skipped`);
    setZipInput("");
    await loadAreas();
    await loadZips(selectedId);
  }

  async function removeZip(zipCode: string) {
    if (!selectedId) return;
    const res = await fetch(
      `/api/settings/service-areas/${selectedId}/zips?zipCode=${encodeURIComponent(zipCode)}`,
      { method: "DELETE" }
    );
    if (!res.ok) {
      toast.error("Failed to remove zip");
      return;
    }
    await loadAreas();
    await loadZips(selectedId);
  }

  const selected = areas.find((a) => a.id === selectedId);
  const filteredZips = zips.filter((z) => z.zipCode.includes(zipFilter));

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading service areas...</p>;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Service areas</h3>
        <div className="divide-y rounded-lg border border-border">
          {areas.map((area) => (
            <button
              key={area.id}
              type="button"
              onClick={() => setSelectedId(area.id)}
              className={`flex w-full items-center justify-between px-4 py-3 text-left hover:bg-muted/40 ${
                selectedId === area.id ? "bg-muted/60" : ""
              }`}
            >
              <div className="flex items-center gap-3">
                <span
                  className="h-4 w-4 rounded-full border border-border"
                  style={{ backgroundColor: area.color }}
                />
                <div>
                  <p className="font-medium">{area.name}</p>
                  <p className="text-xs text-muted-foreground">{area.slug}</p>
                </div>
              </div>
              <Badge variant="secondary">{area._count.zips} zips</Badge>
            </button>
          ))}
        </div>
      </div>

      {selected && (
        <div className="space-y-4 rounded-lg border border-border p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">{selected.name}</h3>
              <p className="text-sm text-muted-foreground">
                {selected._count.zips} zip codes · {selected._count.jobs} jobs
              </p>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground">Color</label>
              <input
                type="color"
                value={selected.color}
                onChange={(e) => updateColor(selected.id, e.target.value)}
                className="h-8 w-10 cursor-pointer rounded border border-border"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Add zip codes</label>
            <p className="text-xs text-muted-foreground">
              Enter comma or space separated 5-digit US zip codes
            </p>
            <textarea
              value={zipInput}
              onChange={(e) => setZipInput(e.target.value)}
              className="min-h-[80px] w-full rounded-md border border-border px-3 py-2 text-sm"
              placeholder="84057, 84058, 84604"
            />
            <Button size="sm" onClick={addZips}>
              Add zips
            </Button>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Zip codes</label>
              <Input
                value={zipFilter}
                onChange={(e) => setZipFilter(e.target.value)}
                placeholder="Search..."
                className="h-8 w-32"
              />
            </div>
            <div className="max-h-64 overflow-y-auto rounded-md border border-border">
              {filteredZips.length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground">No zip codes yet</p>
              ) : (
                filteredZips.map((zip) => (
                  <div
                    key={zip.id}
                    className="flex items-center justify-between border-b border-border px-3 py-2 last:border-b-0"
                  >
                    <span className="font-mono text-sm">{zip.zipCode}</span>
                    <Button variant="ghost" size="sm" onClick={() => removeZip(zip.zipCode)}>
                      Remove
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
