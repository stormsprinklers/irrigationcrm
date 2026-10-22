import { NextResponse } from "next/server";
import { processPipelineConversionDeliveries } from "@/lib/marketing/pipeline-conversion-delivery";
import { authorizeCronRequest } from "@/lib/security/trusted-request";

export const maxDuration = 60;

export async function GET(request: Request) {
  const denied = authorizeCronRequest(request);
  if (denied) return denied;

  const result = await processPipelineConversionDeliveries(75);
  return NextResponse.json({ ok: true, ...result });
}
