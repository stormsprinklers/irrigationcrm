import { prisma } from "@/lib/prisma";

export type WebsiteCareerJob = {
  slug: string;
  jobTitle: string;
  department?: string;
  location?: string;
  employmentType?: string;
  applicationsOpen?: boolean;
};

function resolveWebsiteBaseUrl(websiteBaseUrl?: string | null) {
  const fromCompany = websiteBaseUrl?.trim().replace(/\/$/, "");
  if (fromCompany) return fromCompany;
  const fromEnv = process.env.WEBSITE_BASE_URL?.trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  return "https://www.stormsprinklers.com";
}

export async function fetchWebsiteCareerJobs(companyId: string): Promise<WebsiteCareerJob[]> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { websiteBaseUrl: true },
  });
  const base = resolveWebsiteBaseUrl(company?.websiteBaseUrl);
  try {
    const res = await fetch(`${base}/api/careers/jobs`, {
      method: "GET",
      headers: { Accept: "application/json" },
      next: { revalidate: 0 },
      cache: "no-store",
    });
    if (!res.ok) {
      console.error("fetchWebsiteCareerJobs failed:", res.status);
      return [];
    }
    const data = (await res.json()) as { jobs?: WebsiteCareerJob[] };
    return Array.isArray(data.jobs) ? data.jobs : [];
  } catch (err) {
    console.error("fetchWebsiteCareerJobs error:", err);
    return [];
  }
}

export type WebsiteCareersApplicationExport = {
  externalId: string;
  name: string;
  email: string;
  phone?: string | null;
  jobSlug: string;
  jobTitle?: string | null;
  interest?: string | null;
  hardWorkMeaning: string;
  integrityMeaning: string;
  inconvenientServiceExample: string;
  personalGoals: string;
  metadata?: Record<string, unknown>;
};

export async function fetchWebsiteCareerApplications(
  companyId: string
): Promise<WebsiteCareersApplicationExport[]> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { websiteBaseUrl: true },
  });
  const base = resolveWebsiteBaseUrl(company?.websiteBaseUrl);
  const key =
    process.env.WEBSITE_INTEGRATION_KEY?.trim() ||
    process.env.CRM_INTEGRATION_KEY?.trim() ||
    "";

  if (!key) {
    console.warn(
      "fetchWebsiteCareerApplications skipped: set WEBSITE_INTEGRATION_KEY (same as website CRM_INTEGRATION_KEY)"
    );
    return [];
  }

  try {
    const res = await fetch(`${base}/api/careers/applications`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${key}`,
      },
      cache: "no-store",
    });
    if (!res.ok) {
      console.error("fetchWebsiteCareerApplications failed:", res.status, await res.text().catch(() => ""));
      return [];
    }
    const data = (await res.json()) as { applications?: WebsiteCareersApplicationExport[] };
    return Array.isArray(data.applications) ? data.applications : [];
  } catch (err) {
    console.error("fetchWebsiteCareerApplications error:", err);
    return [];
  }
}
