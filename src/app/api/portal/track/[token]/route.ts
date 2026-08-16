import { NextResponse } from "next/server";
import { getPublicLiveTrack } from "@/lib/visits/live-tracking";

type Params = { params: Promise<{ token: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { token } = await params;
    if (!token || token.length < 8) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const payload = await getPublicLiveTrack(token);
    if (!payload) {
      return NextResponse.json({ error: "Tracking link not found or expired" }, { status: 404 });
    }
    if (payload.expired) {
      return NextResponse.json(
        { error: "This tracking link expired after 2 hours", expired: true, company: payload.company },
        { status: 410 }
      );
    }

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    console.error("Public track error:", error);
    return NextResponse.json({ error: "Failed to load tracking" }, { status: 500 });
  }
}
