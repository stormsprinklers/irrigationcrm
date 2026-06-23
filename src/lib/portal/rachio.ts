import {
  fetchRachioCurrentSchedule,
  fetchRachioEvents,
  fetchRachioSchedules,
  getLinkedDeviceContext,
  runRachioZone,
} from "@/lib/rachio/property";
import type { RachioDeviceKind } from "@/lib/rachio/types";

export async function getPortalRachioOverview(
  companyId: string,
  customerId: string,
  propertyId: string
) {
  const ctx = await getLinkedDeviceContext(companyId, customerId, propertyId);
  if (!ctx.link?.externalDeviceId) return null;

  const metadata = (ctx.link.metadata ?? {}) as Record<string, unknown>;
  const deviceKind = (ctx.deviceKind ?? metadata.deviceKind ?? "controller") as RachioDeviceKind;

  if (deviceKind === "hose_timer" && ctx.baseStation) {
    return {
      deviceKind,
      name: ctx.baseStation.name ?? "Hose timer",
      status: ctx.baseStation.status ?? ctx.baseStation.reportedState,
      zones: (ctx.baseStation.valves ?? []).map((v, i) => ({
        id: v.id,
        name: v.name ?? `Valve ${i + 1}`,
        zoneNumber: i + 1,
        enabled: true,
      })),
    };
  }

  if (!ctx.device) return null;

  return {
    deviceKind: "controller" as const,
    name: ctx.device.name,
    status: ctx.device.status,
    zones: ctx.device.zones ?? [],
  };
}

export { fetchRachioCurrentSchedule, fetchRachioEvents, fetchRachioSchedules };

export async function runPortalRachioZone(
  companyId: string,
  customerId: string,
  propertyId: string,
  zoneId: string,
  durationMinutes: number
) {
  return runRachioZone(companyId, customerId, propertyId, zoneId, durationMinutes);
}
