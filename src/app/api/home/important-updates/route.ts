import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import {
  createImportantUpdate,
  listImportantUpdates,
} from "@/lib/home/important-updates";
import { canUseOfficeTodos } from "@/lib/home/todo-types";

export async function GET() {
  try {
    const user = await requireSessionUser();
    if (!canUseOfficeTodos(user.role)) return forbiddenResponse();
    return NextResponse.json({ updates: await listImportantUpdates(user.companyId) });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") return unauthorizedResponse();
    return NextResponse.json({ error: "Failed to load important updates" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (!canUseOfficeTodos(user.role)) return forbiddenResponse();
    const body = await request.json().catch(() => ({}));
    const update = await createImportantUpdate(user.companyId, user.id, body);
    return NextResponse.json(update, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") return unauthorizedResponse();
    if (error instanceof Error && error.message === "Title is required") {
      return badRequestResponse(error.message);
    }
    return NextResponse.json({ error: "Failed to create important update" }, { status: 500 });
  }
}
