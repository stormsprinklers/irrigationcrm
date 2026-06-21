import { NextRequest, NextResponse } from "next/server";
import {
  badRequestResponse,
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { uploadPrivateBlob } from "@/lib/blob/storage";

const MAX_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = ["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/wave"];

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (user.role !== "ADMIN" && user.role !== "MANAGER") {
      return forbiddenResponse();
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return badRequestResponse("File is required");
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return badRequestResponse("Invalid file type. Use MP3 or WAV.");
    }

    if (file.size > MAX_SIZE) {
      return badRequestResponse("File must be under 10MB");
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const blob = await uploadPrivateBlob(
      `voice-clips/${user.companyId}/${Date.now()}-${safeName}`,
      file,
      { contentType: file.type }
    );

    return NextResponse.json({ url: blob.url, pathname: blob.pathname, mimeType: file.type });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Voice clip upload failed:", error);
    const message = error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
