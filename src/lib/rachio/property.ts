import { SmartControllerProvider, SmartControllerStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  enrichEventsWithZoneNames,
  getBaseStation,
  getCurrentSchedule,
  getDevice,
  getDeviceEvents,
  resolveCompanyRachio,
  startZone,
  stopDeviceWater,
} from "@/lib/rachio/client";
import type { RachioDeviceKind } from "@/lib/rachio/types";
import { RachioApiError } from "@/lib/rachio/types";

export async function assertPropertyAccess(
  companyId: string,
  customerId: string,
  propertyId: string
) {
  const property = await prisma.customerProperty.findFirst({
    where: { id: propertyId, customerId, companyId },
    include: {
      smartControllers: {
        where: { provider: SmartControllerProvider.RACHIO },
      },
    },
  });

  if (!property) {
    throw new RachioApiError("Property not found", 404);
  }

  return property;
}

export async function getLinkedRachioController(propertyId: string) {
  return prisma.propertySmartController.findUnique({
    where: {
      propertyId_provider: {
        propertyId,
        provider: SmartControllerProvider.RACHIO,
      },
    },
  });
}

export async function getLinkedDeviceContext(
  companyId: string,
  customerId: string,
  propertyId: string
) {
  await assertPropertyAccess(companyId, customerId, propertyId);
  const link = await getLinkedRachioController(propertyId);
  if (!link?.externalDeviceId) {
    return { link: null, device: null, apiKey: null, deviceKind: null as RachioDeviceKind | null, baseStation: null };
  }

  const { apiKey } = await resolveCompanyRachio(companyId);
  const metadata = (link.metadata ?? {}) as Record<string, unknown>;
  const deviceKind = (metadata.deviceKind as RachioDeviceKind) ?? "controller";

  if (deviceKind === "hose_timer") {
    const baseStation = await getBaseStation(apiKey, link.externalDeviceId);
    await prisma.propertySmartController.update({
      where: { id: link.id },
      data: {
        status:
          baseStation.status === "ONLINE" || baseStation.reportedState === "ONLINE"
            ? SmartControllerStatus.CONNECTED
            : SmartControllerStatus.DISCONNECTED,
        lastSyncedAt: new Date(),
        metadata: {
          ...metadata,
          deviceKind,
          deviceName: baseStation.name,
          model: baseStation.model,
          serialNumber: baseStation.serialNumber,
          zoneCount: baseStation.valves?.length ?? 0,
          deviceStatus: baseStation.status ?? baseStation.reportedState,
        },
      },
    });
    return { link, device: null, apiKey, deviceKind, baseStation };
  }

  const device = await getDevice(apiKey, link.externalDeviceId);

  await prisma.propertySmartController.update({
    where: { id: link.id },
    data: {
      status:
        device.status === "ONLINE"
          ? SmartControllerStatus.CONNECTED
          : SmartControllerStatus.DISCONNECTED,
      lastSyncedAt: new Date(),
      metadata: {
        ...metadata,
        deviceKind: "controller",
        deviceName: device.name,
        model: device.model,
        serialNumber: device.serialNumber,
        zoneCount: device.zones?.length ?? 0,
        deviceStatus: device.status,
      },
    },
  });

  return { link, device, apiKey, deviceKind: "controller" as const, baseStation: null };
}

async function fetchLinkedRachioEntity(apiKey: string, deviceId: string, deviceKind: RachioDeviceKind) {
  if (deviceKind === "hose_timer") {
    const base = await getBaseStation(apiKey, deviceId);
    return {
      kind: deviceKind,
      name: base.name ?? "Hose timer",
      model: base.model,
      serialNumber: base.serialNumber,
      status: base.status ?? base.reportedState,
      zoneCount: base.valves?.length ?? 0,
    };
  }

  const device = await getDevice(apiKey, deviceId);
  return {
    kind: deviceKind,
    name: device.name,
    model: device.model,
    serialNumber: device.serialNumber,
    status: device.status,
    zoneCount: device.zones?.length ?? 0,
    device,
  };
}

function linkedMetadata(
  entity: Awaited<ReturnType<typeof fetchLinkedRachioEntity>>,
  deviceKind: RachioDeviceKind
) {
  return {
    deviceKind,
    deviceName: entity.name,
    model: entity.model,
    serialNumber: entity.serialNumber,
    zoneCount: entity.zoneCount,
    deviceStatus: entity.status,
  };
}

export async function linkRachioDevice(
  companyId: string,
  customerId: string,
  propertyId: string,
  deviceId: string,
  deviceKind: RachioDeviceKind = "controller"
) {
  await assertPropertyAccess(companyId, customerId, propertyId);
  const { apiKey, personId } = await resolveCompanyRachio(companyId);
  if (!personId) {
    throw new RachioApiError(
      "Rachio not connected — test connection in Settings first",
      400
    );
  }

  const entity = await fetchLinkedRachioEntity(apiKey, deviceId, deviceKind);
  const metadata = linkedMetadata(entity, deviceKind);

  const controller = await prisma.propertySmartController.upsert({
    where: {
      propertyId_provider: {
        propertyId,
        provider: SmartControllerProvider.RACHIO,
      },
    },
    create: {
      propertyId,
      provider: SmartControllerProvider.RACHIO,
      externalDeviceId: deviceId,
      externalAccountId: personId,
      status:
        entity.status === "ONLINE"
          ? SmartControllerStatus.CONNECTED
          : SmartControllerStatus.DISCONNECTED,
      lastSyncedAt: new Date(),
      metadata,
    },
    update: {
      externalDeviceId: deviceId,
      externalAccountId: personId,
      status:
        entity.status === "ONLINE"
          ? SmartControllerStatus.CONNECTED
          : SmartControllerStatus.DISCONNECTED,
      lastSyncedAt: new Date(),
      metadata,
    },
  });

  return {
    controller,
    device: "device" in entity ? entity.device : null,
    entity,
  };
}

export async function unlinkRachioDevice(
  companyId: string,
  customerId: string,
  propertyId: string
) {
  await assertPropertyAccess(companyId, customerId, propertyId);
  await prisma.propertySmartController.deleteMany({
    where: {
      propertyId,
      provider: SmartControllerProvider.RACHIO,
    },
  });
}

export async function fetchRachioEvents(
  companyId: string,
  customerId: string,
  propertyId: string,
  days: number
) {
  const ctx = await getLinkedDeviceContext(companyId, customerId, propertyId);
  if (!ctx.link?.externalDeviceId || !ctx.apiKey || !ctx.device) {
    throw new RachioApiError("No Rachio controller linked to this property", 404);
  }

  const endTime = Date.now();
  const startTime = endTime - days * 24 * 60 * 60 * 1000;
  const events = await getDeviceEvents(
    ctx.apiKey,
    ctx.link.externalDeviceId,
    startTime,
    endTime
  );

  return enrichEventsWithZoneNames(events ?? [], ctx.device.zones);
}

export async function fetchRachioSchedules(
  companyId: string,
  customerId: string,
  propertyId: string
) {
  const ctx = await getLinkedDeviceContext(companyId, customerId, propertyId);
  if (!ctx.device) {
    throw new RachioApiError("No Rachio controller linked to this property", 404);
  }

  return {
    scheduleRules: ctx.device.scheduleRules ?? [],
    flexScheduleRules: ctx.device.flexScheduleRules ?? [],
  };
}

export async function fetchRachioCurrentSchedule(
  companyId: string,
  customerId: string,
  propertyId: string
) {
  const ctx = await getLinkedDeviceContext(companyId, customerId, propertyId);
  if (!ctx.link?.externalDeviceId || !ctx.apiKey) {
    throw new RachioApiError("No Rachio controller linked to this property", 404);
  }

  return getCurrentSchedule(ctx.apiKey, ctx.link.externalDeviceId);
}

export async function runRachioZone(
  companyId: string,
  customerId: string,
  propertyId: string,
  zoneId: string,
  durationMinutes: number
) {
  const ctx = await getLinkedDeviceContext(companyId, customerId, propertyId);
  if (!ctx.apiKey || !ctx.device) {
    throw new RachioApiError("No Rachio controller linked to this property", 404);
  }

  const zone = ctx.device.zones?.find((z) => z.id === zoneId);
  if (!zone) {
    throw new RachioApiError("Zone not found on linked controller", 404);
  }

  const durationSec = Math.round(durationMinutes * 60);
  await startZone(ctx.apiKey, zoneId, durationSec);
  return { zoneId, durationSec };
}

export async function stopRachioWatering(
  companyId: string,
  customerId: string,
  propertyId: string
) {
  const ctx = await getLinkedDeviceContext(companyId, customerId, propertyId);
  if (!ctx.link?.externalDeviceId || !ctx.apiKey) {
    throw new RachioApiError("No Rachio controller linked to this property", 404);
  }

  await stopDeviceWater(ctx.apiKey, ctx.link.externalDeviceId);
}
