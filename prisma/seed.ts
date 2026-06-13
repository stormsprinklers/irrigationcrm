import { PrismaClient, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("password123", 10);

  const company = await prisma.company.upsert({
    where: { id: "seed-company" },
    update: {},
    create: {
      id: "seed-company",
      name: "Storm Sprinklers",
      twilioPhone: process.env.TWILIO_PHONE_NUMBER ?? null,
      sendgridFrom: process.env.SENDGRID_FROM_EMAIL ?? "support@stormsprinklers.com",
      recordCalls: true,
      transcribeCalls: true,
    },
  });

  await prisma.user.upsert({
    where: { email: "austin@stormsprinklers.com" },
    update: {},
    create: {
      email: "austin@stormsprinklers.com",
      name: "Austin",
      passwordHash,
      phone: "+18015550100",
      role: UserRole.ADMIN,
      companyId: company.id,
    },
  });

  await prisma.user.upsert({
    where: { email: "tech@stormsprinklers.com" },
    update: {},
    create: {
      email: "tech@stormsprinklers.com",
      name: "Jordan Tech",
      passwordHash,
      phone: "+18015550101",
      role: UserRole.TECH,
      companyId: company.id,
    },
  });

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
      name: "Sarah Mitchell",
      companyName: "Mitchell Properties",
      phone: "+18015550198",
      email: "sarah@mitchellprops.com",
      address: "892 Oak Avenue",
      city: "Provo",
      state: "UT",
      zip: "84604",
      leadSource: "Google",
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
  ];

  for (const customer of customers) {
    const existing = await prisma.customer.findFirst({
      where: { companyId: company.id, email: customer.email },
    });
    if (!existing) {
      await prisma.customer.create({
        data: { ...customer, companyId: company.id },
      });
    }
  }

  console.log("Seed complete. Login: austin@stormsprinklers.com / password123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
