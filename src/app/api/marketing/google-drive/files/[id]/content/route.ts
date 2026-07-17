import { NextRequest, NextResponse } from "next/server";
import { forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { canManageCustomers } from "@/lib/customers/permissions";
import { canSubmitSocialPosts } from "@/lib/marketing/social-permissions";
import { fetchDriveFileBytes, GoogleDriveApiError } from "@/lib/google-drive/client";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const canView =
      canManageCustomers(user.role) || canSubmitSocialPosts(user.role);
    if (!canView) return forbiddenResponse();

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "File id required" }, { status: 400 });
    }

    const { buffer, mimeType, fileName } = await fetchDriveFileBytes(user.companyId, id);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": `inline; filename="${encodeURIComponent(fileName)}"`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    if (error instanceof GoogleDriveApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    const message = error instanceof Error ? error.message : "Failed to load Drive file";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
