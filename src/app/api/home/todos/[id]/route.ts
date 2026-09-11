import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  forbiddenResponse,
  notFoundResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { canUseOfficeTodos, deleteOfficeTodo, setOfficeTodoCompleted } from "@/lib/home/todos";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (!canUseOfficeTodos(user.role)) return forbiddenResponse();
    const { id } = await params;
    const body = await request.json();
    if (typeof body.completed !== "boolean") {
      return badRequestResponse("completed is required");
    }

    const todo = await setOfficeTodoCompleted(user.companyId, id, body.completed, user.id);
    if (!todo) return notFoundResponse();
    return NextResponse.json(todo);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") return unauthorizedResponse();
    return NextResponse.json({ error: "Failed to update to-do" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (!canUseOfficeTodos(user.role)) return forbiddenResponse();
    const { id } = await params;
    const deleted = await deleteOfficeTodo(user.companyId, id);
    if (!deleted) return notFoundResponse();
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") return unauthorizedResponse();
    return NextResponse.json({ error: "Failed to delete to-do" }, { status: 500 });
  }
}
