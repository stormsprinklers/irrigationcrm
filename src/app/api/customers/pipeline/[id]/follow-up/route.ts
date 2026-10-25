import { NextRequest, NextResponse } from "next/server";
import { forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { canViewSalesPipeline } from "@/lib/customers/permissions";
import {
  pipelineFollowUpPreview,
  sendPipelineFollowUp,
  skipPipelineFollowUp,
} from "@/lib/customers/pipeline-followups";

const STAGES = new Set(["LEAD", "QUALIFIED"] as const);
const METHODS = new Set(["CALL", "SMS", "EMAIL", "SMS_EMAIL"] as const);

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireSessionUser(request);
    if (!canViewSalesPipeline(user.role)) return forbiddenResponse();
    const { id } = await params;
    const stage = request.nextUrl.searchParams.get("stage") as "LEAD" | "QUALIFIED" | null;
    const requestedSequence = Math.floor(Number(request.nextUrl.searchParams.get("sequence")));
    if (!stage || !STAGES.has(stage)) return NextResponse.json({ error: "Invalid stage" }, { status: 400 });
    return NextResponse.json(await pipelineFollowUpPreview({
      companyId: user.companyId,
      customerId: id,
      stage,
      employeeName: user.name,
      sequence: requestedSequence >= 1 && requestedSequence <= 3 ? requestedSequence : undefined,
    }));
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") return unauthorizedResponse();
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not prepare follow-up" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireSessionUser(request);
    if (!canViewSalesPipeline(user.role)) return forbiddenResponse();
    const { id } = await params;
    const body = await request.json();
    const stage = String(body.stage ?? "") as "LEAD" | "QUALIFIED";
    const method = String(body.method ?? "") as "CALL" | "SMS" | "EMAIL" | "SMS_EMAIL";
    const sequence = Math.floor(Number(body.sequence));
    if (!STAGES.has(stage) || sequence < 1 || sequence > 3) {
      return NextResponse.json({ error: "Invalid follow-up" }, { status: 400 });
    }
    if (body.action === "skip") {
      const result = await skipPipelineFollowUp({
        companyId: user.companyId,
        customerId: id,
        stage,
        sequence,
        employeeId: user.id,
      });
      return NextResponse.json({ ok: true, followUp: result });
    }
    if (!METHODS.has(method)) {
      return NextResponse.json({ error: "Invalid follow-up" }, { status: 400 });
    }
    const result = await sendPipelineFollowUp({
      companyId: user.companyId,
      customerId: id,
      stage,
      sequence,
      method,
      automated: false,
      employeeId: user.id,
      employeeName: user.name,
      smsBody: typeof body.smsBody === "string" ? body.smsBody : undefined,
      emailSubject: typeof body.emailSubject === "string" ? body.emailSubject : undefined,
      emailBody: typeof body.emailBody === "string" ? body.emailBody : undefined,
    });
    return NextResponse.json({ ok: true, followUp: result });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") return unauthorizedResponse();
    console.error("Manual pipeline follow-up failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not send follow-up" }, { status: 500 });
  }
}
