import { NextRequest, NextResponse } from "next/server";
import { badRequestResponse, forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { uploadPrivateBlob } from "@/lib/blob/storage";
import { canManageEmployees } from "@/lib/employees";

const MAX_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (!canManageEmployees(user.role)) return forbiddenResponse();

    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return badRequestResponse("File is required");
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return badRequestResponse("Invalid file type. Use JPEG, PNG, WebP, or GIF.");
    }

    if (file.size > MAX_SIZE) {
      return badRequestResponse("File must be under 5MB");
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const blob = await uploadPrivateBlob(
      `employees/${user.companyId}/${Date.now()}-${safeName}`,
      file,
      { contentType: file.type }
    );

    return NextResponse.json({ url: blob.url, pathname: blob.pathname });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Employee photo upload failed:", error);
    const message = error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
