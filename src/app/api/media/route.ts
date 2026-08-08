import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { listCompanyMediaAssets, uploadCompanyMediaAsset } from "@/lib/media/library";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const limit = Number(request.nextUrl.searchParams.get("limit") ?? "60");
    const assets = await listCompanyMediaAssets(user.companyId, limit);
    return NextResponse.json({ assets });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    const message = err instanceof Error ? err.message : "Failed to list media";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    const formData = await request.formData();
    const file = formData.get("file");
    const alt = formData.get("alt");
    if (!(file instanceof File)) {
      return badRequestResponse("file is required");
    }
    const asset = await uploadCompanyMediaAsset({
      companyId: user.companyId,
      userId: user.id,
      file,
      alt: typeof alt === "string" ? alt : null,
    });
    return NextResponse.json({ asset });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
