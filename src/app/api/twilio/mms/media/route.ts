import { NextRequest, NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { canAccessBlobPath } from "@/lib/blob/urls";
import { getBlobToken } from "@/lib/blob/storage";
import { verifyMediaSignature } from "@/lib/inbox/media-url";

export async function GET(request: NextRequest) {
  const pathname = request.nextUrl.searchParams.get("pathname");
  const expires = Number(request.nextUrl.searchParams.get("expires") ?? "0");
  const sig = request.nextUrl.searchParams.get("sig") ?? "";

  if (!pathname || !expires || !sig) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!verifyMediaSignature(pathname, expires, sig)) {
    return NextResponse.json({ error: "Invalid or expired link" }, { status: 403 });
  }

  const companyMatch = pathname.match(
    /^(?:inbox|customers)\/([^/]+)\//
  );
  if (!companyMatch || !canAccessBlobPath(companyMatch[1], pathname)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const token = getBlobToken();
  if (!token) {
    return NextResponse.json({ error: "Storage not configured" }, { status: 503 });
  }

  const result = await get(pathname, { access: "private", token });
  if (!result || result.statusCode !== 200 || !result.stream) {
    return new NextResponse("Not found", { status: 404 });
  }

  return new NextResponse(result.stream, {
    headers: {
      "Content-Type": result.blob.contentType,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
