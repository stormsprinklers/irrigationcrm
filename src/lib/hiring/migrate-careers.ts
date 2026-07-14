import { EmailFolder, Prisma } from "@prisma/client";
import { createApplicantFromCareers } from "@/lib/hiring/applicants";
import {
  fetchWebsiteCareerApplications,
  fetchWebsiteCareerJobs,
} from "@/lib/hiring/website-catalog";
import { WEBSITE_LEAD_THREAD_PREFIX } from "@/lib/inbox/website-leads";
import { prisma } from "@/lib/prisma";

const MIGRATED_ANSWER_PLACEHOLDER =
  "[Migrated from CRM leads — interview answers were not stored on the lead. Re-score manually if needed.]";

function isCareersLead(lead: {
  source: string | null;
  externalId: string | null;
  metadata: Prisma.JsonValue | null;
}) {
  if (lead.source?.toLowerCase() === "careers") return true;
  if (lead.externalId?.startsWith("careers:")) return true;
  if (lead.metadata && typeof lead.metadata === "object" && !Array.isArray(lead.metadata)) {
    const meta = lead.metadata as Record<string, unknown>;
    if (meta.job_slug || meta.jobSlug) return true;
  }
  return false;
}

function jobSlugFromLead(lead: {
  notes: string | null;
  externalId: string | null;
  metadata: Prisma.JsonValue | null;
}) {
  if (lead.metadata && typeof lead.metadata === "object" && !Array.isArray(lead.metadata)) {
    const meta = lead.metadata as Record<string, unknown>;
    const slug = meta.job_slug ?? meta.jobSlug;
    if (typeof slug === "string" && slug.trim()) return slug.trim();
  }
  if (lead.externalId?.startsWith("careers:")) {
    const rest = lead.externalId.slice("careers:".length);
    const dash = rest.lastIndexOf("-");
    // externalId is careers:{email}-{jobSlug} — jobSlug can contain dashes
    // Prefer metadata; fall back to notes as title/slug
  }
  if (lead.notes?.trim() && !lead.notes.includes(" ")) {
    return lead.notes.trim();
  }
  return "unknown-role";
}

/**
 * Import historical careers applications into Hiring and remove them from Leads/Inbox.
 * Safe to run repeatedly (idempotent on JobApplicant.externalId).
 */
export async function migrateCareersIntoHiring(companyId: string) {
  const summary = {
    importedFromWebsite: 0,
    importedFromLeads: 0,
    alreadyPresent: 0,
    leadsArchived: 0,
    inboxTrashed: 0,
    websiteJobs: 0,
    errors: [] as string[],
  };

  const websiteJobs = await fetchWebsiteCareerJobs(companyId);
  summary.websiteJobs = websiteJobs.length;
  const jobTitleBySlug = new Map(websiteJobs.map((j) => [j.slug, j.jobTitle]));

  const websiteApps = await fetchWebsiteCareerApplications(companyId);
  for (const app of websiteApps) {
    if (!app.email || !app.jobSlug || !app.hardWorkMeaning) continue;
    try {
      const result = await createApplicantFromCareers(
        companyId,
        {
          externalId: app.externalId,
          name: app.name,
          email: app.email,
          phone: app.phone,
          jobSlug: app.jobSlug,
          jobTitle: app.jobTitle ?? jobTitleBySlug.get(app.jobSlug) ?? null,
          interest: app.interest,
          hardWorkMeaning: app.hardWorkMeaning,
          integrityMeaning: app.integrityMeaning,
          inconvenientServiceExample: app.inconvenientServiceExample,
          personalGoals: app.personalGoals,
          metadata: app.metadata,
        },
        {
          // Historical imports: score but don't spam managers/applicants with floods
          skipNotify: true,
          skipBookingInvite: true,
        }
      );
      if (result.created) summary.importedFromWebsite += 1;
      else summary.alreadyPresent += 1;
    } catch (err) {
      summary.errors.push(
        `Website app ${app.externalId}: ${err instanceof Error ? err.message : "failed"}`
      );
    }
  }

  const careersLeads = await prisma.lead.findMany({
    where: {
      companyId,
      OR: [
        { source: { equals: "careers", mode: "insensitive" } },
        { externalId: { startsWith: "careers:" } },
      ],
    },
  });

  for (const lead of careersLeads) {
    if (!isCareersLead(lead)) continue;
    if (!lead.email?.trim()) {
      summary.errors.push(`Lead ${lead.id} has no email; skipped`);
      continue;
    }

    const meta =
      lead.metadata && typeof lead.metadata === "object" && !Array.isArray(lead.metadata)
        ? (lead.metadata as Record<string, unknown>)
        : {};
    const jobSlug =
      (typeof meta.job_slug === "string" && meta.job_slug) ||
      (typeof meta.jobSlug === "string" && meta.jobSlug) ||
      jobSlugFromLead(lead);
    const externalId =
      lead.externalId?.startsWith("careers:")
        ? lead.externalId
        : `careers:${lead.email.trim()}-${jobSlug}`;

    const already = await prisma.jobApplicant.findFirst({
      where: { companyId, externalId },
      select: { id: true },
    });

    if (!already) {
      try {
        await createApplicantFromCareers(
          companyId,
          {
            externalId,
            name: lead.name,
            email: lead.email.trim(),
            phone: lead.phone,
            jobSlug,
            jobTitle:
              (lead.notes && lead.notes.includes(" ") ? lead.notes : null) ||
              jobTitleBySlug.get(jobSlug) ||
              lead.notes ||
              jobSlug,
            interest: typeof meta.interest === "string" ? meta.interest : null,
            hardWorkMeaning: MIGRATED_ANSWER_PLACEHOLDER,
            integrityMeaning: MIGRATED_ANSWER_PLACEHOLDER,
            inconvenientServiceExample: MIGRATED_ANSWER_PLACEHOLDER,
            personalGoals: MIGRATED_ANSWER_PLACEHOLDER,
            metadata: {
              ...meta,
              migratedFromLeadId: lead.id,
              migratedFrom: "crm_lead",
            },
          },
          {
            skipScoring: true,
            skipNotify: true,
            skipBookingInvite: true,
          }
        );
        summary.importedFromLeads += 1;
      } catch (err) {
        summary.errors.push(
          `Lead ${lead.id}: ${err instanceof Error ? err.message : "failed"}`
        );
        continue;
      }
    } else {
      summary.alreadyPresent += 1;
    }

    const threadId = `${WEBSITE_LEAD_THREAD_PREFIX}${lead.id}`;
    const trashed = await prisma.emailMessage.updateMany({
      where: { companyId, threadId, folder: { not: EmailFolder.TRASH } },
      data: { folder: EmailFolder.TRASH },
    });
    summary.inboxTrashed += trashed.count;

    await prisma.lead.delete({ where: { id: lead.id } }).catch(() => {
      // If FK blocks delete, leave lead but it's filtered from UI via source exclusion
    });
    summary.leadsArchived += 1;
  }

  return summary;
}
