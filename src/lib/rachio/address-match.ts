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

type MatchCandidate = {
  customerId: string;
  customerName: string;
  propertyId: string | null;
  propertyName: string | null;
  fields: AddressFields;
  matchSource: "customer" | "property";
};

export function findCustomerByExactAddress(
  target: AddressFields,
  customers: Array<{
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
  }>
): CustomerAddressMatch | null {
  const targetKey = normalizeAddressKey(target);
  if (!targetKey) return null;

  const candidates: MatchCandidate[] = [];
  for (const customer of customers) {
    candidates.push({
      customerId: customer.id,
      customerName: customer.name,
      propertyId: null,
      propertyName: null,
      fields: {
        address: customer.address,
        city: customer.city,
        state: customer.state,
        zip: customer.zip,
      },
      matchSource: "customer",
    });
    for (const property of customer.properties) {
      candidates.push({
        customerId: customer.id,
        customerName: customer.name,
        propertyId: property.id,
        propertyName: property.name,
        fields: {
          address: property.address,
          city: property.city,
          state: property.state,
          zip: property.zip,
        },
        matchSource: "property",
      });
    }
  }

  const propertyMatch = candidates.find(
    (c) => c.matchSource === "property" && normalizeAddressKey(c.fields) === targetKey
  );
  if (propertyMatch) {
    return {
      customerId: propertyMatch.customerId,
      customerName: propertyMatch.customerName,
      propertyId: propertyMatch.propertyId,
      propertyName: propertyMatch.propertyName,
      matchSource: "property",
    };
  }

  const customerMatch = candidates.find(
    (c) => c.matchSource === "customer" && normalizeAddressKey(c.fields) === targetKey
  );
  if (customerMatch) {
    return {
      customerId: customerMatch.customerId,
      customerName: customerMatch.customerName,
      propertyId: null,
      propertyName: null,
      matchSource: "customer",
    };
  }

  return null;
}
