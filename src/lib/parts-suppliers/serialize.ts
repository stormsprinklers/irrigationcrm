import type { PartsSupplier } from "@prisma/client";
import type { PartsSupplierRecord, SupplierHoursJson } from "./types";

export function serializePartsSupplier(supplier: PartsSupplier): PartsSupplierRecord {
  return {
    id: supplier.id,
    name: supplier.name,
    googlePlaceId: supplier.googlePlaceId,
    address: supplier.address,
    city: supplier.city,
    state: supplier.state,
    zip: supplier.zip,
    latitude: supplier.latitude,
    longitude: supplier.longitude,
    phone: supplier.phone,
    hoursJson: (supplier.hoursJson as SupplierHoursJson | null) ?? null,
    weekdayHours: supplier.weekdayHours,
    timezone: supplier.timezone,
    isActive: supplier.isActive,
  };
}
