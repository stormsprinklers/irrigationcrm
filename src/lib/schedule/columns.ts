/** Column id for a crew in Day view (avoids colliding with user ids). */
export function scheduleCrewColumnId(crewId: string) {
  return `crew:${crewId}`;
}

export function parseScheduleCrewColumnId(columnId: string): string | null {
  if (!columnId.startsWith("crew:")) return null;
  const id = columnId.slice("crew:".length);
  return id || null;
}

/** Roles that never get their own Day-view schedule columns. */
export const SCHEDULE_COLUMN_EXCLUDED_ROLES = ["CSR", "SOCIAL_MEDIA_MANAGER"] as const;
