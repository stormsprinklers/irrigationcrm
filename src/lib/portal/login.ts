import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { isEmailConfigured } from "@/lib/inbox/email";
import { sendCompanyEmail } from "@/lib/inbox/email-branding";
import { PORTAL_LOGIN_RATE_LIMIT, PORTAL_LOGIN_TOKEN_TTL_MS } from "./constants";
import { resolvePortalSlug } from "./company";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function findCustomersByEmail(companyId: string, email: string) {
  return prisma.customer.findMany({
    where: {
      companyId,
      email: normalizeEmail(email),
      status: "ACTIVE",
    },
    select: { id: true, name: true, email: true, doNotService: true },
    orderBy: { name: "asc" },
  });
}

export async function requestPortalLoginLink(params: {
  companyId: string;
  companyName: string;
  slug: string;
  customerId: string;
  email: string;
  sendgridFrom?: string | null;
  emailSenderName?: string | null;
  emailLogoUrl?: string | null;
}) {
  const email = normalizeEmail(params.email);
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const recentCount = await prisma.customerPortalLoginToken.count({
    where: { companyId: params.companyId, email, createdAt: { gte: since } },
  });
  if (recentCount >= PORTAL_LOGIN_RATE_LIMIT) {
    throw new Error("Too many login requests. Please try again later.");
  }

  const customer = await prisma.customer.findFirst({
    where: { id: params.customerId, companyId: params.companyId, email },
  });
  if (!customer) throw new Error("Customer not found");
  if (customer.doNotService) {
    throw new Error("Portal access is not available for this account. Please contact us.");
  }

  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + PORTAL_LOGIN_TOKEN_TTL_MS);

  await prisma.customerPortalLoginToken.create({
    data: {
      companyId: params.companyId,
      customerId: params.customerId,
      email,
      tokenHash,
      expiresAt,
    },
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const loginUrl = `${appUrl}/api/portal/auth/verify?token=${rawToken}&slug=${encodeURIComponent(params.slug)}`;

  if (isEmailConfigured()) {
    await sendCompanyEmail(
      {
        companyName: params.companyName,
        sendgridFrom: params.sendgridFrom,
        emailSenderName: params.emailSenderName,
        emailLogoUrl: params.emailLogoUrl,
      },
      {
        to: [email],
        subject: `Sign in to ${params.companyName}`,
        text: `Hi ${customer.name},\n\nClick the link below to sign in to your customer portal. This link expires in 15 minutes.\n\n${loginUrl}\n\n— ${params.companyName}`,
        html: `<p>Hi ${customer.name},</p><p>Click the link below to sign in to your customer portal. This link expires in 15 minutes.</p><p><a href="${loginUrl}">Sign in to your portal</a></p><p>— ${params.companyName}</p>`,
      }
    );
  }

  return { sent: isEmailConfigured(), loginUrl: isEmailConfigured() ? undefined : loginUrl };
}

export async function verifyPortalLoginToken(token: string, slug: string) {
  const tokenHash = hashToken(token);
  const record = await prisma.customerPortalLoginToken.findUnique({
    where: { tokenHash },
    include: {
      company: { select: { portalEnabled: true, portalSlug: true, bookingSlug: true } },
    },
  });

  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return null;
  }

  const companySlug = resolvePortalSlug(record.company);
  if (!record.company.portalEnabled || companySlug !== slug) {
    return null;
  }

  await prisma.customerPortalLoginToken.update({
    where: { id: record.id },
    data: { usedAt: new Date() },
  });

  return { customerId: record.customerId, companyId: record.companyId };
}
