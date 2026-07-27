import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const STORM_COMPANY_ID = "seed-company";
export const CHESTNUT_CHEER_COMPANY_ID = "chestnut-cheer-company";

export async function listStormEmployees() {
  return prisma.user.findMany({
    where: { companyId: STORM_COMPANY_ID, systemKind: null, appleDemoAccount: false },
    select: {
      id: true,
      name: true,
      firstName: true,
      lastName: true,
      email: true,
      role: true,
      title: true,
      phone: true,
      status: true,
      division: true,
    },
    orderBy: { name: "asc" },
  });
}

export async function listStormCustomers(limit = 200) {
  return prisma.customer.findMany({
    where: { companyId: STORM_COMPANY_ID },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      address: true,
      city: true,
      state: true,
      zip: true,
      companyName: true,
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });
}

export async function listStormNotificationTemplates() {
  return prisma.notificationTemplate.findMany({
    where: { companyId: STORM_COMPANY_ID },
    select: { id: true, slug: true, name: true, channel: true, subject: true },
    orderBy: { name: "asc" },
  });
}

export async function listStormChecklistTemplates() {
  return prisma.checklistTemplate.findMany({
    where: { companyId: STORM_COMPANY_ID },
    select: { id: true, name: true, description: true, active: true },
    orderBy: { sortOrder: "asc" },
  });
}

export async function importEmployeesToChestnut(
  targetCompanyId: string,
  employeeIds: string[]
) {
  const source = await prisma.user.findMany({
    where: { companyId: STORM_COMPANY_ID, id: { in: employeeIds } },
  });

  const created: { sourceId: string; email: string; name: string }[] = [];
  const skipped: { sourceId: string; reason: string }[] = [];

  for (const user of source) {
    const email = user.email.toLowerCase();
    const existing = await prisma.user.findFirst({
      where: { companyId: targetCompanyId, email },
    });
    if (existing) {
      skipped.push({ sourceId: user.id, reason: `Email already exists on C&C: ${email}` });
      continue;
    }

    const createdUser = await prisma.user.create({
      data: {
        companyId: targetCompanyId,
        firstName: user.firstName,
        lastName: user.lastName,
        name: user.name,
        email,
        phone: user.phone,
        role: user.role,
        title: user.title,
        status: user.status,
        division: user.division,
        color: user.color,
        photoUrl: user.photoUrl,
        address: user.address,
        city: user.city,
        state: user.state,
        zip: user.zip,
        // Copy password hash so same email can sign in to either company.
        passwordHash: user.passwordHash,
        tags: [...user.tags, `imported-from-storm:${user.id}`],
      },
    });

    // Auto-link for company switcher
    await prisma.$transaction([
      prisma.userAccountLink.upsert({
        where: {
          userId_linkedUserId: { userId: user.id, linkedUserId: createdUser.id },
        },
        update: {},
        create: { userId: user.id, linkedUserId: createdUser.id },
      }),
      prisma.userAccountLink.upsert({
        where: {
          userId_linkedUserId: { userId: createdUser.id, linkedUserId: user.id },
        },
        update: {},
        create: { userId: createdUser.id, linkedUserId: user.id },
      }),
    ]);

    created.push({ sourceId: user.id, email, name: user.name });
  }

  return { created, skipped };
}

export async function importCustomersToChestnut(
  targetCompanyId: string,
  customerIds: string[]
) {
  const source = await prisma.customer.findMany({
    where: { companyId: STORM_COMPANY_ID, id: { in: customerIds } },
    include: { phones: true, properties: true },
  });

  const created: { sourceId: string; name: string }[] = [];
  const skipped: { sourceId: string; reason: string }[] = [];

  for (const customer of source) {
    const already = await prisma.customer.findFirst({
      where: {
        companyId: targetCompanyId,
        tags: { has: `imported-from-storm:${customer.id}` },
      },
    });
    if (already) {
      skipped.push({ sourceId: customer.id, reason: "Already imported" });
      continue;
    }

    await prisma.customer.create({
      data: {
        companyId: targetCompanyId,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        companyName: customer.companyName,
        address: customer.address,
        city: customer.city,
        state: customer.state,
        zip: customer.zip,
        leadSource: customer.leadSource ?? "Imported from Storm Sprinklers",
        tags: [...customer.tags, `imported-from-storm:${customer.id}`],
        phones: {
          create: customer.phones.map((p) => ({
            companyId: targetCompanyId,
            phone: p.phone,
            note: p.note,
          })),
        },
        properties: {
          create: customer.properties.map((prop) => ({
            companyId: targetCompanyId,
            name: prop.name,
            address: prop.address,
            city: prop.city,
            state: prop.state,
            zip: prop.zip,
            isPrimary: prop.isPrimary,
          })),
        },
      },
    });
    created.push({ sourceId: customer.id, name: customer.name });
  }

  return { created, skipped };
}

export async function importNotificationTemplatesToChestnut(
  targetCompanyId: string,
  templateIds: string[]
) {
  const source = await prisma.notificationTemplate.findMany({
    where: { companyId: STORM_COMPANY_ID, id: { in: templateIds } },
  });

  const created: string[] = [];
  const skipped: { id: string; reason: string }[] = [];

  for (const tpl of source) {
    try {
      await prisma.notificationTemplate.create({
        data: {
          companyId: targetCompanyId,
          channel: tpl.channel,
          slug: tpl.slug,
          name: tpl.name,
          subject: tpl.subject,
          body: tpl.body,
        },
      });
      created.push(tpl.id);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        skipped.push({ id: tpl.id, reason: "Template slug already exists" });
      } else {
        throw err;
      }
    }
  }

  return { created, skipped };
}

export async function importChecklistTemplatesToChestnut(
  targetCompanyId: string,
  templateIds: string[]
) {
  const source = await prisma.checklistTemplate.findMany({
    where: { companyId: STORM_COMPANY_ID, id: { in: templateIds } },
    include: { items: { orderBy: { sortOrder: "asc" } } },
  });

  const created: string[] = [];

  for (const tpl of source) {
    await prisma.checklistTemplate.create({
      data: {
        companyId: targetCompanyId,
        name: `${tpl.name} (from Storm)`,
        description: tpl.description,
        active: tpl.active,
        applyToAllJobs: tpl.applyToAllJobs,
        divisions: tpl.divisions,
        excludeCallbacks: tpl.excludeCallbacks,
        requiredForCompletion: tpl.requiredForCompletion,
        customerVisible: tpl.customerVisible,
        sortOrder: tpl.sortOrder,
        items: {
          create: tpl.items.map((item) => ({
            label: item.label,
            helpText: item.helpText,
            type: item.type,
            required: item.required,
            sortOrder: item.sortOrder,
            options: item.options ?? undefined,
            config: item.config ?? undefined,
          })),
        },
      },
    });
    created.push(tpl.id);
  }

  return { created, skipped: [] as { id: string; reason: string }[] };
}

export async function listStormPriceBookCategories() {
  return prisma.priceBookCategory.findMany({
    where: { companyId: STORM_COMPANY_ID, parentId: null },
    select: {
      id: true,
      name: true,
      type: true,
      slug: true,
      _count: { select: { items: true, children: true } },
    },
    orderBy: [{ type: "asc" }, { sortOrder: "asc" }],
  });
}

/**
 * Copies selected root categories (+ direct children) and their items into C&C.
 * Does not copy labor rates, material links, or discounts — structure only.
 */
export async function importPriceBookCategoriesToChestnut(
  targetCompanyId: string,
  categoryIds: string[]
) {
  const roots = await prisma.priceBookCategory.findMany({
    where: { companyId: STORM_COMPANY_ID, id: { in: categoryIds }, parentId: null },
    include: {
      items: { orderBy: { sortOrder: "asc" } },
      children: {
        include: { items: { orderBy: { sortOrder: "asc" } } },
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  const created: string[] = [];
  const skipped: { id: string; reason: string }[] = [];

  for (const root of roots) {
    const slugBase = `${root.slug}-cc`;
    let slug = slugBase;
    let n = 1;
    while (
      await prisma.priceBookCategory.findFirst({
        where: { companyId: targetCompanyId, slug },
        select: { id: true },
      })
    ) {
      slug = `${slugBase}-${n++}`;
    }

    try {
      const newRoot = await prisma.priceBookCategory.create({
        data: {
          companyId: targetCompanyId,
          type: root.type,
          name: `${root.name} (from Storm)`,
          slug,
          sortOrder: root.sortOrder,
          items: {
            create: root.items.map((item) => ({
              type: item.type,
              name: item.name,
              description: item.description,
              sku: item.sku,
              unitPrice: item.unitPrice,
              unitCost: item.unitCost,
              unit: item.unit,
              taxable: item.taxable,
              markupEnabled: item.markupEnabled,
              laborHours: item.laborHours,
              pricingMode: item.pricingMode,
              lastCalculatedPrice: item.lastCalculatedPrice,
              trackMaterials: false,
              active: item.active,
              sortOrder: item.sortOrder,
            })),
          },
        },
      });

      for (const child of root.children) {
        await prisma.priceBookCategory.create({
          data: {
            companyId: targetCompanyId,
            type: child.type,
            name: child.name,
            slug: `${child.slug}-cc-${newRoot.id.slice(-6)}`,
            parentId: newRoot.id,
            sortOrder: child.sortOrder,
            items: {
              create: child.items.map((item) => ({
                type: item.type,
                name: item.name,
                description: item.description,
                sku: item.sku,
                unitPrice: item.unitPrice,
                unitCost: item.unitCost,
                unit: item.unit,
                taxable: item.taxable,
                markupEnabled: item.markupEnabled,
                laborHours: item.laborHours,
                pricingMode: item.pricingMode,
                lastCalculatedPrice: item.lastCalculatedPrice,
                trackMaterials: false,
                active: item.active,
                sortOrder: item.sortOrder,
              })),
            },
          },
        });
      }

      created.push(root.id);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        skipped.push({ id: root.id, reason: "Category slug already exists" });
      } else {
        throw err;
      }
    }
  }

  return { created, skipped };
}
