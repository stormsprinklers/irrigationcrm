import { UserRole } from "@prisma/client";
import type { ApplicantStage } from "@prisma/client";

export function canAccessHiring(role: string | null | undefined) {
  return role === UserRole.ADMIN || role === UserRole.MANAGER;
}

export function stageFromAiScore(score: number | null | undefined): ApplicantStage {
  if (score == null || !Number.isFinite(score)) return "MAYBE";
  if (score <= 5) return "REJECTED";
  if (score >= 10) return "GOOD_FIT";
  return "MAYBE";
}

export function stageNeedsBookingInvite(stage: ApplicantStage) {
  return stage === "MAYBE" || stage === "GOOD_FIT";
}

export function stageLabel(stage: ApplicantStage) {
  switch (stage) {
    case "REJECTED":
      return "Rejected";
    case "MAYBE":
      return "Maybe";
    case "GOOD_FIT":
      return "Good fit";
    default:
      return stage;
  }
}
