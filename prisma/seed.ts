import {
  PrismaClient,
  UserRole,
  Division,
  EmployeeStatus,
  VisitStatus,
  EstimateStatus,
  PayType,
  PayPeriodType,
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
  { slug: "service-irrigation", name: "Irrigation", items: [{ name: "Backflow test", unitPrice: 125, sku: "SVC-BF-TEST" }, { name: "Backflow repair", unitPrice: 185 }, { name: "Stop & waste replacement", unitPrice: 275 }, { name: "Rotor head replacement", unitPrice: 95 }, { name: "Nozzle adjustment", unitPrice: 45 }, { name: "Leak diagnosis", unitPrice: 89 }, { name: "Pipe repair", unitPrice: 150 }, { name: "Controller programming", unitPrice: 75 }, { name: "Smart controller install", unitPrice: 450 }, { name: "Drip line repair", unitPrice: 120 }, { name: "Service call minimum", unitPrice: 89, laborRate: 95, laborHours: 1 }] },
];

const MATERIAL_CATEGORIES = [
  {
    slug: "material-parts",
    name: "Parts",
    items: [
      { name: "1/2\" PVC coupling", unitPrice: 4.5, unitCost: 1.2, sku: "PVC-050-CPL" },
      { name: "Rain Bird 5000 rotor", unitPrice: 24, unitCost: 12.5, sku: "RB-5000" },
      { name: "9V battery", unitPrice: 6, unitCost: 2.25, sku: "BAT-9V" },
    ],
  },
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
      flatRatePricingEnabled: true,
      materialMarkupsEnabled: true,
      payPeriodType: PayPeriodType.BIWEEKLY,
      payPeriodAnchorDate: new Date("2025-01-01"),
      estimateDepositRequired: false,
      address: "1234 Irrigation Way",
      city: "Orem",
      state: "UT",
      zip: "84057",
      supportEmail: "support@stormsprinklers.com",
      phone: "(801) 555-0100",
      website: "www.stormsprinklers.com",
      legalName: "Storm Sprinklers LLC",
      industry: "Irrigation & Lawn Care",
      description:
        "Storm Sprinklers is a full-service irrigation company serving Utah County and surrounding areas.",
      leadSources: ["Website", "Referral", "Google", "Yard sign"],
      referralCode: "STORM-REF",
      bookingSlug: "storm-sprinklers",
      intakeRequiredFields: ["name", "phone", "email"],
    },
    create: {
      id: "seed-company",
      name: "Storm Sprinklers",
      address: "1234 Irrigation Way",
      city: "Orem",
      state: "UT",
      zip: "84057",
      supportEmail: "support@stormsprinklers.com",
      phone: "(801) 555-0100",
      website: "www.stormsprinklers.com",
      legalName: "Storm Sprinklers LLC",
      industry: "Irrigation & Lawn Care",
      description:
        "Storm Sprinklers is a full-service irrigation company serving Utah County and surrounding areas.",
      twilioPhone: process.env.TWILIO_PHONE_NUMBER ?? null,
      sendgridFrom: process.env.SENDGRID_FROM_EMAIL ?? "support@stormsprinklers.com",
      recordCalls: true,
      transcribeCalls: true,
      flatRatePricingEnabled: true,
      materialMarkupsEnabled: true,
      payPeriodType: PayPeriodType.BIWEEKLY,
      payPeriodAnchorDate: new Date("2025-01-01"),
      estimateExpiryDays: 14,
      leadSources: ["Website", "Referral", "Google", "Yard sign"],
      referralCode: "STORM-REF",
      bookingSlug: "storm-sprinklers",
      intakeRequiredFields: ["name", "phone", "email"],
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
      payType: PayType.SALARY,
      annualSalary: 65000,
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
      payType: PayType.SALARY,
      annualSalary: 65000,
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
      payType: PayType.HOURLY,
      hourlyRate: 28,
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
      payType: PayType.HOURLY,
      hourlyRate: 28,
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
      payType: PayType.HYBRID,
      hourlyRate: 24,
      commissionPercent: 8,
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
      payType: PayType.HYBRID,
      hourlyRate: 24,
      commissionPercent: 8,
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
      update: { name: cat.name, sortOrder: i, type: "SERVICE" },
      create: {
        companyId: company.id,
        type: "SERVICE",
        name: cat.name,
        slug: cat.slug,
        sortOrder: i,
      },
    });

    for (let j = 0; j < cat.items.length; j++) {
      const item = cat.items[j] as {
        name: string;
        unitPrice: number;
        sku?: string;
        laborRate?: number;
        laborHours?: number;
      };
      const existing = await prisma.priceBookItem.findFirst({
        where: { categoryId: category.id, name: item.name },
      });
      if (existing) {
        priceBookItems[item.name] = existing.id;
      } else {
        const created = await prisma.priceBookItem.create({
          data: {
            categoryId: category.id,
            type: "SERVICE",
            name: item.name,
            sku: item.sku ?? null,
            unitPrice: item.unitPrice,
            laborRate: item.laborRate ?? null,
            laborHours: item.laborHours ?? null,
            sortOrder: j,
          },
        });
        priceBookItems[item.name] = created.id;
      }
    }
  }

  for (let i = 0; i < MATERIAL_CATEGORIES.length; i++) {
    const cat = MATERIAL_CATEGORIES[i];
    const category = await prisma.priceBookCategory.upsert({
      where: { companyId_slug: { companyId: company.id, slug: cat.slug } },
      update: { name: cat.name, sortOrder: i, type: "MATERIAL" },
      create: {
        companyId: company.id,
        type: "MATERIAL",
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
      if (!existing) {
        await prisma.priceBookItem.create({
          data: {
            categoryId: category.id,
            type: "MATERIAL",
            name: item.name,
            sku: item.sku ?? null,
            unitPrice: item.unitPrice,
            unitCost: item.unitCost ?? null,
            sortOrder: j,
          },
        });
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

  const existingTemplate = await prisma.maintenancePlanTemplate.findFirst({
    where: { companyId: company.id, name: "Storm Shield" },
  });
  if (!existingTemplate) {
    await prisma.maintenancePlanTemplate.create({
      data: {
        companyId: company.id,
        name: "Storm Shield",
        description: "Annual lawn sprinkler maintenance plan with seasonal tune-ups and winterization.",
        termsText:
          "Storm Shield includes spring activation, summer tune-up, and fall winterization. Waived service and emergency fees, priority scheduling, and 5-year parts & labor warranty when maintained by Storm Sprinklers.",
        basePrice: 379,
        active: true,
        durationType: "FIXED_TERM",
        durationYears: 1,
        allowedBillingFrequencies: ["ANNUAL", "MONTHLY", "QUARTERLY"],
        autoRenewDefault: true,
        cancellationFeeType: "NONE",
        cancellationNoticeDays: 30,
        benefits: [
          "Waived service & emergency fees",
          "Priority scheduling",
          "5-year parts & labor warranty",
          "Spring system activation",
          "Summer system checkup",
          "Fall system winterization",
        ],
        visitTemplates: {
          create: [
            {
              name: "Spring Activation",
              season: "SPRING",
              defaultMonth: 3,
              visitTitle: "Spring system activation",
              description: "Startup, zone check, controller programming",
              estimatedMinutes: 90,
              sortOrder: 0,
            },
            {
              name: "Summer Tune-up",
              season: "SUMMER",
              defaultMonth: 7,
              visitTitle: "Summer system checkup",
              description: "Coverage check, nozzle adjustment, mid-season tune-up",
              estimatedMinutes: 60,
              sortOrder: 1,
            },
            {
              name: "Fall Winterization",
              season: "FALL",
              defaultMonth: 10,
              visitTitle: "Fall system winterization",
              description: "Blow out lines and winterize system",
              estimatedMinutes: 90,
              sortOrder: 2,
            },
          ],
        },
      },
    });
  }

  await prisma.lead.deleteMany({ where: { companyId: company.id, name: { in: ["Maria Lopez", "Chris Nguyen"] } } });
  await prisma.lead.createMany({
    data: [
      {
        companyId: company.id,
        name: "Maria Lopez",
        phone: "+18015550222",
        email: "maria@example.com",
        source: "Website",
        status: "NEW",
        assignedUserId: austin.id,
      },
      {
        companyId: company.id,
        name: "Chris Nguyen",
        phone: "+18015550333",
        source: "Google",
        status: "CONTACTED",
        assignedUserId: austin.id,
      },
    ],
  });

  await prisma.priceBookDiscount.deleteMany({ where: { companyId: company.id, name: "Spring special" } });
  await prisma.priceBookDiscount.create({
    data: {
      companyId: company.id,
      name: "Spring special",
      code: "SPRING10",
      type: "PERCENT",
      amount: 10,
      active: true,
      appliesTo: "SERVICES",
    },
  });

  const twilioE164 = company.twilioPhone ?? process.env.TWILIO_PHONE_NUMBER ?? "+18015550100";
  const normalizedE164 = twilioE164.startsWith("+")
    ? twilioE164
    : `+${twilioE164.replace(/\D/g, "")}`;

  const defaultGroup = await prisma.agentGroup.upsert({
    where: { id: "seed-voice-csr-group" },
    update: { name: "Customer Service" },
    create: {
      id: "seed-voice-csr-group",
      companyId: company.id,
      name: "Customer Service",
      ringStrategy: "SIMULTANEOUS",
      ringTimeoutSec: 30,
    },
  });

  const csrMembers = [austin.id, jordan.id, sarah.id];
  for (const [index, userId] of csrMembers.entries()) {
    await prisma.agentGroupMember.upsert({
      where: { groupId_userId: { groupId: defaultGroup.id, userId } },
      update: { sortOrder: index },
      create: { groupId: defaultGroup.id, userId, sortOrder: index },
    });
  }

  await prisma.callFlow.upsert({
    where: { id: "seed-voice-main-flow" },
    update: { name: "Main line" },
    create: {
      id: "seed-voice-main-flow",
      companyId: company.id,
      name: "Main line",
      description: "Ring CSR team, then queue",
    },
  });

  const dialNode = await prisma.callFlowNode.upsert({
    where: { id: "seed-voice-dial-node" },
    update: { config: { groupId: defaultGroup.id } },
    create: {
      id: "seed-voice-dial-node",
      flowId: "seed-voice-main-flow",
      type: "DIAL_GROUP",
      config: { groupId: defaultGroup.id },
      sortOrder: 0,
    },
  });

  const voicemailNode = await prisma.callFlowNode.upsert({
    where: { id: "seed-voice-after-hours-vm" },
    update: {},
    create: {
      id: "seed-voice-after-hours-vm",
      flowId: "seed-voice-main-flow",
      type: "VOICEMAIL",
      config: {},
      sortOrder: 1,
    },
  });

  await prisma.callFlow.update({
    where: { id: "seed-voice-main-flow" },
    data: {
      entryNodeId: dialNode.id,
      afterHoursNodeId: voicemailNode.id,
    },
  });

  await prisma.phoneNumber.upsert({
    where: { companyId_e164: { companyId: company.id, e164: normalizedE164 } },
    update: {
      callFlowId: "seed-voice-main-flow",
      isPrimary: true,
      friendlyName: "Main tracking line",
    },
    create: {
      companyId: company.id,
      e164: normalizedE164,
      friendlyName: "Main tracking line",
      isPrimary: true,
      callFlowId: "seed-voice-main-flow",
    },
  });

  await prisma.laborRate.upsert({
    where: { id: "seed-labor-journeyman" },
    update: { name: "Journeyman", hourlyCost: 65, hourlyPrice: 120, isDefault: true },
    create: {
      id: "seed-labor-journeyman",
      companyId: company.id,
      name: "Journeyman",
      hourlyCost: 65,
      hourlyPrice: 120,
      isDefault: true,
      sortOrder: 0,
    },
  });

  await prisma.materialMarkupTier.deleteMany({ where: { companyId: company.id } });
  await prisma.materialMarkupTier.createMany({
    data: [
      { companyId: company.id, minCost: 0.01, maxCost: 50, markupPercent: 150, sortOrder: 0 },
      { companyId: company.id, minCost: 50.01, maxCost: 100, markupPercent: 100, sortOrder: 1 },
      { companyId: company.id, minCost: 100.01, maxCost: 500, markupPercent: 75, sortOrder: 2 },
      { companyId: company.id, minCost: 500.01, maxCost: null, markupPercent: 50, sortOrder: 3 },
    ],
  });

  const existingEstimateTemplate = await prisma.estimateTemplate.findFirst({
    where: { companyId: company.id, name: "Backflow test bundle" },
  });
  if (!existingEstimateTemplate) {
    await prisma.estimateTemplate.create({
      data: {
        companyId: company.id,
        name: "Backflow test bundle",
        description: "Standard backflow test visit",
        lineItems: {
          create: [
            { name: "Backflow test", quantity: 1, unitPrice: 125, sortOrder: 0 },
            { name: "Trip charge", quantity: 1, unitPrice: 49, sortOrder: 1 },
          ],
        },
      },
    });
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
