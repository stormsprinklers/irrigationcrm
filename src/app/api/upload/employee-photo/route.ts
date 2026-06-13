import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { badRequestResponse, forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { canManageEmployees } from "@/lib/employees";

const MAX_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

function getBlobToken() {
  return process.env.BLOB_READ_WRITE_TOKEN;
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (!canManageEmployees(user.role)) return forbiddenResponse();

    const token = getBlobToken();
    if (!token) {
      return NextResponse.json(
        {
          error:
            "Blob storage is not configured. In Vercel: Storage → Blob → Connect to this project (or add BLOB_READ_WRITE_TOKEN under Settings → Environment Variables), then redeploy.",
        },
        { status: 503 }
      );
    }

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
    const blob = await put(
      `employees/${user.companyId}/${Date.now()}-${safeName}`,
      file,
      {
        access: "public",
        token,
      }
    );

    return NextResponse.json({ url: blob.url });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Employee photo upload failed:", error);
    const message = error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
