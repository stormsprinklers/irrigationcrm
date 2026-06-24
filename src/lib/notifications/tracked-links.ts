import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";

const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL ?? "";

export type TrackedLinkKind =
  | "portal"
  | "invoice"
  | "review"
  | "survey"
  | "technician"
  | "estimate";

export async function createTrackedLink(params: {
  deliveryId: string;
  kind: TrackedLinkKind;
  destinationUrl: string;
}): Promise<string> {
  const token = randomBytes(12).toString("base64url");
  await prisma.trackedLink.create({
    data: {
      deliveryId: params.deliveryId,
      kind: params.kind,
      destinationUrl: params.destinationUrl,
      token,
    },
  });
  return `${APP_URL()}/api/track/l/${token}`;
}

export async function recordTrackedLinkClick(token: string): Promise<string | null> {
  const link = await prisma.trackedLink.findUnique({ where: { token } });
  if (!link) return null;

  await prisma.trackedLink.update({
    where: { id: link.id },
    data: {
      clickCount: { increment: 1 },
      clickedAt: link.clickedAt ?? new Date(),
    },
  });

  return link.destinationUrl;
}

export function injectTrackedUrlsInText(
  body: string,
  urlMap: Record<string, string>
): string {
  let result = body;
  for (const [placeholder, trackedUrl] of Object.entries(urlMap)) {
    result = result.split(placeholder).join(trackedUrl);
  }
  return result;
}
