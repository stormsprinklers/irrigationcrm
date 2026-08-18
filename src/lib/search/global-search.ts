import { prisma } from "@/lib/prisma";
import { formatPhoneDisplay, phoneDigitsKey, phoneLookupVariants } from "@/lib/inbox/phone";
import { searchCrmPages, type CrmPageHit } from "@/lib/search/crm-pages";
import { canSearchCrmPage } from "@/lib/settings/access";
import type { RolePreviewUser } from "@/lib/role-preview";

export type GlobalSearchCustomerHit = {
  id: string;
  type: "customer";
  title: string;
  href: string;
  subtitle: string | null;
  meta: string | null;
};

export type GlobalSearchEmployeeHit = {
  id: string;
  type: "employee";
  title: string;
  href: string;
  subtitle: string | null;
  meta: string | null;
};

export type GlobalSearchPriceBookHit = {
  id: string;
  type: "price_book";
  title: string;
  href: string;
  subtitle: string | null;
  meta: string | null;
};

export type GlobalSearchHit =
  | GlobalSearchCustomerHit
  | GlobalSearchEmployeeHit
  | GlobalSearchPriceBookHit
  | CrmPageHit;

export type GlobalSearchResult = {
  query: string;
  customers: GlobalSearchCustomerHit[];
  employees: GlobalSearchEmployeeHit[];
  priceBook: GlobalSearchPriceBookHit[];
  pages: CrmPageHit[];
};

function formatMoney(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}

function joinMeta(parts: Array<string | null | undefined>) {
  const cleaned = parts.map((p) => (p ?? "").trim()).filter(Boolean);
  return cleaned.length ? cleaned.join(" · ") : null;
}

export async function globalSearch(
  companyId: string,
  query: string,
  user?: RolePreviewUser | null
): Promise<GlobalSearchResult> {
  const q = query.trim();
  if (q.length < 2) {
    return { query: q, customers: [], employees: [], priceBook: [], pages: [] };
  }

  const digits = phoneDigitsKey(q) ?? q.replace(/\D/g, "");
  const looksLikePhone = digits.length >= 3 && digits.length >= q.replace(/\s/g, "").length * 0.6;
  const phoneVariants = looksLikePhone ? phoneLookupVariants(q) : [];

  const [customers, employees, priceBookItems] = await Promise.all([
    prisma.customer.findMany({
      where: {
        companyId,
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
          { companyName: { contains: q, mode: "insensitive" } },
          { phone: { contains: q, mode: "insensitive" } },
          { address: { contains: q, mode: "insensitive" } },
          { city: { contains: q, mode: "insensitive" } },
          { zip: { contains: q, mode: "insensitive" } },
          { phones: { some: { phone: { contains: q, mode: "insensitive" } } } },
          {
            properties: {
              some: {
                OR: [
                  { address: { contains: q, mode: "insensitive" } },
                  { city: { contains: q, mode: "insensitive" } },
                  { zip: { contains: q, mode: "insensitive" } },
                  { name: { contains: q, mode: "insensitive" } },
                ],
              },
            },
          },
          ...(looksLikePhone
            ? [
                { phone: { contains: digits, mode: "insensitive" as const } },
                {
                  phones: {
                    some: { phone: { contains: digits, mode: "insensitive" as const } },
                  },
                },
                ...phoneVariants.flatMap((variant) => [
                  { phone: { contains: variant, mode: "insensitive" as const } },
                  {
                    phones: {
                      some: { phone: { contains: variant, mode: "insensitive" as const } },
                    },
                  },
                ]),
              ]
            : []),
        ],
      },
      take: 8,
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        address: true,
        city: true,
        zip: true,
        companyName: true,
        properties: {
          where: { isPrimary: true },
          take: 1,
          select: { address: true, city: true, zip: true },
        },
      },
    }),
    prisma.user.findMany({
      where: {
        companyId,
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { firstName: { contains: q, mode: "insensitive" } },
          { lastName: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
          { phone: { contains: q, mode: "insensitive" } },
          { title: { contains: q, mode: "insensitive" } },
          ...(looksLikePhone
            ? [
                { phone: { contains: digits, mode: "insensitive" as const } },
                ...phoneVariants.map((variant) => ({
                  phone: { contains: variant, mode: "insensitive" as const },
                })),
              ]
            : []),
        ],
      },
      take: 6,
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      select: {
        id: true,
        name: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        title: true,
        role: true,
        status: true,
      },
    }),
    prisma.priceBookItem.findMany({
      where: {
        category: { companyId },
        active: true,
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
          { sku: { contains: q, mode: "insensitive" } },
        ],
      },
      take: 6,
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        sku: true,
        type: true,
        unitPrice: true,
        categoryId: true,
        category: { select: { name: true } },
      },
    }),
  ]);

  return {
    query: q,
    customers: customers.map((c) => {
      const primary = c.properties[0];
      const address =
        joinMeta([c.address, c.city, c.zip]) ||
        joinMeta([primary?.address, primary?.city, primary?.zip]);
      return {
        id: c.id,
        type: "customer" as const,
        title: c.name,
        href: `/customers/${c.id}`,
        subtitle: joinMeta([
          c.companyName,
          c.phone ? formatPhoneDisplay(c.phone) : null,
          c.email,
        ]),
        meta: address,
      };
    }),
    employees: employees.map((e) => {
      const displayName =
        e.name?.trim() ||
        [e.firstName, e.lastName].filter(Boolean).join(" ").trim() ||
        e.email;
      return {
        id: e.id,
        type: "employee" as const,
        title: displayName,
        href: `/settings/employees`,
        subtitle: joinMeta([e.title, String(e.role).replaceAll("_", " "), e.status]),
        meta: joinMeta([e.email, e.phone ? formatPhoneDisplay(e.phone) : null]),
      };
    }),
    priceBook: priceBookItems.map((item) => ({
      id: item.id,
      type: "price_book" as const,
      title: item.name,
      href: `/price-book/categories/${item.categoryId}`,
      subtitle: joinMeta([
        item.category.name,
        item.type === "MATERIAL" ? "Material" : "Service",
        item.sku ? `SKU ${item.sku}` : null,
      ]),
      meta: formatMoney(Number(item.unitPrice)),
    })),
    pages: searchCrmPages(q, 8, (href) => canSearchCrmPage(href, user ?? null)),
  };
}
