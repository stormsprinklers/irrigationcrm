"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SprinklerProgrammingSetupTable } from "@/components/irrigation/SprinklerProgrammingSetupTable";
import type { ControllerProgramGuide } from "@/lib/irrigation/runtime-engine";

type Props = {
  customerId: string;
  propertyId: string;
};

export function ControllerProgramGuidePanel({ customerId, propertyId }: Props) {
  const [guide, setGuide] = useState<ControllerProgramGuide | null>(null);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState({
    droughtRestrictionsActive: true,
    cycleSoakEnabled: false,
    grassSeason: "COOL" as "COOL" | "WARM",
  });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    try {
      const qs = refresh ? "?refresh=1" : "";
      const res = await fetch(
        `/api/customers/${customerId}/properties/${propertyId}/irrigation-program${qs}`
      );
      if (res.ok) {
        const data = await res.json();
        setGuide(data.guide);
        if (data.settings) {
          setSettings({
            droughtRestrictionsActive: data.settings.droughtRestrictionsActive ?? true,
            cycleSoakEnabled: data.settings.cycleSoakEnabled ?? false,
            grassSeason: data.settings.grassSeason ?? "COOL",
          });
        }
      }
    } finally {
      setLoading(false);
    }
  }, [customerId, propertyId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveSettings() {
    setSaving(true);
    try {
      const res = await fetch(
        `/api/customers/${customerId}/properties/${propertyId}/irrigation-program`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(settings),
        }
      );
      if (res.ok) {
        const data = await res.json();
        setGuide(data.guide);
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <section className="rounded-lg border border-border bg-white">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">Sprinkler Programming Setup</h2>
        </div>
        <p className="p-4 text-sm text-muted-foreground">Calculating runtimes...</p>
      </section>
    );
  }

  if (!guide || guide.programs.length === 0) {
    return (
      <section className="rounded-lg border border-border bg-white">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">Sprinkler Programming Setup</h2>
        </div>
        <p className="p-4 text-sm text-muted-foreground">
          Add zones with vegetation and irrigation types to generate a programming guide.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-border bg-white">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">Controller settings</h2>
          <p className="text-xs text-muted-foreground">
            Recommendations update from zone attributes, weather, and the settings below.
          </p>
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={() => void load(true)}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-3 border-b border-border p-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settings.droughtRestrictionsActive}
            onChange={(e) =>
              setSettings((s) => ({ ...s, droughtRestrictionsActive: e.target.checked }))
            }
          />
          Drought restrictions (2 days/week)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settings.cycleSoakEnabled}
            onChange={(e) =>
              setSettings((s) => ({ ...s, cycleSoakEnabled: e.target.checked }))
            }
          />
          Cycle-soak for clay/sloped zones (always on when a run exceeds 60 min)
        </label>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Grass season:</span>
          <select
            value={settings.grassSeason}
            onChange={(e) =>
              setSettings((s) => ({
                ...s,
                grassSeason: e.target.value as "COOL" | "WARM",
              }))
            }
            className="h-8 rounded-md border px-2 text-sm"
          >
            <option value="COOL">Cool-season (Utah default)</option>
            <option value="WARM">Warm-season</option>
          </select>
        </div>
        <Button type="button" size="sm" onClick={() => void saveSettings()} disabled={saving}>
          {saving ? "Updating..." : "Update recommendations"}
        </Button>
      </div>

      <div className="p-4">
        <SprinklerProgrammingSetupTable guide={guide} />
      </div>
    </section>
  );
}
