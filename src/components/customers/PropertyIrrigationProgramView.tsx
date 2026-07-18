"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Pencil, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { SprinklerProgrammingSetupTable } from "@/components/irrigation/SprinklerProgrammingSetupTable";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ControllerProgramGuide } from "@/lib/irrigation/runtime-engine";

type Props = {
  customerId: string;
  propertyId: string;
  mapStatus?: string | null;
  onEdit: () => void;
};

export function PropertyIrrigationProgramView({
  customerId,
  propertyId,
  mapStatus,
  onEdit,
}: Props) {
  const [guide, setGuide] = useState<ControllerProgramGuide | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [settings, setSettings] = useState({
    droughtRestrictionsActive: true,
    cycleSoakEnabled: false,
    grassSeason: "COOL" as "COOL" | "WARM",
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const load = useCallback(
    async (refresh = false) => {
      if (refresh) setRefreshing(true);
      else setLoading(true);
      try {
        const qs = refresh ? "?refresh=1" : "";
        const res = await fetch(
          `/api/customers/${customerId}/properties/${propertyId}/irrigation-program${qs}`
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Failed to load programming guide");
        setGuide(data.guide ?? null);
        if (data.settings) {
          setSettings({
            droughtRestrictionsActive: data.settings.droughtRestrictionsActive ?? true,
            cycleSoakEnabled: data.settings.cycleSoakEnabled ?? false,
            grassSeason: data.settings.grassSeason ?? "COOL",
          });
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to load programming guide");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [customerId, propertyId]
  );

  useEffect(() => {
    void load();
  }, [load]);

  async function saveSettings() {
    setSavingSettings(true);
    try {
      const res = await fetch(
        `/api/customers/${customerId}/properties/${propertyId}/irrigation-program`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(settings),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to update settings");
      setGuide(data.guide ?? null);
      toast.success("Programming recommendations updated");
      setShowSettings(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update settings");
    } finally {
      setSavingSettings(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base">Irrigation map & programming</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {mapStatus === "PUBLISHED"
              ? "Published to the customer portal. Runtimes update from weather and zone settings."
              : "Draft programming from your zone map. Publish from Edit when ready."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void load(true)}
            disabled={loading || refreshing}
          >
            {refreshing ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-1 h-4 w-4" />
            )}
            Refresh
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setShowSettings((v) => !v)}>
            Settings
          </Button>
          <Button type="button" size="sm" onClick={onEdit}>
            <Pencil className="mr-1 h-4 w-4" />
            Edit
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {showSettings ? (
          <div className="space-y-3 rounded-md border border-border bg-muted/20 p-4">
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
            <div className="flex flex-wrap items-center gap-2 text-sm">
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
            <Button type="button" size="sm" onClick={() => void saveSettings()} disabled={savingSettings}>
              {savingSettings ? "Updating…" : "Update recommendations"}
            </Button>
          </div>
        ) : null}

        {loading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Calculating runtimes…
          </p>
        ) : guide ? (
          <SprinklerProgrammingSetupTable guide={guide} />
        ) : (
          <p className="text-sm text-muted-foreground">
            No programming guide yet. Edit the irrigation map to add zones.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
