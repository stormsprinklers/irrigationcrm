import { NextResponse } from "next/server";
import { processDuePipelineFollowUps } from "@/lib/customers/pipeline-followups";
import { authorizeCronRequest } from "@/lib/security/trusted-request";

export const maxDuration = 60;

export async function GET(request: Request) {
  const denied = authorizeCronRequest(request);
  if (denied) return denied;
  const result = await processDuePipelineFollowUps();
  return NextResponse.json({ ok: true, ...result });
}
