import { VisitStatus } from "@prisma/client";

const SCHEDULED_LIKE_STATUSES: VisitStatus[] = [
  VisitStatus.SCHEDULED,
  VisitStatus.EN_ROUTE,
  VisitStatus.IN_PROGRESS,
  VisitStatus.PAUSED,
  VisitStatus.COMPLETED,
];

export function requiresTechnicianAssignment(status: VisitStatus) {
  return SCHEDULED_LIKE_STATUSES.includes(status);
}

export function validateScheduledVisitAssignment(
  status: VisitStatus,
  assignedUserId: string | null | undefined,
  crewId?: string | null | undefined
): string | null {
  if (requiresTechnicianAssignment(status) && !assignedUserId && !crewId) {
    return "Assign a technician or crew before scheduling this visit";
  }
  return null;
}
