import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { Division, EmployeeStatus, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const DEMO_PASSWORD_LENGTH = 14;

export function appleDemoEmailForCompany(companyId: string) {
  const slug = companyId.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "storm";
  return `apple.demo.${slug}@stormsprinklers.com`;
}

export function generateAppleDemoPassword() {
  // Readable for App Review notes; exclude ambiguous characters.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$";
  const bytes = randomBytes(DEMO_PASSWORD_LENGTH);
  let out = "";
  for (let i = 0; i < DEMO_PASSWORD_LENGTH; i++) {
    out += alphabet[bytes[i]! % alphabet.length];
  }
  return out;
}

// A dedicated tenant is used instead of granting a reviewer access to the
// requesting company's customers. No account links or integrations are copied.
export function appleReviewCompanySlug(companyId: string) {
  return `apple-review-${companyId}`;
}

const reviewAccountSelect = {
  id: true, email: true, name: true, role: true, status: true,
  appleDemoAccount: true, companyId: true, createdAt: true, updatedAt: true,
} as const;

export async function getAppleDemoAccount(companyId: string) {
  return prisma.user.findFirst({
    where: {
      appleDemoAccount: true,
      company: { bookingSlug: appleReviewCompanySlug(companyId) },
    },
    select: reviewAccountSelect,
  });
}

export async function createAppleDemoAccount(companyId: string) {
  const existing = await getAppleDemoAccount(companyId);
  if (existing) return { error: "An isolated Apple review account already exists.", existing };
  const plainPassword = generateAppleDemoPassword();
  const passwordHash = await bcrypt.hash(plainPassword, 10);
  const user = await prisma.$transaction(async (tx) => {
    const company = await tx.company.create({ data: {
      name: "Radar Review Demo", legalName: "Radar Review Demo",
      bookingSlug: appleReviewCompanySlug(companyId),
      industry: "Holiday Lighting", holidayLightingFeaturesEnabled: true,
      irrigationFeaturesEnabled: true, maintenancePlansFeaturesEnabled: false,
      onlineBookingEnabled: false, timezone: "America/Denver",
      // Deliberately no contact destinations, payment accounts, API keys or
      // provider credentials. This tenant contains synthetic records only.
    } });
    const reviewer = await tx.user.create({ data: {
      companyId: company.id, firstName: "Apple", lastName: "Reviewer",
      name: "Apple Reviewer", email: appleDemoEmailForCompany(company.id),
      phone: null, role: UserRole.TECH, status: EmployeeStatus.ACTIVE,
      division: Division.SERVICE, title: "App Review — demo data only",
      color: "#EC4899", tags: ["apple-demo"], appleDemoAccount: true, passwordHash,
    }, select: reviewAccountSelect });
    const customer = await tx.customer.create({ data: {
      companyId: company.id, name: "Sample Customer", address: "100 Example Lane",
      city: "Demo City", state: "UT", zip: "84000", tags: ["review-sample"],
      marketingEmailOptOut: true, marketingSmsOptOut: true,
      appointmentReminderEmailOptOut: true, appointmentReminderSmsOptOut: true,
    } });
    const property = await tx.customerProperty.create({ data: {
      companyId: company.id, customerId: customer.id, name: "Sample Home",
      address: "100 Example Lane", city: "Demo City", state: "UT", zip: "84000", isPrimary: true,
    } });
    const startAt = new Date(); startAt.setHours(15, 0, 0, 0);
    await tx.visit.create({ data: {
      companyId: company.id, customerId: customer.id, propertyId: property.id,
      assignedUserId: reviewer.id, createdByUserId: reviewer.id,
      title: "Holiday lighting appointment", division: Division.HOLIDAY_LIGHTS,
      startAt, endAt: new Date(startAt.getTime() + 3600000),
      address: property.address, city: property.city, state: property.state, zip: property.zip,
      tags: ["review-sample"],
    } });
    await tx.priceBookCategory.create({ data: {
      companyId: company.id, name: "Demo Lighting", slug: "demo-lighting",
      items: { create: [
        { name: "C9 warm white bulbs", unitPrice: 2, unit: "each" },
        { name: "Holiday lighting installation", unitPrice: 150, unit: "hour" },
        { name: "Takedown included", unitPrice: 0, unit: "each" },
      ] },
    } });
    return reviewer;
  });
  return { user, plainPassword };
}

export async function setAppleDemoAccountEnabled(companyId: string, enabled: boolean) {
  const account = await getAppleDemoAccount(companyId);
  if (!account) return { error: "No isolated Apple review account found. Create one first." as const };
  const user = await prisma.user.update({ where: { id: account.id }, data: {
    status: enabled ? EmployeeStatus.ACTIVE : EmployeeStatus.ARCHIVED,
  }, select: reviewAccountSelect });
  if (!enabled) await prisma.mobileSession.updateMany({
    where: { userId: account.id, revokedAt: null }, data: { revokedAt: new Date() },
  });
  return { user };
}

export async function resetAppleDemoPassword(companyId: string) {
  const account = await getAppleDemoAccount(companyId);
  if (!account) return { error: "No isolated Apple review account found. Create one first." as const };
  const plainPassword = generateAppleDemoPassword();
  const passwordHash = await bcrypt.hash(plainPassword, 10);
  const user = await prisma.user.update({ where: { id: account.id }, data: {
    passwordHash, status: EmployeeStatus.ACTIVE, phone: null, role: UserRole.TECH,
  }, select: reviewAccountSelect });
  await prisma.mobileSession.updateMany({ where: { userId: account.id, revokedAt: null }, data: { revokedAt: new Date() } });
  return { user, plainPassword };
}
