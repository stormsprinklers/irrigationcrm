import type { User } from "@prisma/client";
import { EmployeeStatus, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const LMS_BASE = process.env.LMS_INTEGRATION_URL?.replace(/\/$/, "") ?? "";
const LMS_KEY = process.env.LMS_INTEGRATION_KEY ?? "";

export type LmsSyncResult =
  | { ok: true; lmsUserId?: string }
  | { ok: false; error: string; status?: number };

function mapRoleToLms(role: UserRole): string {
  if (role === UserRole.ADMIN) return "ADMIN";
  if (role === UserRole.MANAGER) return "MANAGER";
  return "EMPLOYEE";
}

function lmsHeaders(extra?: HeadersInit): HeadersInit {
  return {
    "x-integration-key": LMS_KEY,
    ...extra,
  };
}

export function isLmsSyncConfigured() {
  return Boolean(LMS_BASE && LMS_KEY);
}

export async function pushEmployeeToLms(
  employee: Pick<User, "id" | "name" | "email" | "role" | "status">
): Promise<LmsSyncResult> {
  if (!LMS_BASE || !LMS_KEY) {
    return { ok: false, error: "LMS integration not configured on CRM" };
  }

  const payload = {
    crmUserId: employee.id,
    email: employee.email,
    name: employee.name,
    role: mapRoleToLms(employee.role),
    archived: employee.status === "ARCHIVED",
  };

  try {
    const res = await fetch(`${LMS_BASE}/api/integrations/crm/users`, {
      method: "POST",
      headers: lmsHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      let message = text.slice(0, 300);
      try {
        const json = JSON.parse(text) as { error?: string };
        if (json.error) message = json.error;
      } catch {
        // keep raw text
      }
      await prisma.user.update({
        where: { id: employee.id },
        data: { lmsSyncStatus: "error", lmsLastSyncedAt: new Date() },
      });
      console.error("LMS sync failed:", res.status, message);
      return { ok: false, error: message || `LMS returned ${res.status}`, status: res.status };
    }

    const data = (await res.json()) as { lmsUserId?: string };
    await prisma.user.update({
      where: { id: employee.id },
      data: {
        lmsUserId: data.lmsUserId ?? undefined,
        lmsSyncStatus: "synced",
        lmsLastSyncedAt: new Date(),
      },
    });
    return { ok: true, lmsUserId: data.lmsUserId };
  } catch (err) {
    await prisma.user.update({
      where: { id: employee.id },
      data: { lmsSyncStatus: "error", lmsLastSyncedAt: new Date() },
    });
    console.error("LMS sync error:", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to reach LMS",
    };
  }
}

export async function syncAllEmployeesToLms(companyId: string, options?: { includeArchived?: boolean }) {
  if (!isLmsSyncConfigured()) {
    return {
      ok: false as const,
      error: "Set LMS_INTEGRATION_URL and LMS_INTEGRATION_KEY on CRM",
      synced: 0,
      failed: 0,
      results: [] as Array<{ id: string; email: string; ok: boolean; error?: string }>,
    };
  }

  const statusFilter: EmployeeStatus[] = options?.includeArchived
    ? [EmployeeStatus.ACTIVE, EmployeeStatus.ARCHIVED]
    : [EmployeeStatus.ACTIVE];

  const employees = await prisma.user.findMany({
    where: { companyId, status: { in: statusFilter } },
    select: { id: true, name: true, email: true, role: true, status: true },
    orderBy: { email: "asc" },
  });

  const results: Array<{ id: string; email: string; ok: boolean; error?: string }> = [];
  let synced = 0;
  let failed = 0;

  for (const employee of employees) {
    const result = await pushEmployeeToLms(employee);
    if (result.ok) {
      synced += 1;
      results.push({ id: employee.id, email: employee.email, ok: true });
    } else {
      failed += 1;
      results.push({
        id: employee.id,
        email: employee.email,
        ok: false,
        error: result.error,
      });
    }
  }

  return {
    ok: failed === 0,
    synced,
    failed,
    total: employees.length,
    results,
  };
}

export async function fetchLmsTrainingSummary(crmUserId: string) {
  if (!LMS_BASE || !LMS_KEY) {
    return { error: "LMS integration not configured" };
  }

  const user = await prisma.user.findUnique({
    where: { id: crmUserId },
    select: { lmsUserId: true, email: true },
  });
  if (!user) return { error: "Employee not found" };

  const lmsId = user.lmsUserId ?? crmUserId;
  const url = `${LMS_BASE}/api/integrations/crm/users/${encodeURIComponent(lmsId)}/progress`;

  try {
    const res = await fetch(url, {
      headers: lmsHeaders(),
      next: { revalidate: 60 },
    });
    if (!res.ok) {
      return { error: "Failed to load training data" };
    }
    return res.json();
  } catch {
    return { error: "Failed to reach LMS" };
  }
}
