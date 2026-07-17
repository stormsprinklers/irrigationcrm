import { NextResponse } from "next/server";
import { getVapidPublicKey, isWebPushConfigured } from "@/lib/web-push/config";

export async function GET() {
  if (!isWebPushConfigured()) {
    return NextResponse.json(
      { configured: false, publicKey: null as string | null },
      { status: 200 }
    );
  }
  return NextResponse.json({
    configured: true,
    publicKey: getVapidPublicKey(),
  });
}
