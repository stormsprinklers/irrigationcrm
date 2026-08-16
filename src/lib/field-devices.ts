import { prisma } from "@/lib/prisma";

const MIN_DEVICE_PING_MS = 15_000;

export async function upsertFieldDeviceLocation(params: {
  companyId: string;
  userId: string;
  deviceId: string;
  deviceName?: string | null;
  lat: number;
  lng: number;
  heading?: number | null;
  accuracyMeters?: number | null;
}) {
  const deviceId = params.deviceId.trim().slice(0, 128);
  if (!deviceId) return { ok: false as const, error: "deviceId is required", status: 400 };

  const existing = await prisma.fieldDeviceLocation.findUnique({
    where: { companyId_deviceId: { companyId: params.companyId, deviceId } },
    select: { updatedAt: true },
  });
  const now = Date.now();
  if (existing && now - existing.updatedAt.getTime() < MIN_DEVICE_PING_MS) {
    return { ok: true as const, skipped: true as const };
  }

  await prisma.fieldDeviceLocation.upsert({
    where: { companyId_deviceId: { companyId: params.companyId, deviceId } },
    create: {
      companyId: params.companyId,
      userId: params.userId,
      deviceId,
      deviceName: params.deviceName?.trim().slice(0, 120) || null,
      lat: params.lat,
      lng: params.lng,
      heading: params.heading ?? null,
      accuracyMeters: params.accuracyMeters ?? null,
    },
    update: {
      userId: params.userId,
      deviceName: params.deviceName?.trim().slice(0, 120) || undefined,
      lat: params.lat,
      lng: params.lng,
      heading: params.heading ?? null,
      accuracyMeters: params.accuracyMeters ?? null,
    },
  });

  return { ok: true as const, skipped: false as const };
}

export async function listFieldDeviceLocations(companyId: string) {
  const rows = await prisma.fieldDeviceLocation.findMany({
    where: { companyId },
    include: {
      user: { select: { id: true, name: true, photoUrl: true, role: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return rows.map((row) => ({
    id: row.id,
    deviceId: row.deviceId,
    deviceName: row.deviceName,
    lat: Number(row.lat),
    lng: Number(row.lng),
    heading: row.heading != null ? Number(row.heading) : null,
    accuracyMeters: row.accuracyMeters != null ? Number(row.accuracyMeters) : null,
    updatedAt: row.updatedAt.toISOString(),
    stale: Date.now() - row.updatedAt.getTime() > 15 * 60_000,
    user: row.user,
  }));
}
