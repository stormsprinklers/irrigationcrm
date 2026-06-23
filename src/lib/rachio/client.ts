import { prisma } from "@/lib/prisma";
import type {
  RachioBaseStation,
  RachioCurrentSchedule,
  RachioDevice,
  RachioDeviceSummary,
  RachioEvent,
  RachioPerson,
  RachioPersonInfo,
  RachioProperty,
} from "@/lib/rachio/types";
import { RachioApiError } from "@/lib/rachio/types";

const RACHIO_BASE = "https://api.rach.io/1";
const RACHIO_CLOUD_REST = "https://cloud-rest.rach.io";

type RachioFetchOptions = {
  method?: "GET" | "PUT" | "POST" | "DELETE";
  body?: unknown;
};

export async function rachioFetch<T>(
  apiKey: string,
  path: string,
  options: RachioFetchOptions = {}
): Promise<T> {
  const res = await fetch(`${RACHIO_BASE}${path}`, {
    method: options.method ?? "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });

  if (res.status === 204) {
    return undefined as T;
  }

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const err = data as { error?: string; code?: number } | null;
    throw new RachioApiError(
      err?.error ?? `Rachio API error (${res.status})`,
      res.status,
      err?.code
    );
  }

  return data as T;
}

async function cloudRestFetch<T>(
  apiKey: string,
  path: string,
  options: RachioFetchOptions = {}
): Promise<T> {
  const res = await fetch(`${RACHIO_CLOUD_REST}/${path}`, {
    method: options.method ?? "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });

  if (res.status === 204) {
    return undefined as T;
  }

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const err = data as { error?: string; code?: number; message?: string } | null;
    throw new RachioApiError(
      err?.error ?? err?.message ?? `Rachio API error (${res.status})`,
      res.status,
      err?.code
    );
  }

  return data as T;
}

export async function resolveCompanyRachio(companyId: string) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { rachioApiKey: true, rachioPersonId: true },
  });

  if (!company?.rachioApiKey) {
    throw new RachioApiError("Rachio API key not configured", 400);
  }

  return {
    apiKey: company.rachioApiKey,
    personId: company.rachioPersonId,
  };
}

export async function getPersonInfo(apiKey: string) {
  return rachioFetch<RachioPersonInfo>(apiKey, "/public/person/info");
}

export async function getPerson(apiKey: string, personId: string) {
  return rachioFetch<RachioPerson>(apiKey, `/public/person/${personId}`);
}

export async function getDevice(apiKey: string, deviceId: string) {
  return rachioFetch<RachioDevice>(apiKey, `/public/device/${deviceId}`);
}

export async function getBaseStation(apiKey: string, baseStationId: string) {
  return cloudRestFetch<RachioBaseStation>(apiKey, `valve/getBaseStation/${baseStationId}`);
}

export async function listBaseStations(apiKey: string, personId: string) {
  const data = await cloudRestFetch<{ baseStations?: RachioBaseStation[] }>(
    apiKey,
    `valve/listBaseStations/${personId}`
  );
  return data.baseStations ?? [];
}

export async function listRachioProperties(apiKey: string, personId: string) {
  const data = await cloudRestFetch<{ properties?: RachioProperty[] } | RachioProperty[]>(
    apiKey,
    `property/listProperties/${personId}`
  );
  if (Array.isArray(data)) return data;
  return data.properties ?? [];
}

export async function findRachioPropertyForEntity(
  apiKey: string,
  entity: { deviceId?: string; baseStationId?: string }
): Promise<RachioProperty | null> {
  const query = entity.baseStationId
    ? `property/findPropertyByEntity?resource_id.base_station_id=${encodeURIComponent(entity.baseStationId)}`
    : entity.deviceId
      ? `property/findPropertyByEntity?resource_id.location_id=${encodeURIComponent(entity.deviceId)}`
      : null;
  if (!query) return null;

  try {
    const data = await cloudRestFetch<RachioProperty | { property?: RachioProperty; id?: string }>(
      apiKey,
      query
    );
    if (data && typeof data === "object" && "property" in data && data.property) {
      return data.property;
    }
    return data as RachioProperty;
  } catch {
    return null;
  }
}

export async function getCurrentSchedule(apiKey: string, deviceId: string) {
  return rachioFetch<RachioCurrentSchedule | null>(
    apiKey,
    `/public/device/${deviceId}/current_schedule`
  );
}

export async function getDeviceEvents(
  apiKey: string,
  deviceId: string,
  startTime: number,
  endTime: number
) {
  return rachioFetch<RachioEvent[]>(
    apiKey,
    `/public/device/${deviceId}/event?startTime=${startTime}&endTime=${endTime}`
  );
}

export async function startZone(apiKey: string, zoneId: string, durationSec: number) {
  const duration = Math.min(10800, Math.max(1, Math.round(durationSec)));
  return rachioFetch<void>(apiKey, "/public/zone/start", {
    method: "PUT",
    body: { id: zoneId, duration },
  });
}

export async function stopDeviceWater(apiKey: string, deviceId: string) {
  return rachioFetch<void>(apiKey, "/public/device/stop_water", {
    method: "PUT",
    body: { id: deviceId },
  });
}

export function summarizeDevices(person: RachioPerson): RachioDeviceSummary[] {
  return (person.devices ?? []).map((device) => ({
    id: device.id,
    name: device.name,
    serialNumber: device.serialNumber,
    model: device.model,
    status: device.status,
    zoneCount: device.zones?.length ?? 0,
  }));
}

export function summarizeBaseStations(stations: RachioBaseStation[]): RachioDeviceSummary[] {
  return stations.flatMap((station) => {
    const id =
      station.id ??
      (station as RachioBaseStation & { baseStationId?: string }).baseStationId ??
      (station as RachioBaseStation & { locationId?: string }).locationId;
    if (!id) return [];

    return [
      {
        id,
        name: station.name ?? "Hose timer",
        serialNumber: station.serialNumber,
        model: station.model,
        status: station.status ?? station.reportedState,
        zoneCount: station.valves?.length ?? 0,
      },
    ];
  });
}

export async function listCompanyBaseStations(companyId: string) {
  const { apiKey, personId } = await resolveCompanyRachio(companyId);
  if (!personId) {
    throw new RachioApiError(
      "Rachio not connected — test connection in Settings first",
      400
    );
  }
  const stations = await listBaseStations(apiKey, personId);
  return summarizeBaseStations(stations);
}

export async function listCompanyDevices(companyId: string) {
  const { apiKey, personId } = await resolveCompanyRachio(companyId);
  if (!personId) {
    throw new RachioApiError(
      "Rachio not connected — test connection in Settings first",
      400
    );
  }
  const person = await getPerson(apiKey, personId);
  return summarizeDevices(person);
}

export async function syncCompanyPersonId(companyId: string, apiKey: string) {
  const info = await getPersonInfo(apiKey);
  const person = await getPerson(apiKey, info.id);

  await prisma.company.update({
    where: { id: companyId },
    data: { rachioPersonId: info.id },
  });

  return {
    personId: info.id,
    fullName: person.fullName ?? person.username ?? null,
    email: person.email ?? null,
    devices: summarizeDevices(person),
  };
}

export function enrichEventsWithZoneNames(
  events: RachioEvent[],
  zones: RachioDevice["zones"]
): RachioEvent[] {
  const zoneMap = new Map((zones ?? []).map((z) => [z.id, z.name]));
  return events.map((event) => ({
    ...event,
    zoneName: event.zoneId ? zoneMap.get(event.zoneId) ?? event.zoneName : event.zoneName,
  }));
}
