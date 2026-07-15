import { NextRequest, NextResponse } from "next/server";
import { AppNotificationType, UserRole } from "@prisma/client";
import { notifyStaffInApp } from "@/lib/notifications/in-app";
import { isOilDueSoon } from "@/lib/vehicles/oil";
import { vehicleDisplayName } from "@/lib/vehicles/types";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const vehicles = await prisma.vehicle.findMany({
    where: { status: "ACTIVE" },
    include: {
      assignedUser: { select: { id: true, name: true } },
    },
  });

  let notified = 0;
  let skipped = 0;

  for (const vehicle of vehicles) {
    const dueSoon = isOilDueSoon({
      nextOilChangeDueAt: vehicle.nextOilChangeDueAt,
      nextOilChangeDueMileage: vehicle.nextOilChangeDueMileage,
      currentMileage: vehicle.currentMileage,
      now,
    });

    if (!dueSoon) {
      skipped += 1;
      continue;
    }

    if (vehicle.lastOilReminderSentAt) {
      const since = now.getTime() - vehicle.lastOilReminderSentAt.getTime();
      // Dedupe within the current due window (~14 days)
      if (since < 14 * 24 * 60 * 60 * 1000) {
        skipped += 1;
        continue;
      }
    }

    const label = vehicleDisplayName(vehicle);
    const dueParts: string[] = [];
    if (vehicle.nextOilChangeDueAt) {
      dueParts.push(`date ${vehicle.nextOilChangeDueAt.toISOString().slice(0, 10)}`);
    }
    if (vehicle.nextOilChangeDueMileage != null) {
      dueParts.push(`${vehicle.nextOilChangeDueMileage.toLocaleString()} mi`);
    }
    const dueText = dueParts.length ? dueParts.join(" / ") : "soon";
    const assigneeText = vehicle.assignedUser?.name ?? "Shop";

    let userIds: string[] | undefined;
    if (vehicle.assignedUserId) {
      const managers = await prisma.user.findMany({
        where: {
          companyId: vehicle.companyId,
          status: "ACTIVE",
          role: { in: [UserRole.ADMIN, UserRole.MANAGER] },
        },
        select: { id: true },
      });
      userIds = Array.from(
        new Set([vehicle.assignedUserId, ...managers.map((m) => m.id)])
      );
    } else {
      const managers = await prisma.user.findMany({
        where: {
          companyId: vehicle.companyId,
          status: "ACTIVE",
          role: { in: [UserRole.ADMIN, UserRole.MANAGER] },
        },
        select: { id: true },
      });
      userIds = managers.map((m) => m.id);
      if (!userIds.length) {
        skipped += 1;
        continue;
      }
    }

    await notifyStaffInApp({
      companyId: vehicle.companyId,
      type: AppNotificationType.VEHICLE_REMINDER,
      title: `Oil change due: ${label}`,
      body: `Assigned to ${assigneeText}. Due ${dueText}. Current mileage ${vehicle.currentMileage.toLocaleString()}.`,
      href: `/vehicles/${vehicle.id}`,
      userIds,
    }).catch((err) => console.error("Vehicle reminder notify failed", vehicle.id, err));

    await prisma.vehicle.update({
      where: { id: vehicle.id },
      data: { lastOilReminderSentAt: now },
    });

    notified += 1;
  }

  return NextResponse.json({ ok: true, notified, skipped, checked: vehicles.length });
}
