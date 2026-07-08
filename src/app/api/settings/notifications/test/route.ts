import { NextResponse } from "next/server";
import { forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { buildNotificationContext } from "@/lib/notifications/context";
import { sendOperationalNotification } from "@/lib/notifications/send";
import { prisma } from "@/lib/prisma";

export async function POST() {
  try {
    const user = await requireSessionUser();
    if (user.role !== "ADMIN" && user.role !== "MANAGER") return forbiddenResponse();

    const company = await prisma.company.findUnique({ where: { id: user.companyId } });
    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    if (!company || !dbUser) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    const startAt = new Date();
    startAt.setDate(startAt.getDate() + 3);
    startAt.setHours(13, 0, 0, 0);

    const context = buildNotificationContext({
      company,
      customer: { name: dbUser.name, address: "123 Sample St", city: "Denver", state: "CO", zip: "80202" },
      visit: {
        title: "Sample service visit",
        startAt,
        address: "123 Sample St",
        city: "Denver",
        state: "CO",
        zip: "80202",
      },
      technician: { name: dbUser.name, websiteTeamSlug: dbUser.websiteTeamSlug },
      portalUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/portal/${company.portalSlug ?? company.bookingSlug ?? "demo"}`,
    });

    const result = await sendOperationalNotification({
      companyId: user.companyId,
      event: "VISIT_SCHEDULED",
      recipient: {
        name: dbUser.name,
        email: dbUser.email,
        phone: dbUser.phone,
      },
      context,
      options: {
        linkPlaceholders: {
          portal: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/portal/${company.portalSlug ?? company.bookingSlug ?? ""}`,
          review: company.googleReviewUrl ?? undefined,
        },
      },
    });

    if (!result.emailSent && !result.smsSent) {
      const freezeReason = result.skipped.find((s) =>
        s.startsWith("Outbound communications disabled:")
      );
      if (freezeReason) {
        return NextResponse.json({ error: freezeReason }, { status: 403 });
      }
      return NextResponse.json(
        { error: "No channels available", skipped: result.skipped },
        { status: 503 }
      );
    }

    const parts = [];
    if (result.emailSent) parts.push("email");
    if (result.smsSent) parts.push("SMS");
    return NextResponse.json({ message: `Test sent via ${parts.join(" and ")}` });
  } catch {
    return unauthorizedResponse();
  }
}
