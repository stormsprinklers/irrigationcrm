import { SmartControllerProvider } from "@prisma/client";
import { listCompanyDevices } from "@/lib/rachio/client";
import { prisma } from "@/lib/prisma";

export type RachioDeviceOverview = {
  id: string;
  name: string;
  serialNumber?: string;
  model?: string;
  status?: string;
  zoneCount: number;
  linked: boolean;
  customerId: string | null;
  customerName: string | null;
  propertyId: string | null;
  propertyName: string | null;
};

export async function getRachioOverview(companyId: string): Promise<{
  devices: RachioDeviceOverview[];
  personId: string | null;
}> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { rachioPersonId: true },
  });

  if (!company?.rachioPersonId) {
    return { devices: [], personId: null };
  }

  const [devices, links] = await Promise.all([
    listCompanyDevices(companyId),
    prisma.propertySmartController.findMany({
      where: {
        provider: SmartControllerProvider.RACHIO,
        property: { companyId },
        externalDeviceId: { not: null },
      },
      include: {
        property: {
          select: {
            id: true,
            name: true,
            customer: { select: { id: true, name: true } },
          },
        },
      },
    }),
  ]);

  const linkByDeviceId = new Map(
    links
      .filter((link) => link.externalDeviceId)
      .map((link) => [link.externalDeviceId as string, link])
  );

  return {
    personId: company.rachioPersonId,
    devices: devices.map((device) => {
      const link = linkByDeviceId.get(device.id);
      return {
        ...device,
        zoneCount: device.zoneCount ?? 0,
        linked: Boolean(link),
        customerId: link?.property.customer.id ?? null,
        customerName: link?.property.customer.name ?? null,
        propertyId: link?.property.id ?? null,
        propertyName: link?.property.name ?? null,
      };
    }),
  };
}
