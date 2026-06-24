import { randomBytes } from "crypto";
import { addDays } from "date-fns";
import { prisma } from "@/lib/prisma";

export async function createFeedbackSurveyToken(visitId: string): Promise<string> {
  const existing = await prisma.feedbackSurveyToken.findFirst({
    where: { visitId, usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return existing.token;

  const token = randomBytes(16).toString("base64url");
  await prisma.feedbackSurveyToken.create({
    data: {
      visitId,
      token,
      expiresAt: addDays(new Date(), 30),
    },
  });
  return token;
}
