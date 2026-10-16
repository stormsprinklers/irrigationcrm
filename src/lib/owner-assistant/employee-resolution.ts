export type OwnerAssistantEmployee = { id: string; name: string; email: string };

export type EmployeeNameMatch =
  | { ok: true; employee: OwnerAssistantEmployee }
  | { ok: false; reason: "NOT_FOUND" | "AMBIGUOUS" };

function comparableName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function matchOwnerAssistantEmployee(
  employees: OwnerAssistantEmployee[],
  requestedName: string
): EmployeeNameMatch {
  const target = comparableName(requestedName);
  if (!target) return { ok: false, reason: "NOT_FOUND" };
  const exact = employees.filter((employee) => comparableName(employee.name) === target);
  const matches = exact.length
    ? exact
    : employees.filter((employee) => comparableName(employee.name).includes(target));
  if (matches.length === 0) return { ok: false, reason: "NOT_FOUND" };
  if (matches.length > 1) return { ok: false, reason: "AMBIGUOUS" };
  return { ok: true, employee: matches[0]! };
}
