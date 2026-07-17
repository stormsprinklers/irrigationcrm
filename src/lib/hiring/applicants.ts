import { randomBytes } from "crypto";
import { AppNotificationType, type ApplicantStage, type JobApplicant, Prisma } from "@prisma/client";
import { sendCompanyEmail } from "@/lib/inbox/email-branding";
import { stageFromAiScore, stageNeedsBookingInvite } from "@/lib/hiring/permissions";
import {
  scoreApplicantAnswers,
  scoreBreakdownFromMetadata,
} from "@/lib/hiring/score";
import { notifyStaffInApp } from "@/lib/notifications/in-app";
import { prisma } from "@/lib/prisma";
import type { WebsiteCareersApplicationInput } from "@/lib/integrations/schemas";

function mergeMetadata(
  existing: unknown,
  patch: Record<string, unknown>
): Prisma.InputJsonValue {
  const base =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  return { ...base, ...patch } as Prisma.InputJsonValue;
}

export function serializeApplicant(
  applicant: JobApplicant & {
    bookings?: Array<{
      id: string;
      startAt: Date;
      endAt: Date;
      status: string;
      manager?: { id: string; name: string } | null;
    }>;
  }
) {
  const upcoming = (applicant.bookings ?? [])
    .filter((b) => b.status === "SCHEDULED")
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())[0];

  return {
    id: applicant.id,
    externalId: applicant.externalId,
    name: applicant.name,
    email: applicant.email,
    phone: applicant.phone,
    jobSlug: applicant.jobSlug,
    jobTitle: applicant.jobTitle,
    interest: applicant.interest,
    hardWorkMeaning: applicant.hardWorkMeaning,
    integrityMeaning: applicant.integrityMeaning,
    inconvenientServiceExample: applicant.inconvenientServiceExample,
    personalGoals: applicant.personalGoals,
    aiScore: applicant.aiScore,
    aiScoreBreakdown: scoreBreakdownFromMetadata(applicant.metadata),
    stage: applicant.stage,
    stageSource: applicant.stageSource,
    bookingInviteSentAt: applicant.bookingInviteSentAt?.toISOString() ?? null,
    bookingToken: applicant.bookingToken,
    metadata: applicant.metadata,
    createdAt: applicant.createdAt.toISOString(),
    updatedAt: applicant.updatedAt.toISOString(),
    booking: upcoming
      ? {
          id: upcoming.id,
          startAt: upcoming.startAt.toISOString(),
          endAt: upcoming.endAt.toISOString(),
          status: upcoming.status,
          manager: upcoming.manager ?? null,
        }
      : null,
  };
}

export async function ensureBookingToken(applicantId: string) {
  const existing = await prisma.jobApplicant.findUnique({
    where: { id: applicantId },
    select: { bookingToken: true },
  });
  if (existing?.bookingToken) return existing.bookingToken;

  const token = randomBytes(24).toString("hex");
  const updated = await prisma.jobApplicant.update({
    where: { id: applicantId },
    data: { bookingToken: token },
    select: { bookingToken: true },
  });
  return updated.bookingToken!;
}

export async function sendHiringBookingInvite(applicantId: string) {
  const applicant = await prisma.jobApplicant.findUnique({
    where: { id: applicantId },
    include: {
      company: {
        select: {
          id: true,
          name: true,
          sendgridFrom: true,
          emailSenderName: true,
          emailLogoUrl: true,
        },
      },
    },
  });
  if (!applicant) return;
  if (!stageNeedsBookingInvite(applicant.stage)) return;

  const token = await ensureBookingToken(applicant.id);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const bookUrl = `${appUrl.replace(/\/$/, "")}/book/hiring/${token}`;
  const roleLabel = applicant.jobTitle || applicant.jobSlug;

  try {
    await sendCompanyEmail(
      {
        companyName: applicant.company.name,
        sendgridFrom: applicant.company.sendgridFrom,
        emailSenderName: applicant.company.emailSenderName,
        emailLogoUrl: applicant.company.emailLogoUrl,
      },
      {
        companyId: applicant.companyId,
        to: [applicant.email],
        subject: `Next step: short phone screen — ${roleLabel}`,
        text: [
          `Hi ${applicant.name.split(" ")[0] || applicant.name},`,
          ``,
          `Thanks for applying for ${roleLabel} at ${applicant.company.name}.`,
          `Please book a short 5–10 minute phone call using this link:`,
          bookUrl,
          ``,
          `We look forward to speaking with you.`,
          `${applicant.company.name}`,
        ].join("\n"),
        html: `<p>Hi ${escapeHtml(applicant.name.split(" ")[0] || applicant.name)},</p>
<p>Thanks for applying for <strong>${escapeHtml(roleLabel)}</strong> at ${escapeHtml(applicant.company.name)}.</p>
<p>Please book a short 5–10 minute phone call:</p>
<p><a href="${escapeHtml(bookUrl)}">${escapeHtml(bookUrl)}</a></p>
<p>We look forward to speaking with you.<br/>${escapeHtml(applicant.company.name)}</p>`,
      }
    );

    await prisma.jobApplicant.update({
      where: { id: applicant.id },
      data: { bookingInviteSentAt: new Date() },
    });
  } catch (err) {
    console.error("Hiring booking invite email failed:", err);
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function createApplicantFromCareers(
  companyId: string,
  input: WebsiteCareersApplicationInput,
  options?: {
    skipScoring?: boolean;
    skipBookingInvite?: boolean;
    skipNotify?: boolean;
  }
) {
  const existing = await prisma.jobApplicant.findFirst({
    where: { companyId, externalId: input.externalId },
  });
  if (existing) {
    return { applicant: existing, created: false };
  }

  const scored = options?.skipScoring
    ? null
    : await scoreApplicantAnswers({
        hardWorkMeaning: input.hardWorkMeaning,
        integrityMeaning: input.integrityMeaning,
        inconvenientServiceExample: input.inconvenientServiceExample,
        personalGoals: input.personalGoals,
      });
  const aiScore = scored?.total ?? null;
  const stage = options?.skipScoring ? ("MAYBE" as const) : stageFromAiScore(aiScore);

  const metadata = mergeMetadata(input.metadata ?? null, {
    ...(scored ? { aiScoreBreakdown: scored } : {}),
  });

  const applicant = await prisma.jobApplicant.create({
    data: {
      companyId,
      externalId: input.externalId,
      name: input.name,
      email: input.email,
      phone: input.phone ?? null,
      jobSlug: input.jobSlug,
      jobTitle: input.jobTitle ?? null,
      interest: input.interest ?? null,
      hardWorkMeaning: input.hardWorkMeaning,
      integrityMeaning: input.integrityMeaning,
      inconvenientServiceExample: input.inconvenientServiceExample,
      personalGoals: input.personalGoals,
      aiScore,
      stage,
      stageSource: options?.skipScoring ? "MANUAL" : "AI",
      metadata,
    },
  });

  if (!options?.skipNotify) {
    const roleLabel = applicant.jobTitle || applicant.jobSlug;
    const scoreLabel =
      aiScore != null ? `Score: ${aiScore}/12` : "Score: pending";
    await notifyStaffInApp({
      companyId,
      type: AppNotificationType.HIRING_APPLICANT,
      title: `New job applicant: ${applicant.name}`,
      body: `${scoreLabel} · ${roleLabel}`,
      href: `/hiring/applicants/${applicant.id}`,
      userIds: await hiringNotifyUserIds(companyId, applicant.jobSlug),
    }).catch(() => {});
  }

  if (!options?.skipBookingInvite && stageNeedsBookingInvite(stage)) {
    void sendHiringBookingInvite(applicant.id);
  }

  return { applicant, created: true };
}

async function hiringNotifyUserIds(companyId: string, jobSlug: string) {
  const assignment = await prisma.hiringRoleAssignment.findUnique({
    where: { companyId_jobSlug: { companyId, jobSlug } },
    select: { hiringManagerUserId: true },
  });
  if (assignment) return [assignment.hiringManagerUserId];

  const managers = await prisma.user.findMany({
    where: {
      companyId,
      status: "ACTIVE",
      role: { in: ["ADMIN", "MANAGER"] },
    },
    select: { id: true },
  });
  return managers.map((u) => u.id);
}

export async function updateApplicantStage(
  companyId: string,
  applicantId: string,
  stage: ApplicantStage
) {
  const existing = await prisma.jobApplicant.findFirst({
    where: { id: applicantId, companyId },
  });
  if (!existing) return null;

  const updated = await prisma.jobApplicant.update({
    where: { id: applicantId },
    data: { stage, stageSource: "MANUAL" },
    include: {
      bookings: {
        where: { status: "SCHEDULED" },
        orderBy: { startAt: "asc" },
        take: 1,
        include: { manager: { select: { id: true, name: true } } },
      },
    },
  });

  if (stageNeedsBookingInvite(stage) && !updated.bookingInviteSentAt) {
    void sendHiringBookingInvite(updated.id);
  }

  return updated;
}

/**
 * Re-run AI scoring and persist per-section grades (used for older applicants).
 * Does not change stage unless `updateStageFromScore` is true.
 */
export async function rescoreApplicant(
  companyId: string,
  applicantId: string,
  options?: { updateStageFromScore?: boolean }
) {
  const existing = await prisma.jobApplicant.findFirst({
    where: { id: applicantId, companyId },
  });
  if (!existing) return null;

  const scored = await scoreApplicantAnswers({
    hardWorkMeaning: existing.hardWorkMeaning,
    integrityMeaning: existing.integrityMeaning,
    inconvenientServiceExample: existing.inconvenientServiceExample,
    personalGoals: existing.personalGoals,
  });
  if (!scored) return existing;

  const data: Prisma.JobApplicantUpdateInput = {
    aiScore: scored.total,
    metadata: mergeMetadata(existing.metadata, { aiScoreBreakdown: scored }),
  };
  if (options?.updateStageFromScore && existing.stageSource === "AI") {
    data.stage = stageFromAiScore(scored.total);
  }

  return prisma.jobApplicant.update({
    where: { id: applicantId },
    data,
    include: {
      bookings: {
        where: { status: "SCHEDULED" },
        orderBy: { startAt: "asc" },
        take: 1,
        include: { manager: { select: { id: true, name: true } } },
      },
    },
  });
}
