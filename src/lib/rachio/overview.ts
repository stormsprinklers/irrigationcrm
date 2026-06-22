import { SmartControllerProvider } from "@prisma/client";
import {
  findCustomerByExactAddress,
  formatAddressLine,
  parseRachioAddress,
} from "@/lib/rachio/address-match";
import {
  listCompanyBaseStations,
  listCompanyDevices,
  listRachioProperties,
  findRachioPropertyForEntity,
  resolveCompanyRachio,
} from "@/lib/rachio/client";
import type { RachioDeviceKind, RachioProperty, RachioSuggestedCustomer } from "@/lib/rachio/types";
import { prisma } from "@/lib/prisma";

export type RachioDeviceOverview = {
  id: string;
  name: string;
  serialNumber?: string;
  model?: string;
  status?: string;
  zoneCount: number;
  kind: RachioDeviceKind;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  addressLine: string | null;
  linked: boolean;
  customerId: string | null;
  customerName: string | null;
  propertyId: string | null;
  propertyName: string | null;
  suggestedCustomer: RachioSuggestedCustomer | null;
};

function indexRachioProperties(properties: RachioProperty[]) {
  const byEntityId = new Map<string, RachioProperty>();
  for (const property of properties) {
    if (property.id) {
      byEntityId.set(property.id, property);
    }
    for (const entity of property.entities ?? []) {
      const ids = [entity.deviceId, entity.baseStationId, entity.locationId, entity.id].filter(
        Boolean
      ) as string[];
      for (const entityId of ids) {
        byEntityId.set(entityId, property);
      }
    }
  }
  return byEntityId;
}

async function resolveEntityAddress(
  apiKey: string,
  personId: string,
  properties: RachioProperty[],
  propertyIndex: Map<string, RachioProperty>,
  entity: { id: string; kind: RachioDeviceKind }
) {
  let property = propertyIndex.get(entity.id) ?? null;
  if (!property) {
    property = await findRachioPropertyForEntity(
      apiKey,
      entity.kind === "hose_timer"
        ? { baseStationId: entity.id }
        : { deviceId: entity.id }
    );
  }
  if (!property && properties.length === 1) {
    property = properties[0];
  }
  const fields = parseRachioAddress(property as Record<string, unknown>);
  return {
    ...fields,
    addressLine: formatAddressLine(fields),
  };
}

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

  const personId = company.rachioPersonId;
  const { apiKey } = await resolveCompanyRachio(companyId);

  const [controllers, baseStations, rachioProperties, links, customers] = await Promise.all([
    listCompanyDevices(companyId),
    listCompanyBaseStations(companyId).catch(() => []),
    listRachioProperties(apiKey, personId).catch(() => []),
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
    prisma.customer.findMany({
      where: { companyId },
      select: {
        id: true,
        name: true,
        address: true,
        city: true,
        state: true,
        zip: true,
        properties: {
          select: {
            id: true,
            name: true,
            address: true,
            city: true,
            state: true,
            zip: true,
          },
        },
      },
    }),
  ]);

  const propertyIndex = indexRachioProperties(rachioProperties);
  const linkByDeviceId = new Map(
    links
      .filter((link) => link.externalDeviceId)
      .map((link) => [link.externalDeviceId as string, link])
  );

  const entities = [
    ...controllers.map((device) => ({ ...device, kind: "controller" as const })),
    ...baseStations.map((device) => ({ ...device, kind: "hose_timer" as const })),
  ];

  const devices: RachioDeviceOverview[] = [];
  for (const entity of entities) {
    const addressFields = await resolveEntityAddress(
      apiKey,
      personId,
      rachioProperties,
      propertyIndex,
      { id: entity.id, kind: entity.kind }
    );
    const suggestedCustomer = findCustomerByExactAddress(addressFields, customers);
    const link = linkByDeviceId.get(entity.id);

    devices.push({
      ...entity,
      zoneCount: entity.zoneCount ?? 0,
      kind: entity.kind,
      address: addressFields.address,
      city: addressFields.city,
      state: addressFields.state,
      zip: addressFields.zip,
      addressLine: addressFields.addressLine,
      linked: Boolean(link),
      customerId: link?.property.customer.id ?? null,
      customerName: link?.property.customer.name ?? null,
      propertyId: link?.property.id ?? null,
      propertyName: link?.property.name ?? null,
      suggestedCustomer,
    });
  }

  return {
    personId,
    devices,
  };
}
