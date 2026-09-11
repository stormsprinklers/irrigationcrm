import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  forbiddenResponse,
  notFoundResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import {
  canUseOfficeTodos,
  deleteOfficeTodo,
  setOfficeTodoCompleted,
  skipOfficeTodoOccurrence,
  updateOfficeTodo,
} from "@/lib/home/todos";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (!canUseOfficeTodos(user.role)) return forbiddenResponse();
    const { id } = await params;
    const body = await request.json();

    const hasCompleted = typeof body.completed === "boolean";
    const hasFields =
      body.title !== undefined ||
      body.notes !== undefined ||
      body.recurrence !== undefined ||
      body.recurrenceEvery !== undefined;

    if (!hasCompleted && !hasFields) {
      return badRequestResponse("Nothing to update");
    }

    if (hasCompleted) {
      const todo = await setOfficeTodoCompleted(user.companyId, id, body.completed, user.id);
      if (!todo) return notFoundResponse();
      if (!hasFields) return NextResponse.json(todo);
    }

    const todo = await updateOfficeTodo(user.companyId, id, {
      title: typeof body.title === "string" ? body.title : undefined,
      notes:
        typeof body.notes === "string" ? body.notes : body.notes === null ? null : undefined,
      recurrence: body.recurrence,
      recurrenceEvery: body.recurrenceEvery,
    });
    if (!todo) return notFoundResponse();
    return NextResponse.json(todo);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") return unauthorizedResponse();
    if (error instanceof Error && (error.message === "Title is required" || error.message === "Nothing to update")) {
      return badRequestResponse(error.message);
    }
    return NextResponse.json({ error: "Failed to update to-do" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (!canUseOfficeTodos(user.role)) return forbiddenResponse();
    const { id } = await params;
    const scope = request.nextUrl.searchParams.get("scope");

    if (scope === "occurrence") {
      const todo = await skipOfficeTodoOccurrence(user.companyId, id, user.id);
      if (!todo) return notFoundResponse();
      return NextResponse.json(todo);
    }

    const deleted = await deleteOfficeTodo(user.companyId, id);
    if (!deleted) return notFoundResponse();
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") return unauthorizedResponse();
    if (error instanceof Error && error.message === "This task is not repeating") {
      return badRequestResponse(error.message);
    }
    return NextResponse.json({ error: "Failed to delete to-do" }, { status: 500 });
  }
}
