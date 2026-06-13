import { prisma } from "@/lib/prisma";

export function normalizeZipCode(zip: string): string | null {
  const digits = zip.replace(/\D/g, "").slice(0, 5);
  return digits.length === 5 ? digits : null;
}

export function parseZipInput(input: string): string[] {
  return input
    .split(/[\s,;]+/)
    .map((z) => normalizeZipCode(z))
    .filter((z): z is string => z !== null);
}

export async function resolveServiceAreaByZip(companyId: string, zip: string) {
  const zipCode = normalizeZipCode(zip);
  if (!zipCode) return null;

  const record = await prisma.serviceAreaZip.findFirst({
    where: {
      zipCode,
      serviceArea: { companyId },
    },
    include: { serviceArea: true },
  });

  return record?.serviceArea ?? null;
}

export async function findZipConflict(companyId: string, zipCode: string, excludeAreaId?: string) {
  return prisma.serviceAreaZip.findFirst({
    where: {
      zipCode,
      serviceArea: { companyId },
      ...(excludeAreaId ? { NOT: { serviceAreaId: excludeAreaId } } : {}),
    },
    include: { serviceArea: { select: { id: true, name: true } } },
  });
}
