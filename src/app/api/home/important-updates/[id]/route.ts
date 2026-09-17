import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  forbiddenResponse,
  notFoundResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import {
  deleteImportantUpdate,
  updateImportantUpdate,
} from "@/lib/home/important-updates";
import { canUseOfficeTodos } from "@/lib/home/todo-types";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (!canUseOfficeTodos(user.role)) return forbiddenResponse();
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const update = await updateImportantUpdate(user.companyId, id, body);
    if (!update) return notFoundResponse();
    return NextResponse.json(update);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") return unauthorizedResponse();
    if (error instanceof Error && (error.message === "Title is required" || error.message === "Nothing to update")) {
      return badRequestResponse(error.message);
    }
    return NextResponse.json({ error: "Failed to update important update" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (!canUseOfficeTodos(user.role)) return forbiddenResponse();
    const { id } = await params;
    if (!(await deleteImportantUpdate(user.companyId, id))) return notFoundResponse();
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") return unauthorizedResponse();
    return NextResponse.json({ error: "Failed to delete important update" }, { status: 500 });
  }
}
