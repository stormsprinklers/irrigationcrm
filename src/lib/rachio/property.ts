import { SmartControllerProvider, SmartControllerStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  enrichEventsWithZoneNames,
  getCurrentSchedule,
  getDevice,
  getDeviceEvents,
  resolveCompanyRachio,
  startZone,
  stopDeviceWater,
} from "@/lib/rachio/client";
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
    return { link: null, device: null, apiKey: null };
  }

  const { apiKey } = await resolveCompanyRachio(companyId);
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
        deviceName: device.name,
        model: device.model,
        serialNumber: device.serialNumber,
        zoneCount: device.zones?.length ?? 0,
        deviceStatus: device.status,
      },
    },
  });

  return { link, device, apiKey };
}

export async function linkRachioDevice(
  companyId: string,
  customerId: string,
  propertyId: string,
  deviceId: string
) {
  await assertPropertyAccess(companyId, customerId, propertyId);
  const { apiKey, personId } = await resolveCompanyRachio(companyId);
  if (!personId) {
    throw new RachioApiError(
      "Rachio not connected — test connection in Settings first",
      400
    );
  }

  const device = await getDevice(apiKey, deviceId);

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
        device.status === "ONLINE"
          ? SmartControllerStatus.CONNECTED
          : SmartControllerStatus.DISCONNECTED,
      lastSyncedAt: new Date(),
      metadata: {
        deviceName: device.name,
        model: device.model,
        serialNumber: device.serialNumber,
        zoneCount: device.zones?.length ?? 0,
        deviceStatus: device.status,
      },
    },
    update: {
      externalDeviceId: deviceId,
      externalAccountId: personId,
      status:
        device.status === "ONLINE"
          ? SmartControllerStatus.CONNECTED
          : SmartControllerStatus.DISCONNECTED,
      lastSyncedAt: new Date(),
      metadata: {
        deviceName: device.name,
        model: device.model,
        serialNumber: device.serialNumber,
        zoneCount: device.zones?.length ?? 0,
        deviceStatus: device.status,
      },
    },
  });

  return { controller, device };
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
