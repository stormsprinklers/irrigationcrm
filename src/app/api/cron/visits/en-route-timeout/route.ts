import { NextResponse } from "next/server";
import { expireEnRouteVisits } from "@/lib/visits/en-route-timeout";
import { authorizeCronRequest } from "@/lib/security/trusted-request";
export async function GET(request: Request) {
  const denied = authorizeCronRequest(request);
  if (denied) return denied;
  return NextResponse.json({expired: await expireEnRouteVisits()});
}
