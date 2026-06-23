export type AddressFields = {
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
};

export type CustomerAddressMatch = {
  customerId: string;
  customerName: string;
  propertyId: string | null;
  propertyName: string | null;
  matchSource: "customer" | "property";
};

function clean(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\./g, "").replace(/,/g, "").replace(/\s+/g, " ");
}

function normalizeZip(value: string | null | undefined): string {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.length >= 5 ? digits.slice(0, 5) : digits;
}

/** Normalized key for exact address matching (street + city + state + zip). */
export function normalizeAddressKey(fields: AddressFields): string | null {
  const street = clean(fields.address);
  const city = clean(fields.city);
  const state = clean(fields.state);
  const zip = normalizeZip(fields.zip);
  if (!street || !city || !state || !zip) return null;
  return `${street}|${city}|${state}|${zip}`;
}

export function formatAddressLine(fields: AddressFields): string | null {
  const line = [fields.address, fields.city, fields.state, fields.zip].filter(Boolean).join(", ");
  return line || null;
}

export function parseRachioAddress(source: Record<string, unknown> | null | undefined): AddressFields {
  if (!source) {
    return { address: null, city: null, state: null, zip: null };
  }
  const nested =
    (source.address as Record<string, unknown> | undefined) ??
    (source.location as Record<string, unknown> | undefined);
  const addr = nested ?? source;
  const line1 = pickString(addr.street, addr.streetAddress, addr.addressLine1, addr.line1, addr.address);
  const line2 = pickString(addr.street_line_2, addr.line2, addr.unit);
  const address = [line1, line2].filter(Boolean).join(", ") || null;
  return {
    address,
    city: pickString(addr.city, addr.locality),
    state: pickString(addr.state, addr.region, addr.province),
    zip: pickString(addr.zip, addr.postalCode, addr.zipCode, addr.postal_code),
  };
}

function pickString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export type CustomerAddressRecord = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  properties: Array<{
    id: string;
    name: string;
    address: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
  }>;
};

/** Build a lookup once; property-level matches win over customer-level for the same key. */
export function buildCustomerAddressIndex(
  customers: CustomerAddressRecord[]
): Map<string, CustomerAddressMatch> {
  const index = new Map<string, CustomerAddressMatch>();

  for (const customer of customers) {
    for (const property of customer.properties) {
      const key = normalizeAddressKey({
        address: property.address,
        city: property.city,
        state: property.state,
        zip: property.zip,
      });
      if (key && !index.has(key)) {
        index.set(key, {
          customerId: customer.id,
          customerName: customer.name,
          propertyId: property.id,
          propertyName: property.name,
          matchSource: "property",
        });
      }
    }
  }

  for (const customer of customers) {
    const key = normalizeAddressKey({
      address: customer.address,
      city: customer.city,
      state: customer.state,
      zip: customer.zip,
    });
    if (key && !index.has(key)) {
      index.set(key, {
        customerId: customer.id,
        customerName: customer.name,
        propertyId: null,
        propertyName: null,
        matchSource: "customer",
      });
    }
  }

  return index;
}

export function findCustomerByAddressIndex(
  target: AddressFields,
  index: Map<string, CustomerAddressMatch>
): CustomerAddressMatch | null {
  const targetKey = normalizeAddressKey(target);
  if (!targetKey) return null;
  return index.get(targetKey) ?? null;
}

export function findCustomerByExactAddress(
  target: AddressFields,
  customers: CustomerAddressRecord[]
): CustomerAddressMatch | null {
  return findCustomerByAddressIndex(target, buildCustomerAddressIndex(customers));
}
