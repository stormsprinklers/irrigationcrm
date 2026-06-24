import { NextRequest, NextResponse } from "next/server";
import { recordTrackedLinkClick } from "@/lib/notifications/tracked-links";

type Params = { params: Promise<{ token: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const { token } = await params;
  const destination = await recordTrackedLinkClick(token);
  if (!destination) {
    return NextResponse.redirect(new URL("/", process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"));
  }
  return NextResponse.redirect(destination);
}
