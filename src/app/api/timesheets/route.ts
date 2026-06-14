import { NextRequest, NextResponse } from "next/server";
import { endOfDay, parseISO, startOfDay } from "date-fns";
import {
  badRequestResponse,
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { canViewAllTimesheets } from "@/lib/timesheets/permissions";
import { listTimesheetEntries } from "@/lib/timesheets/queries";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const fromParam = request.nextUrl.searchParams.get("from");
    const toParam = request.nextUrl.searchParams.get("to");
    const userIdParam = request.nextUrl.searchParams.get("userId");

    const from = fromParam ? startOfDay(parseISO(fromParam)) : startOfDay(new Date());
    const to = toParam ? endOfDay(parseISO(toParam)) : endOfDay(new Date());

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return badRequestResponse("Invalid date range");
    }

    let userId: string | undefined;
    if (canViewAllTimesheets(user.role)) {
      userId = userIdParam ?? undefined;
    } else {
      if (userIdParam && userIdParam !== user.id) {
        return forbiddenResponse();
      }
      userId = user.id;
    }

    const entries = await listTimesheetEntries(user.companyId, { from, to, userId });

    let employees: { id: string; name: string }[] | undefined;
    if (canViewAllTimesheets(user.role)) {
      employees = await prisma.user.findMany({
        where: { companyId: user.companyId, status: "ACTIVE" },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      });
    }

    return NextResponse.json({
      entries,
      from: from.toISOString(),
      to: to.toISOString(),
      canViewAll: canViewAllTimesheets(user.role),
      employees,
    });
  } catch {
    return unauthorizedResponse();
  }
}
