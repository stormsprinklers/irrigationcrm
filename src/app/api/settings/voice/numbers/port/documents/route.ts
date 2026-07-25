import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { isAllowedUtilityBillUpload, uploadUtilityBill } from "@/lib/twilio/porting";

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (user.role !== "ADMIN" && user.role !== "MANAGER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Utility bill file required" }, { status: 400 });
    }

    const name = file.name || "utility-bill.pdf";
    const check = isAllowedUtilityBillUpload({
      filename: name,
      mimeType: file.type || "",
      sizeBytes: file.size,
    });
    if (!check.ok) {
      return NextResponse.json({ error: check.error }, { status: 400 });
    }

    const uploaded = await uploadUtilityBill({
      file,
      filename: name,
      friendlyName: `Utility bill · ${user.companyId.slice(0, 8)}`,
    });

    return NextResponse.json({
      documentSid: uploaded.sid,
      status: uploaded.status,
      friendlyName: uploaded.friendlyName,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    const message =
      error instanceof Error ? error.message : "Document upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
