export function normalizeVisitAssigneeIds(
  assignedUserIds: unknown,
  legacyAssignedUserId: unknown,
  existingIds: string[] = []
): string[] {
  let raw: unknown[];
  if (Array.isArray(assignedUserIds)) {
    raw = assignedUserIds;
  } else if (legacyAssignedUserId === null || legacyAssignedUserId === "") {
    raw = [];
  } else if (legacyAssignedUserId !== undefined) {
    raw = [legacyAssignedUserId, ...existingIds.slice(1)];
  } else {
    raw = existingIds;
  }

  return [
    ...new Set(
      raw
        .filter((value): value is string | number =>
          typeof value === "string" || typeof value === "number"
        )
        .map((value) => String(value).trim())
        .filter(Boolean)
    ),
  ];
}
