import { NextResponse } from "next/server";
import { forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { canManageCustomers } from "@/lib/customers/permissions";
import {
  driveFileToJobPhoto,
  GoogleDriveApiError,
  listAccessibleDriveImages,
} from "@/lib/google-drive/client";

export async function GET() {
  try {
    const user = await requireSessionUser();
    if (!canManageCustomers(user.role)) return forbiddenResponse();

    const files = await listAccessibleDriveImages(user.companyId);
    const photos = files.map((file) =>
      driveFileToJobPhoto(file, `/api/marketing/google-drive/files/${file.id}/content`)
    );

    return NextResponse.json({ photos, files });
  } catch (error) {
    if (error instanceof GoogleDriveApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return unauthorizedResponse();
  }
}
