import { NextRequest, NextResponse } from "next/server";
import { badRequestResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { callRecordingPlaybackPath } from "@/lib/voice/recording";

type Params = { params: Promise<{ id: string }> };

const noteInclude = {
  author: { select: { id: true, name: true, photoUrl: true, color: true } },
  callLog: {
    select: {
      id: true,
      startedAt: true,
      durationSec: true,
      transcript: true,
      aiSummary: true,
      recordingUrl: true,
      user: { select: { id: true, name: true } },
      handledBy: { select: { id: true, name: true } },
      conversion: {
        select: { answeredBy: { select: { id: true, name: true } } },
      },
      session: {
        select: { assignedUser: { select: { id: true, name: true } } },
      },
    },
  },
} as const;

function serializeNote(
  note: {
    id: string;
    body: string;
    createdAt: Date;
    author: { id: string; name: string; photoUrl: string | null; color: string | null };
    callLog: {
      id: string;
      startedAt: Date;
      durationSec: number | null;
      transcript: string | null;
      aiSummary: string | null;
      recordingUrl: string | null;
      user: { id: string; name: string } | null;
      handledBy: { id: string; name: string } | null;
      conversion: { answeredBy: { id: string; name: string } | null } | null;
      session: { assignedUser: { id: string; name: string } | null } | null;
    } | null;
  }
) {
  const call = note.callLog;
  const employee =
    call?.conversion?.answeredBy ??
    call?.user ??
    call?.session?.assignedUser ??
    call?.handledBy ??
    null;

  return {
    id: note.id,
    body: note.body,
    createdAt: note.createdAt.toISOString(),
    author: note.author,
    callLog: call
      ? {
          id: call.id,
          startedAt: call.startedAt.toISOString(),
          durationSec: call.durationSec,
          transcript: call.transcript,
          aiSummary: call.aiSummary,
          hasRecording: Boolean(call.recordingUrl),
          recordingPlaybackUrl: call.recordingUrl
            ? callRecordingPlaybackPath(call.id)
            : null,
          employee: employee ? { id: employee.id, name: employee.name } : null,
        }
      : null,
  };
}

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    const notes = await prisma.visitNote.findMany({
      where: { visitId: id, visit: { companyId: user.companyId } },
      orderBy: { createdAt: "desc" },
      include: noteInclude,
    });
    return NextResponse.json(notes.map(serializeNote));
  } catch {
    return unauthorizedResponse();
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    const visit = await prisma.visit.findFirst({
      where: { id, companyId: user.companyId },
      select: { id: true, customerId: true },
    });
    if (!visit) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await request.json();
    const callLogId =
      typeof body.callLogId === "string" && body.callLogId.trim()
        ? body.callLogId.trim()
        : null;

    if (!body.body?.trim() && !callLogId) {
      return badRequestResponse("Note body is required");
    }

    if (callLogId) {
      const call = await prisma.callLog.findFirst({
        where: { id: callLogId, companyId: user.companyId },
        select: { id: true, customerId: true, visitId: true, aiSummary: true },
      });
      if (!call) return badRequestResponse("Call not found");
      if (
        call.customerId &&
        visit.customerId &&
        call.customerId !== visit.customerId
      ) {
        return badRequestResponse("Call belongs to a different customer");
      }

      const noteBody =
        (typeof body.body === "string" && body.body.trim()) ||
        call.aiSummary?.trim() ||
        "Call linked to this job.";

      const note = await prisma.visitNote.create({
        data: {
          visitId: id,
          authorId: user.id,
          body: noteBody,
          callLogId: call.id,
        },
        include: noteInclude,
      });

      if (!call.visitId) {
        await prisma.callLog.update({
          where: { id: call.id },
          data: { visitId: id },
        });
      }

      return NextResponse.json(serializeNote(note), { status: 201 });
    }

    const note = await prisma.visitNote.create({
      data: { visitId: id, authorId: user.id, body: String(body.body).trim() },
      include: noteInclude,
    });

    return NextResponse.json(serializeNote(note), { status: 201 });
  } catch {
    return unauthorizedResponse();
  }
}
