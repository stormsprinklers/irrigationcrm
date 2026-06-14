import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import {
  clockIn,
  clockOut,
  computeEntryDurationHours,
  getOpenClockEntry,
  getTodayClockSummary,
} from "@/lib/timesheets/clock";

export async function GET() {
  try {
    const user = await requireSessionUser();
    const [openEntry, today] = await Promise.all([
      getOpenClockEntry(user.id),
      getTodayClockSummary(user.id),
    ]);

    return NextResponse.json({
      openEntry: openEntry
        ? {
            id: openEntry.id,
            clockInAt: openEntry.clockInAt.toISOString(),
            durationHours: computeEntryDurationHours(openEntry),
          }
        : null,
      todayHours: today.totalHours,
      todayEntries: today.entries.map((e) => ({
        id: e.id,
        clockInAt: e.clockInAt.toISOString(),
        clockOutAt: e.clockOutAt?.toISOString() ?? null,
        durationHours: computeEntryDurationHours(e),
      })),
    });
  } catch {
    return unauthorizedResponse();
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const body = await request.json();
    const action = body.action as string;

    if (action === "in") {
      try {
        const entry = await clockIn(user.id, user.companyId);
        return NextResponse.json({
          openEntry: {
            id: entry.id,
            clockInAt: entry.clockInAt.toISOString(),
            durationHours: 0,
          },
        });
      } catch (error) {
        if (error instanceof Error && error.message === "Already clocked in") {
          return badRequestResponse("Already clocked in");
        }
        throw error;
      }
    }

    if (action === "out") {
      try {
        const entry = await clockOut(user.id);
        return NextResponse.json({
          openEntry: null,
          closedEntry: {
            id: entry.id,
            clockInAt: entry.clockInAt.toISOString(),
            clockOutAt: entry.clockOutAt?.toISOString() ?? null,
            durationHours: computeEntryDurationHours(entry),
          },
        });
      } catch (error) {
        if (error instanceof Error && error.message === "Not clocked in") {
          return badRequestResponse("Not clocked in");
        }
        throw error;
      }
    }

    return badRequestResponse('action must be "in" or "out"');
  } catch {
    return unauthorizedResponse();
  }
}
