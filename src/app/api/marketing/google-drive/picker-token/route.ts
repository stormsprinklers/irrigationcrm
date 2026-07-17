import { NextResponse } from "next/server";
import { forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { canManageCustomers } from "@/lib/customers/permissions";
import { canSubmitSocialPosts } from "@/lib/marketing/social-permissions";
import {
  getGoogleDriveAccessToken,
  getGoogleDriveConnectionStatus,
  getGooglePickerApiKey,
  GoogleDriveApiError,
} from "@/lib/google-drive/client";
import { getGeneralGoogleOAuthConfig } from "@/lib/google-oauth/config";

export async function GET() {
  try {
    const user = await requireSessionUser();
    const canUse =
      canManageCustomers(user.role) || canSubmitSocialPosts(user.role);
    if (!canUse) return forbiddenResponse();

    const status = await getGoogleDriveConnectionStatus(user.companyId);
    if (!status.connected) {
      return NextResponse.json({ error: "Google Drive is not connected" }, { status: 400 });
    }

    const apiKey = getGooglePickerApiKey();
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "Set GOOGLE_PICKER_API_KEY (or GOOGLE_MAPS_API_KEY with Picker API enabled) for the Google Picker.",
        },
        { status: 503 }
      );
    }

    const accessToken = await getGoogleDriveAccessToken(user.companyId);
    const { clientId } = getGeneralGoogleOAuthConfig();

    return NextResponse.json({
      accessToken,
      apiKey,
      clientId,
      appId: process.env.GOOGLE_CLOUD_PROJECT_NUMBER?.trim() || undefined,
    });
  } catch (error) {
    if (error instanceof GoogleDriveApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return unauthorizedResponse();
  }
}
