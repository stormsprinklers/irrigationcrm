import {
  PrismaClient,
  UserRole,
  Division,
  EmployeeStatus,
  VisitStatus,
  EstimateStatus,
} from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const SERVICE_AREAS = [
  { name: "Utah County North", slug: "utah-county-north", color: "#2563EB", sortOrder: 0, zips: ["84057", "84058", "84059"] },
  { name: "Utah County South", slug: "utah-county-south", color: "#7C3AED", sortOrder: 1, zips: ["84604", "84606", "84601"] },
  { name: "Utah County Central", slug: "utah-county-central", color: "#0891B2", sortOrder: 2, zips: ["84043", "84042", "84003"] },
  { name: "Salt Lake County North", slug: "slc-county-north", color: "#16A34A", sortOrder: 3, zips: ["84101", "84102", "84103"] },
  { name: "Salt Lake County South", slug: "slc-county-south", color: "#EA580C", sortOrder: 4, zips: ["84070", "84094", "84020"] },
  { name: "Salt Lake County Central", slug: "slc-county-central", color: "#DB2777", sortOrder: 5, zips: ["84111", "84115", "84105"] },
];

const PRICE_BOOK_CATEGORIES = [
  { slug: "backflow", name: "Backflow", items: [{ name: "Backflow test", unitPrice: 125 }, { name: "Backflow repair", unitPrice: 185 }] },
  { slug: "stop-waste", name: "Stop & Waste", items: [{ name: "Stop & waste replacement", unitPrice: 275 }] },
  { slug: "heads-nozzles", name: "Heads & Nozzles", items: [{ name: "Rotor head replacement", unitPrice: 95 }, { name: "Nozzle adjustment", unitPrice: 45 }] },
  { slug: "leaks", name: "Leaks", items: [{ name: "Leak diagnosis", unitPrice: 89 }, { name: "Pipe repair", unitPrice: 150 }] },
  { slug: "controllers", name: "Controllers", items: [{ name: "Controller programming", unitPrice: 75 }, { name: "Smart controller install", unitPrice: 450 }] },
  { slug: "drip", name: "Drip", items: [{ name: "Drip line repair", unitPrice: 120 }] },
  { slug: "other", name: "Other", items: [{ name: "Service call minimum", unitPrice: 89 }] },
];

function startOfWeek(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function visitTime(weekStart: Date, dayOffset: number, hour: number, minute = 0) {
  const d = addDays(weekStart, dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d;
}

async function main() {
  const passwordHash = await bcrypt.hash("password123", 10);
  const devAdminPasswordHash = await bcrypt.hash("Test123", 10);

  const company = await prisma.company.upsert({
    where: { id: "seed-company" },
    update: {
      estimateExpiryDays: 14,
      estimateDepositRequired: false,
    },
    create: {
      id: "seed-company",
      name: "Storm Sprinklers",
      twilioPhone: process.env.TWILIO_PHONE_NUMBER ?? null,
      sendgridFrom: process.env.SENDGRID_FROM_EMAIL ?? "support@stormsprinklers.com",
      recordCalls: true,
      transcribeCalls: true,
      estimateExpiryDays: 14,
    },
  });

  const austin = await prisma.user.upsert({
    where: { email: "austin@stormsprinklers.com" },
    update: {
      title: "Operations Manager",
      status: EmployeeStatus.ACTIVE,
      division: Division.SERVICE,
      color: "#2563EB",
      tags: ["management"],
    },
    create: {
      email: "austin@stormsprinklers.com",
      name: "Austin",
      passwordHash,
      phone: "+18015550100",
      role: UserRole.ADMIN,
      companyId: company.id,
      title: "Operations Manager",
      division: Division.SERVICE,
      color: "#2563EB",
      tags: ["management"],
    },
  });

  await prisma.user.upsert({
    where: { email: "admin@stormsprinklers.com" },
    update: {
      passwordHash: devAdminPasswordHash,
      status: EmployeeStatus.ACTIVE,
      role: UserRole.ADMIN,
    },
    create: {
      email: "admin@stormsprinklers.com",
      name: "Dev Admin",
      passwordHash: devAdminPasswordHash,
      phone: "+18015550199",
      role: UserRole.ADMIN,
      companyId: company.id,
      title: "Administrator",
      division: Division.SERVICE,
      color: "#2563EB",
    },
  });

  const jordan = await prisma.user.upsert({
    where: { email: "tech@stormsprinklers.com" },
    update: {
      title: "Lead Technician",
      status: EmployeeStatus.ACTIVE,
      division: Division.INSTALL,
      color: "#16A34A",
      tags: ["install", "senior"],
    },
    create: {
      email: "tech@stormsprinklers.com",
      name: "Jordan Tech",
      passwordHash,
      phone: "+18015550101",
      role: UserRole.TECH,
      companyId: company.id,
      title: "Lead Technician",
      division: Division.INSTALL,
      color: "#16A34A",
      tags: ["install", "senior"],
    },
  });

  const mike = await prisma.user.upsert({
    where: { email: "mike@stormsprinklers.com" },
    update: {
      title: "Service Technician",
      status: EmployeeStatus.ACTIVE,
      division: Division.SERVICE,
      color: "#EA580C",
      tags: ["service"],
    },
    create: {
      email: "mike@stormsprinklers.com",
      name: "Mike Keller",
      passwordHash,
      phone: "+18015550102",
      role: UserRole.TECH,
      companyId: company.id,
      title: "Service Technician",
      division: Division.SERVICE,
      color: "#EA580C",
      tags: ["service"],
    },
  });

  const sarah = await prisma.user.upsert({
    where: { email: "sarah@stormsprinklers.com" },
    update: {
      title: "CSR",
      status: EmployeeStatus.ACTIVE,
      division: Division.SERVICE,
      color: "#7C3AED",
    },
    create: {
      email: "sarah@stormsprinklers.com",
      name: "Sarah Mitchell",
      passwordHash,
      phone: "+18015550103",
      role: UserRole.CSR,
      companyId: company.id,
      title: "Customer Service Rep",
      division: Division.SERVICE,
      color: "#7C3AED",
    },
  });

  const areaRecords: Record<string, string> = {};
  for (const area of SERVICE_AREAS) {
    const record = await prisma.serviceArea.upsert({
      where: { companyId_slug: { companyId: company.id, slug: area.slug } },
      update: { name: area.name, color: area.color, sortOrder: area.sortOrder },
      create: {
        companyId: company.id,
        name: area.name,
        slug: area.slug,
        color: area.color,
        sortOrder: area.sortOrder,
      },
    });
    areaRecords[area.slug] = record.id;

    for (const zip of area.zips) {
      const existing = await prisma.serviceAreaZip.findFirst({
        where: { zipCode: zip, serviceArea: { companyId: company.id } },
      });
      if (!existing) {
        await prisma.serviceAreaZip.create({
          data: { serviceAreaId: record.id, zipCode: zip },
        });
      }
    }
  }

  const assignAreas = async (userId: string, slugs: string[]) => {
    for (const slug of slugs) {
      const serviceAreaId = areaRecords[slug];
      if (!serviceAreaId) continue;
      await prisma.userServiceArea.upsert({
        where: { userId_serviceAreaId: { userId, serviceAreaId } },
        update: {},
        create: { userId, serviceAreaId },
      });
    }
  };

  await assignAreas(austin.id, ["utah-county-central", "slc-county-central"]);
  await assignAreas(jordan.id, ["utah-county-north", "utah-county-central"]);
  await assignAreas(mike.id, ["utah-county-south", "slc-county-south"]);
  await assignAreas(sarah.id, ["slc-county-north"]);

  const installCrew = await prisma.crew.upsert({
    where: { id: "seed-crew-install" },
    update: { name: "Install Crew A", color: "#059669", division: Division.INSTALL },
    create: {
      id: "seed-crew-install",
      companyId: company.id,
      name: "Install Crew A",
      color: "#059669",
      division: Division.INSTALL,
    },
  });

  const serviceCrew = await prisma.crew.upsert({
    where: { id: "seed-crew-service" },
    update: { name: "Service Crew B", color: "#D97706", division: Division.SERVICE },
    create: {
      id: "seed-crew-service",
      companyId: company.id,
      name: "Service Crew B",
      color: "#D97706",
      division: Division.SERVICE,
    },
  });

  for (const [crewId, userId] of [
    [installCrew.id, jordan.id],
    [serviceCrew.id, mike.id],
  ] as const) {
    await prisma.crewMember.upsert({
      where: { crewId_userId: { crewId, userId } },
      update: {},
      create: { crewId, userId },
    });
  }

  const customers = [
    {
      name: "James Anderson",
      companyName: "Anderson Landscaping",
      phone: "+18015550142",
      email: "james@andersonland.com",
      address: "1245 Maple Street",
      city: "Orem",
      state: "UT",
      zip: "84057",
      leadSource: "Referral",
    },
    {
      name: "Robert Chen",
      companyName: "Chen Commercial",
      phone: "+18015550234",
      email: "robert@chencomm.com",
      address: "456 Business Park Dr",
      city: "Lehi",
      state: "UT",
      zip: "84043",
      leadSource: "Website",
    },
    {
      name: "Lisa Park",
      companyName: "Park Residence",
      phone: "+18015550321",
      email: "lisa@email.com",
      address: "789 Elm St",
      city: "Provo",
      state: "UT",
      zip: "84604",
      leadSource: "Google",
    },
  ];

  const customerRecords = [];
  for (const customer of customers) {
    const existing = await prisma.customer.findFirst({
      where: { companyId: company.id, email: customer.email },
    });
    if (existing) {
      customerRecords.push(existing);
    } else {
      customerRecords.push(
        await prisma.customer.create({ data: { ...customer, companyId: company.id } })
      );
    }
  }

  const propertyRecords: Record<string, string> = {};
  for (const customer of customerRecords) {
    const existing = await prisma.customerProperty.findFirst({
      where: { customerId: customer.id, isPrimary: true },
    });
    if (existing) {
      propertyRecords[customer.id] = existing.id;
    } else if (customer.address) {
      const property = await prisma.customerProperty.create({
        data: {
          companyId: company.id,
          customerId: customer.id,
          name: "Primary",
          address: customer.address,
          city: customer.city,
          state: customer.state,
          zip: customer.zip,
          isPrimary: true,
        },
      });
      propertyRecords[customer.id] = property.id;
    }
  }

  const priceBookItems: Record<string, string> = {};
  for (let i = 0; i < PRICE_BOOK_CATEGORIES.length; i++) {
    const cat = PRICE_BOOK_CATEGORIES[i];
    const category = await prisma.priceBookCategory.upsert({
      where: { companyId_slug: { companyId: company.id, slug: cat.slug } },
      update: { name: cat.name, sortOrder: i },
      create: {
        companyId: company.id,
        name: cat.name,
        slug: cat.slug,
        sortOrder: i,
      },
    });

    for (let j = 0; j < cat.items.length; j++) {
      const item = cat.items[j];
      const existing = await prisma.priceBookItem.findFirst({
        where: { categoryId: category.id, name: item.name },
      });
      if (existing) {
        priceBookItems[item.name] = existing.id;
      } else {
        const created = await prisma.priceBookItem.create({
          data: {
            categoryId: category.id,
            name: item.name,
            unitPrice: item.unitPrice,
            sortOrder: j,
          },
        });
        priceBookItems[item.name] = created.id;
      }
    }
  }

  const weekStart = startOfWeek(new Date());
  const existingVisits = await prisma.visit.count({ where: { companyId: company.id } });

  if (existingVisits === 0) {
    const visits = [
      {
        title: "Spring startup - Anderson",
        startAt: visitTime(weekStart, 1, 8),
        endAt: visitTime(weekStart, 1, 11),
        division: Division.SERVICE,
        serviceAreaId: areaRecords["utah-county-north"],
        assignedUserId: mike.id,
        customerId: customerRecords[0]?.id,
        propertyId: customerRecords[0] ? propertyRecords[customerRecords[0].id] : undefined,
        address: "1245 Maple Street",
        city: "Orem",
        state: "UT",
        zip: "84057",
      },
      {
        title: "Backflow test - Chen",
        startAt: visitTime(weekStart, 1, 9, 30),
        endAt: visitTime(weekStart, 1, 11, 30),
        division: Division.SERVICE,
        serviceAreaId: areaRecords["utah-county-central"],
        assignedUserId: mike.id,
        crewId: serviceCrew.id,
        customerId: customerRecords[1]?.id,
        propertyId: customerRecords[1] ? propertyRecords[customerRecords[1].id] : undefined,
        address: "456 Business Park Dr",
        city: "Lehi",
        state: "UT",
        zip: "84043",
      },
      {
        title: "New install - zone 4",
        startAt: visitTime(weekStart, 2, 8),
        endAt: visitTime(weekStart, 2, 12),
        division: Division.INSTALL,
        serviceAreaId: areaRecords["utah-county-central"],
        assignedUserId: jordan.id,
        crewId: installCrew.id,
      },
      {
        title: "Repair - Park residence",
        startAt: visitTime(weekStart, 3, 10),
        endAt: visitTime(weekStart, 3, 12),
        division: Division.SERVICE,
        serviceAreaId: areaRecords["utah-county-south"],
        assignedUserId: mike.id,
        customerId: customerRecords[2]?.id,
        propertyId: customerRecords[2] ? propertyRecords[customerRecords[2].id] : undefined,
        address: "789 Elm St",
        city: "Provo",
        state: "UT",
        zip: "84604",
      },
      {
        title: "SLC commercial inspection",
        startAt: visitTime(weekStart, 4, 8),
        endAt: visitTime(weekStart, 4, 11),
        division: Division.SERVICE,
        serviceAreaId: areaRecords["slc-county-north"],
        assignedUserId: mike.id,
      },
      {
        title: "Install - drip conversion",
        startAt: visitTime(weekStart, 4, 13),
        endAt: visitTime(weekStart, 4, 16),
        division: Division.INSTALL,
        serviceAreaId: areaRecords["utah-county-north"],
        assignedUserId: jordan.id,
        crewId: installCrew.id,
      },
      {
        title: "Winterization prep",
        startAt: visitTime(weekStart, 5, 9),
        endAt: visitTime(weekStart, 5, 12),
        division: Division.SERVICE,
        serviceAreaId: areaRecords["slc-county-south"],
        assignedUserId: mike.id,
      },
      {
        title: "Controller upgrade",
        startAt: visitTime(weekStart, 2, 13),
        endAt: visitTime(weekStart, 2, 15),
        division: Division.INSTALL,
        serviceAreaId: areaRecords["slc-county-central"],
        assignedUserId: jordan.id,
      },
      {
        title: "Midday service call",
        startAt: visitTime(weekStart, 3, 14),
        endAt: visitTime(weekStart, 3, 16),
        division: Division.SERVICE,
        serviceAreaId: areaRecords["utah-county-north"],
        assignedUserId: mike.id,
      },
      {
        title: "Estimate follow-up",
        startAt: visitTime(weekStart, 5, 14),
        endAt: visitTime(weekStart, 5, 15, 30),
        division: Division.SERVICE,
        serviceAreaId: areaRecords["slc-county-central"],
        assignedUserId: austin.id,
        status: VisitStatus.SCHEDULED,
      },
    ];

    const createdVisits = [];
    for (const visit of visits) {
      createdVisits.push(
        await prisma.visit.create({
          data: {
            companyId: company.id,
            status: VisitStatus.SCHEDULED,
            ...visit,
          },
        })
      );
    }

    const backflowVisit = createdVisits[1];
    if (backflowVisit && priceBookItems["Backflow test"]) {
      await prisma.visitLineItem.create({
        data: {
          visitId: backflowVisit.id,
          priceBookItemId: priceBookItems["Backflow test"],
          name: "Backflow test",
          quantity: 1,
          unitPrice: 125,
          total: 125,
        },
      });
    }

    const andersonCustomer = customerRecords[0];
    if (andersonCustomer && propertyRecords[andersonCustomer.id]) {
      const existingEstimate = await prisma.estimate.findFirst({
        where: { companyId: company.id, customerId: andersonCustomer.id },
      });
      if (!existingEstimate) {
        const estimate = await prisma.estimate.create({
          data: {
            companyId: company.id,
            customerId: andersonCustomer.id,
            propertyId: propertyRecords[andersonCustomer.id],
            visitId: createdVisits[0]?.id,
            status: EstimateStatus.DRAFT,
            subtotal: 450,
            total: 450,
            lineItems: {
              create: [
                {
                  name: "Spring startup service",
                  quantity: 1,
                  unitPrice: 350,
                  total: 350,
                  priceBookItemId: priceBookItems["Service call minimum"],
                },
                {
                  name: "Zone inspection",
                  quantity: 1,
                  unitPrice: 100,
                  total: 100,
                },
              ],
            },
          },
        });
        await prisma.estimateNote.create({
          data: {
            estimateId: estimate.id,
            authorId: sarah.id,
            body: "Customer requested quote before scheduling full startup.",
          },
        });
      }
    }
  }

  console.log("Seed complete. Dev login: admin@stormsprinklers.com / Test123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
