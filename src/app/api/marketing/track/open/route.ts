import { NextRequest, NextResponse } from "next/server";
import { trackCampaignEngagement } from "@/lib/marketing/engagement";

/** 1×1 transparent GIF */
const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

export async function GET(request: NextRequest) {
  const recipientId = request.nextUrl.searchParams.get("r");
  if (recipientId) {
    try {
      await trackCampaignEngagement({ recipientId, kind: "opened" });
    } catch (err) {
      console.error("Campaign open tracking failed", err);
    }
  }

  return new NextResponse(PIXEL, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Content-Length": String(PIXEL.length),
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}
