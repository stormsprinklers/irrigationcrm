import bcrypt from "bcryptjs";
import { EmployeeStatus, UserRole } from "@prisma/client";
import { validateEmployeePassword } from "@/lib/employees";
import { ensureDefaultNotificationTemplates } from "@/lib/notifications/send";
import { prisma } from "@/lib/prisma";

export type CreateCompanyInput = {
  name: string;
  legalName?: string | null;
  industry?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  phone?: string | null;
  supportEmail?: string | null;
  website?: string | null;
  timezone?: string | null;
  bookingSlug?: string | null;
  admin: {
    email: string;
    name: string;
    firstName?: string | null;
    lastName?: string | null;
    phone: string;
    password: string;
  };
  /** Bidirectionally link the creating user to the new company admin. */
  linkToCreatorUserId?: string | null;
};

function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

async function uniqueBookingSlug(base: string) {
  const root = slugify(base) || "company";
  let candidate = root;
  let i = 2;
  while (true) {
    const taken = await prisma.company.findFirst({
      where: { bookingSlug: candidate },
      select: { id: true },
    });
    if (!taken) return candidate;
    candidate = `${root}-${i}`;
    i += 1;
  }
}

export async function createCompanyWithAdmin(input: CreateCompanyInput) {
  const name = input.name.trim();
  if (!name) throw new Error("Company name is required");

  const adminEmail = input.admin.email.trim().toLowerCase();
  if (!adminEmail.includes("@")) throw new Error("Admin email is invalid");

  const adminPhone = input.admin.phone.trim();
  if (!adminPhone) throw new Error("Admin phone is required for login MFA");

  const password = input.admin.password;
  const passwordError = validateEmployeePassword(password);
  if (passwordError) throw new Error(passwordError);

  const passwordHash = await bcrypt.hash(password, 10);
  const bookingSlug = await uniqueBookingSlug(
    input.bookingSlug?.trim() || name
  );

  const adminName = input.admin.name.trim() || "Admin";
  const firstName =
    input.admin.firstName?.trim() ||
    adminName.split(/\s+/)[0] ||
    "Admin";
  const lastName =
    input.admin.lastName?.trim() ||
    adminName.split(/\s+/).slice(1).join(" ") ||
    "User";

  const result = await prisma.$transaction(async (tx) => {
    const company = await tx.company.create({
      data: {
        name,
        legalName: input.legalName?.trim() || name,
        industry: input.industry?.trim() || null,
        address: input.address?.trim() || null,
        city: input.city?.trim() || null,
        state: input.state?.trim() || null,
        zip: input.zip?.trim() || null,
        phone: input.phone?.trim() || null,
        supportEmail: input.supportEmail?.trim().toLowerCase() || adminEmail,
        website: input.website?.trim() || null,
        timezone: input.timezone?.trim() || "America/Denver",
        bookingSlug,
        onlineBookingEnabled: false,
        leadSources: ["Website", "Referral", "Google"],
      },
      select: {
        id: true,
        name: true,
        bookingSlug: true,
        supportEmail: true,
      },
    });

    const admin = await tx.user.create({
      data: {
        companyId: company.id,
        email: adminEmail,
        name: adminName,
        firstName,
        lastName,
        phone: adminPhone,
        role: UserRole.ADMIN,
        status: EmployeeStatus.ACTIVE,
        passwordHash,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      },
    });

    if (input.linkToCreatorUserId && input.linkToCreatorUserId !== admin.id) {
      await tx.userAccountLink.upsert({
        where: {
          userId_linkedUserId: {
            userId: input.linkToCreatorUserId,
            linkedUserId: admin.id,
          },
        },
        update: {},
        create: {
          userId: input.linkToCreatorUserId,
          linkedUserId: admin.id,
        },
      });
      await tx.userAccountLink.upsert({
        where: {
          userId_linkedUserId: {
            userId: admin.id,
            linkedUserId: input.linkToCreatorUserId,
          },
        },
        update: {},
        create: {
          userId: admin.id,
          linkedUserId: input.linkToCreatorUserId,
        },
      });
    }

    return { company, admin };
  });

  await ensureDefaultNotificationTemplates(result.company.id);

  return result;
}
