import { CustomerStatus, HcpEntityType } from "@prisma/client";
import { normalizePhone, phoneDigitsKey } from "@/lib/inbox/phone";
import { prisma } from "@/lib/prisma";
import { clean, emailKey, nameKey, sameAddress, validCustomerName } from "@/lib/customers/import-matching";

export type CustomerImportRow = {
  name: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  phone?: string | null;
  phones?: string[];
  email?: string | null;
  emails?: string[];
  companyName?: string | null;
  tags?: string[];
  archived?: boolean;
  marketingEmailOptOut?: boolean;
  marketingSmsOptOut?: boolean;
  hcpId?: string;
  migrationId?: string;
  createdAt?: Date;
  properties?: Array<{ hcpId?: string; name?: string; address?: string | null; city?: string | null; state?: string | null; zip?: string | null }>;
};

export type CustomerImportResult = {
  action: "created" | "merged" | "skipped";
  customerId?: string;
  reason?: string;
  name?: string;
};

const unique = (values: Array<string | null | undefined>, key: (value: string) => string) => {
  const found = new Map<string, string>();
  for (const value of values) {
    const trimmed = clean(value);
    if (trimmed && key(trimmed)) found.set(key(trimmed), trimmed);
  }
  return [...found.values()];
};

/** Add or enrich a customer without replacing existing contact details or consent flags. */
export async function importCustomerRow(companyId: string, row: CustomerImportRow): Promise<CustomerImportResult> {
  const name = clean(row.name);
  if (!name || !validCustomerName(name)) return { action: "skipped", reason: "Missing, numeric, or placeholder name" };
  const address = clean(row.address);
  const emails = unique([row.email, ...(row.emails ?? [])], emailKey).filter((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
  const phones = unique([row.phone, ...(row.phones ?? [])], (value) => phoneDigitsKey(value) ?? "")
    .map((value) => normalizePhone(value));
  if (!address && !emails.length && !phones.length) {
    return { action: "skipped", reason: "No address, email, or phone for reliable matching" };
  }

  return prisma.$transaction(async (tx) => {
    // Serialize imports for one company so two concurrent uploads cannot create the same customer.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${companyId}))`;
    const mapping = row.hcpId ? await tx.hcpEntityMapping.findUnique({
      where: { companyId_entityType_hcpId: { companyId, entityType: HcpEntityType.CUSTOMER, hcpId: row.hcpId } },
    }) : null;
    const candidates = await tx.customer.findMany({
      where: {
        companyId,
        OR: [
          { name: { contains: (nameKey(name).split(" ")[0] || name), mode: "insensitive" } },
          ...(emails.length ? [{ email: { in: emails, mode: "insensitive" as const } }] : []),
          ...(emails.length ? [{ emails: { some: { email: { in: emails, mode: "insensitive" as const } } } }] : []),
          ...(phones.length ? [{ phone: { in: phones } }] : []),
          ...(phones.length ? [{ phones: { some: { phone: { in: phones } } } }] : []),
        ],
      },
      include: { phones: true, emails: true, properties: true },
    });
    const mapped = mapping ? await tx.customer.findFirst({
      where: { id: mapping.localId, companyId },
      include: { phones: true, emails: true, properties: true },
    }) : null;
    const matches = candidates.filter((candidate) => {
      if (nameKey(candidate.name) !== nameKey(name)) return false;
      const addresses = [candidate, ...candidate.properties];
      if (address && addresses.some((item) => sameAddress(item, row))) return true;
      if (emails.some((email) => [candidate.email, ...candidate.emails.map((item) => item.email)].some((item) => emailKey(item) === emailKey(email)))) return true;
      return phones.some((phone) => [candidate.phone, ...candidate.phones.map((item) => item.phone)].some((item) => phoneDigitsKey(item) === phoneDigitsKey(phone)));
    });
    const target = mapped ?? (matches.length === 1 ? matches[0] : null);
    if (!mapped && matches.length > 1) return { action: "skipped", reason: "Multiple existing customers match; no safe automatic choice" };
    if (mapped && matches.some((candidate) => candidate.id !== mapped.id)) {
      return { action: "skipped", reason: "HCP mapping conflicts with another matching customer" };
    }

    const primaryEmail = emails[0] ?? null;
    const primaryPhone = phones[0] ?? null;
    const customer = target ? await tx.customer.update({
      where: { id: target.id },
      data: {
        email: target.email || primaryEmail,
        phone: target.phone || primaryPhone,
        address: target.address || address,
        city: target.city || clean(row.city),
        state: target.state || clean(row.state),
        zip: target.zip || clean(row.zip),
        companyName: target.companyName || clean(row.companyName),
        tags: [...new Set([...target.tags, ...(row.tags ?? []).map((tag) => tag.trim()).filter(Boolean)])],
        marketingEmailOptOut: target.marketingEmailOptOut || row.marketingEmailOptOut === true,
        marketingSmsOptOut: target.marketingSmsOptOut || row.marketingSmsOptOut === true,
      },
    }) : await tx.customer.create({
      data: {
        companyId, name, email: primaryEmail, phone: primaryPhone,
        address, city: clean(row.city), state: clean(row.state), zip: clean(row.zip),
        companyName: clean(row.companyName), tags: row.tags ?? [],
        status: row.archived ? CustomerStatus.ARCHIVED : CustomerStatus.ACTIVE,
        ...(row.createdAt ? { createdAt: row.createdAt } : {}),
        marketingEmailOptOut: row.marketingEmailOptOut ?? false,
        marketingSmsOptOut: row.marketingSmsOptOut ?? false,
      },
    });

    const knownEmails = new Set([emailKey(customer.email), ...(target?.emails ?? []).map((item) => emailKey(item.email))]);
    for (const email of emails) {
      if (knownEmails.has(emailKey(email))) continue;
      await tx.customerEmail.create({ data: { companyId, customerId: customer.id, email, note: "Imported secondary email" } });
      knownEmails.add(emailKey(email));
    }
    const knownPhones = new Set([phoneDigitsKey(customer.phone), ...(target?.phones ?? []).map((item) => phoneDigitsKey(item.phone))]);
    for (const phone of phones) {
      if (knownPhones.has(phoneDigitsKey(phone))) continue;
      await tx.customerPhone.create({ data: { companyId, customerId: customer.id, phone, note: "Imported secondary phone" } });
      knownPhones.add(phoneDigitsKey(phone));
    }
    const propertyRows = row.properties?.length ? row.properties : address ? [{ address, city: row.city, state: row.state, zip: row.zip }] : [];
    for (const [index, property] of propertyRows.entries()) {
      if (!clean(property.address)) continue;
      const propertyMapping = property.hcpId ? await tx.hcpEntityMapping.findUnique({
        where: { companyId_entityType_hcpId: { companyId, entityType: HcpEntityType.PROPERTY, hcpId: property.hcpId } },
      }) : null;
      const known = await tx.customerProperty.findMany({ where: { companyId, customerId: customer.id } });
      const matchedProperty = known.find((item) => sameAddress(item, property));
      const stored = propertyMapping ? await tx.customerProperty.findFirst({ where: { id: propertyMapping.localId, companyId } }) : null;
      if (stored && stored.customerId !== customer.id) {
        throw new Error("Housecall Pro property is mapped to another customer");
      }
      const existing = stored ?? matchedProperty;
      const saved = existing ?? await tx.customerProperty.create({
        data: {
          companyId, customerId: customer.id, name: clean(property.name) ?? "Imported property",
          address: clean(property.address), city: clean(property.city), state: clean(property.state), zip: clean(property.zip),
          isPrimary: index === 0 && !known.some((item) => item.isPrimary),
        },
      });
      if (property.hcpId && !propertyMapping) {
        await tx.hcpEntityMapping.create({
          data: {
            companyId, entityType: HcpEntityType.PROPERTY, hcpId: property.hcpId, localId: saved.id,
            migrationId: existing ? null : row.migrationId ?? null,
          },
        });
      }
    }
    if (row.hcpId && !mapping) {
      await tx.hcpEntityMapping.create({
        data: {
          companyId, entityType: HcpEntityType.CUSTOMER, hcpId: row.hcpId,
          localId: customer.id,
          // Only newly created customers may be removed by a migration rollback.
          migrationId: target ? null : row.migrationId ?? null,
        },
      });
    } else if (mapping && mapping.localId !== customer.id) {
      await tx.hcpEntityMapping.update({ where: { id: mapping.id }, data: { localId: customer.id } });
    }
    return { action: target ? "merged" : "created", customerId: customer.id };
  }, { timeout: 15_000 });
}
