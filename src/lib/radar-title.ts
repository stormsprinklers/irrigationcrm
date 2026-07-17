import { cache } from "react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const RADAR_APP_NAME = "Radar";

/** Resolve the tenant company name for document / UI titles. */
export const getAppCompanyName = cache(async (): Promise<string | null> => {
  try {
    if (!process.env.DATABASE_URL) return null;

    const session = await auth();
    if (session?.user?.companyId) {
      const company = await prisma.company.findUnique({
        where: { id: session.user.companyId },
        select: { name: true },
      });
      if (company?.name?.trim()) return company.name.trim();
    }

    const company = await prisma.company.findFirst({
      select: { name: true },
      orderBy: { name: "asc" },
    });
    return company?.name?.trim() || null;
  } catch {
    return null;
  }
});

export function radarDocumentTitle(companyName?: string | null): string {
  const name = companyName?.trim();
  return name ? `${RADAR_APP_NAME} - ${name}` : RADAR_APP_NAME;
}

export async function getRadarDocumentTitle(): Promise<string> {
  return radarDocumentTitle(await getAppCompanyName());
}
