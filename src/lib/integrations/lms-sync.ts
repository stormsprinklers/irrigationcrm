import type { User } from "@prisma/client";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const LMS_BASE = process.env.LMS_INTEGRATION_URL?.replace(/\/$/, "") ?? "";
const LMS_KEY = process.env.LMS_INTEGRATION_KEY ?? "";

function mapRoleToLms(role: UserRole): string {
  if (role === UserRole.ADMIN) return "ADMIN";
  if (role === UserRole.MANAGER) return "MANAGER";
  return "EMPLOYEE";
}

export async function pushEmployeeToLms(employee: Pick<User, "id" | "name" | "email" | "role" | "status">) {
  if (!LMS_BASE || !LMS_KEY) return null;

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
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LMS_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      await prisma.user.update({
        where: { id: employee.id },
        data: { lmsSyncStatus: "error", lmsLastSyncedAt: new Date() },
      });
      console.error("LMS sync failed:", res.status, text);
      return null;
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
    return data;
  } catch (err) {
    await prisma.user.update({
      where: { id: employee.id },
      data: { lmsSyncStatus: "error", lmsLastSyncedAt: new Date() },
    });
    console.error("LMS sync error:", err);
    return null;
  }
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
      headers: { Authorization: `Bearer ${LMS_KEY}` },
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
