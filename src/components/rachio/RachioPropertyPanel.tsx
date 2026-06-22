"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Droplets, RefreshCw, Square, Play } from "lucide-react";
import { toast } from "sonner";
import { RachioDeviceLinker } from "@/components/rachio/RachioDeviceLinker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  RachioCurrentSchedule,
  RachioDevice,
  RachioEvent,
  RachioFlexScheduleRule,
  RachioScheduleRule,
} from "@/lib/rachio/types";

type LinkInfo = {
  id: string;
  externalDeviceId: string | null;
  status: string;
  metadata: Record<string, unknown> | null;
  lastSyncedAt: string | null;
};

type Props = {
  customerId: string;
  propertyId: string;
  propertyName: string;
};

function formatDuration(seconds: number | undefined | null) {
  if (!seconds) return "—";
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function formatTimestamp(ms: number | undefined | null) {
  if (!ms) return "—";
  return new Date(ms).toLocaleString();
}

export function RachioPropertyPanel({ customerId, propertyId, propertyName }: Props) {
  const [linked, setLinked] = useState(false);
  const [link, setLink] = useState<LinkInfo | null>(null);
  const [device, setDevice] = useState<RachioDevice | null>(null);
  const [current, setCurrent] = useState<RachioCurrentSchedule | null>(null);
  const [schedules, setSchedules] = useState<{
    scheduleRules: RachioScheduleRule[];
    flexScheduleRules: RachioFlexScheduleRule[];
  }>({ scheduleRules: [], flexScheduleRules: [] });
  const [events, setEvents] = useState<RachioEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [zoneDuration, setZoneDuration] = useState<Record<string, number>>({});
  const [runningZone, setRunningZone] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);

  const baseUrl = `/api/customers/${customerId}/properties/${propertyId}/rachio`;

  const loadAll = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch(baseUrl);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load Rachio data");

      setLinked(Boolean(data.linked));
      setLink(data.link ?? null);
      setDevice(data.device ?? null);

      if (data.linked) {
        const [currentRes, schedulesRes, eventsRes] = await Promise.all([
          fetch(`${baseUrl}/current`),
          fetch(`${baseUrl}/schedules`),
          fetch(`${baseUrl}/events?days=30`),
        ]);

        if (currentRes.ok) {
          const currentData = await currentRes.json();
          setCurrent(currentData.current ?? null);
        }
        if (schedulesRes.ok) {
          setSchedules(await schedulesRes.json());
        }
        if (eventsRes.ok) {
          const eventsData = await eventsRes.json();
          setEvents(eventsData.events ?? []);
        }
      } else {
        setCurrent(null);
        setSchedules({ scheduleRules: [], flexScheduleRules: [] });
        setEvents([]);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load Rachio data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [baseUrl]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  async function startZone(zoneId: string) {
    const durationMinutes = zoneDuration[zoneId] ?? 5;
    setRunningZone(zoneId);
    try {
      const res = await fetch(`${baseUrl}/zones/${zoneId}/start`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ durationMinutes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to start zone");
      toast.success("Zone started");
      void loadAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start zone");
    } finally {
      setRunningZone(null);
    }
  }

  async function stopAll() {
    setStopping(true);
    try {
      const res = await fetch(`${baseUrl}/stop`, { method: "PUT" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to stop watering");
      toast.success("Watering stopped");
      void loadAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to stop watering");
    } finally {
      setStopping(false);
    }
  }

  async function unlink() {
    try {
      const res = await fetch(`${baseUrl}/link`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to unlink");
      }
      toast.success("Rachio controller unlinked");
      void loadAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to unlink");
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading Rachio…</p>;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center gap-2">
          <Droplets className="h-4 w-4 text-storm-sky" />
          <CardTitle className="text-base">Rachio · {propertyName}</CardTitle>
        </div>
        <div className="flex items-center gap-2">
          {linked ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void loadAll()}
              disabled={refreshing}
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        {!linked ? (
          <RachioDeviceLinker
            customerId={customerId}
            propertyId={propertyId}
            onLinked={() => void loadAll()}
          />
        ) : (
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="mb-4 grid w-full grid-cols-4">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="zones">Zones</TabsTrigger>
              <TabsTrigger value="schedules">Schedules</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{device?.name ?? "Rachio controller"}</p>
                  <p className="text-sm text-muted-foreground">
                    {device?.serialNumber ? `SN ${device.serialNumber}` : null}
                    {device?.model ? ` · ${device.model}` : null}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge variant={device?.status === "ONLINE" ? "default" : "secondary"}>
                      {device?.status ?? link?.status ?? "Unknown"}
                    </Badge>
                    {device?.on === false ? (
                      <Badge variant="outline">Device off</Badge>
                    ) : null}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => void stopAll()}
                    disabled={stopping}
                  >
                    <Square className="mr-1 h-4 w-4" />
                    Stop all
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => void unlink()}>
                    Unlink
                  </Button>
                </div>
              </div>

              {current ? (
                <div className="rounded-md border border-storm-ice bg-highlight-panel p-3 text-sm">
                  <p className="font-medium">Currently running</p>
                  <p className="text-muted-foreground">
                    {current.name ?? "Active schedule"} ·{" "}
                    {formatDuration(current.totalDuration)}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No active watering run.</p>
              )}

              {link?.lastSyncedAt ? (
                <p className="text-xs text-muted-foreground">
                  Last synced {formatTimestamp(new Date(link.lastSyncedAt).getTime())}
                </p>
              ) : null}
            </TabsContent>

            <TabsContent value="zones">
              {!device?.zones?.length ? (
                <p className="text-sm text-muted-foreground">No zones found.</p>
              ) : (
                <ScrollArea className="h-72">
                  <ul className="divide-y">
                    {device.zones.map((zone) => (
                      <li key={zone.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">
                            {zone.name}
                            {zone.enabled === false ? (
                              <Badge variant="outline" className="ml-2">
                                Disabled
                              </Badge>
                            ) : null}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Last watered {formatTimestamp(zone.lastWateredDate)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min={1}
                            max={180}
                            className="w-20"
                            value={zoneDuration[zone.id] ?? 5}
                            onChange={(e) =>
                              setZoneDuration({
                                ...zoneDuration,
                                [zone.id]: Number(e.target.value) || 5,
                              })
                            }
                          />
                          <span className="text-xs text-muted-foreground">min</span>
                          <Button
                            type="button"
                            size="sm"
                            disabled={runningZone === zone.id || zone.enabled === false}
                            onClick={() => void startZone(zone.id)}
                          >
                            <Play className="h-4 w-4" />
                            Run
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              )}
            </TabsContent>

            <TabsContent value="schedules">
              <div className="space-y-4">
                <div>
                  <h4 className="mb-2 text-sm font-medium">Fixed schedules</h4>
                  {!schedules.scheduleRules.length ? (
                    <p className="text-sm text-muted-foreground">No fixed schedules.</p>
                  ) : (
                    <ul className="space-y-2">
                      {schedules.scheduleRules.map((rule) => (
                        <li key={rule.id} className="rounded-md border p-3 text-sm">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium">{rule.name}</span>
                            <Badge variant={rule.enabled ? "default" : "secondary"}>
                              {rule.enabled ? "Enabled" : "Disabled"}
                            </Badge>
                          </div>
                          <p className="mt-1 text-muted-foreground">
                            {rule.zones?.length ?? 0} zones ·{" "}
                            {formatDuration(rule.totalDuration)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <h4 className="mb-2 text-sm font-medium">Flex schedules</h4>
                  {!schedules.flexScheduleRules.length ? (
                    <p className="text-sm text-muted-foreground">No flex schedules.</p>
                  ) : (
                    <ul className="space-y-2">
                      {schedules.flexScheduleRules.map((rule) => (
                        <li key={rule.id} className="rounded-md border p-3 text-sm">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium">{rule.name ?? "Flex schedule"}</span>
                            <Badge variant={rule.enabled ? "default" : "secondary"}>
                              {rule.enabled ? "Enabled" : "Disabled"}
                            </Badge>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="history">
              {!events.length ? (
                <p className="text-sm text-muted-foreground">No watering events in the last 30 days.</p>
              ) : (
                <ScrollArea className="h-72">
                  <ul className="divide-y">
                    {events
                      .slice()
                      .sort((a, b) => (b.eventDate ?? 0) - (a.eventDate ?? 0))
                      .map((event, index) => (
                        <li key={event.id ?? `${event.eventDate}-${index}`} className="py-3 text-sm">
                          <p className="font-medium">
                            {event.zoneName ?? event.type ?? "Event"}
                          </p>
                          <p className="text-muted-foreground">
                            {formatTimestamp(event.eventDate)} ·{" "}
                            {formatDuration(event.duration)}
                            {event.type ? ` · ${event.type}` : ""}
                          </p>
                        </li>
                      ))}
                  </ul>
                </ScrollArea>
              )}
            </TabsContent>
          </Tabs>
        )}

        {!linked ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Need an API key?{" "}
            <Link href="/settings/maintenance" className="text-primary hover:underline">
              Configure Rachio in Settings
            </Link>
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
