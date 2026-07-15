import { prisma } from "@/lib/prisma";
import { phoneDigitsKey, phoneLookupVariants } from "@/lib/inbox/phone";

export type CustomerContact = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  doNotService: boolean;
};

type CustomerPhoneRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  doNotService: boolean;
};

async function findByExactVariants(
  companyId: string,
  variants: string[]
): Promise<CustomerContact | null> {
  if (variants.length === 0) return null;

  const customer = await prisma.customer.findFirst({
    where: {
      companyId,
      OR: variants.map((value) => ({ phone: value })),
    },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      doNotService: true,
    },
  });

  if (customer) return customer;

  const alt = await prisma.customerPhone.findFirst({
    where: {
      companyId,
      OR: variants.map((value) => ({ phone: value })),
    },
    include: {
      customer: {
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          doNotService: true,
        },
      },
    },
  });

  return alt?.customer ?? null;
}

/**
 * Match by last-10 digits after stripping non-digits in Postgres.
 * Catches stored formats like "(801) 555-1234" vs Twilio "+18015551234".
 */
async function findByDigitKey(
  companyId: string,
  last10: string
): Promise<CustomerContact | null> {
  const primary = await prisma.$queryRaw<CustomerPhoneRow[]>`
    SELECT c.id, c.name, c.phone, c.email, c."doNotService"
    FROM "Customer" c
    WHERE c."companyId" = ${companyId}
      AND c.phone IS NOT NULL
      AND right(regexp_replace(c.phone, '[^0-9]', '', 'g'), 10) = ${last10}
    LIMIT 1
  `;
  if (primary[0]) return primary[0];

  const alt = await prisma.$queryRaw<CustomerPhoneRow[]>`
    SELECT c.id, c.name, c.phone, c.email, c."doNotService"
    FROM "CustomerPhone" cp
    INNER JOIN "Customer" c ON c.id = cp."customerId"
    WHERE cp."companyId" = ${companyId}
      AND right(regexp_replace(cp.phone, '[^0-9]', '', 'g'), 10) = ${last10}
    LIMIT 1
  `;
  return alt[0] ?? null;
}

export async function findCustomerByPhone(
  companyId: string,
  phone: string
): Promise<CustomerContact | null> {
  const variants = phoneLookupVariants(phone);
  const exact = await findByExactVariants(companyId, variants);
  if (exact) return exact;

  const last10 = phoneDigitsKey(phone);
  if (!last10 || last10.length < 10) return null;

  // Also try endsWith for common unformatted / E.164 storage before the regex scan.
  const endsWithMatch = await prisma.customer.findFirst({
    where: { companyId, phone: { endsWith: last10 } },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      doNotService: true,
    },
  });
  if (endsWithMatch) return endsWithMatch;

  const altEndsWith = await prisma.customerPhone.findFirst({
    where: { companyId, phone: { endsWith: last10 } },
    include: {
      customer: {
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          doNotService: true,
        },
      },
    },
  });
  if (altEndsWith?.customer) return altEndsWith.customer;

  return findByDigitKey(companyId, last10);
}
