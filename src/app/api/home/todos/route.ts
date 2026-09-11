import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { canUseOfficeTodos, createOfficeTodo, listOfficeTodos } from "@/lib/home/todos";

export async function GET() {
  try {
    const user = await requireSessionUser();
    if (!canUseOfficeTodos(user.role)) return forbiddenResponse();
    const todos = await listOfficeTodos(user.companyId);
    return NextResponse.json({ todos });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") return unauthorizedResponse();
    return NextResponse.json({ error: "Failed to load to-do list" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (!canUseOfficeTodos(user.role)) return forbiddenResponse();

    const body = await request.json();
    const title = typeof body.title === "string" ? body.title : "";
    if (!title.trim()) return badRequestResponse("Title is required");

    const todo = await createOfficeTodo(user.companyId, user.id, {
      title,
      notes: typeof body.notes === "string" ? body.notes : null,
      recurrence: body.recurrence,
    });
    return NextResponse.json(todo, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") return unauthorizedResponse();
    if (error instanceof Error && error.message === "Title is required") {
      return badRequestResponse(error.message);
    }
    return NextResponse.json({ error: "Failed to create to-do" }, { status: 500 });
  }
}
