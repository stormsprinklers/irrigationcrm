import { NextRequest, NextResponse } from "next/server";
import { badRequestResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import {
  createEstimateOption,
  deleteEstimateOption,
  ensureEstimateOptions,
} from "@/lib/estimates/options";
import { getEstimateForCompany, recalculateEstimateTotals } from "@/lib/estimates/queries";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    const estimate = await prisma.estimate.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!estimate) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await ensureEstimateOptions(id);
    const full = await getEstimateForCompany(user.companyId, id);
    return NextResponse.json({ options: full?.options ?? [] });
  } catch {
    return unauthorizedResponse();
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    const estimate = await prisma.estimate.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!estimate) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await request.json().catch(() => ({}));
    const mode = body.mode === "duplicate" ? "duplicate" : "fresh";
    const duplicateFromOptionId =
      mode === "duplicate"
        ? (body.duplicateFromOptionId as string | undefined) ??
          estimate.selectedOptionId ??
          undefined
        : undefined;

    if (mode === "duplicate" && !duplicateFromOptionId) {
      return badRequestResponse("duplicateFromOptionId is required when mode is duplicate");
    }

    await createEstimateOption({
      estimateId: id,
      duplicateFromOptionId: duplicateFromOptionId ?? null,
      label: typeof body.label === "string" ? body.label : null,
    });

    await recalculateEstimateTotals(id);
    const full = await getEstimateForCompany(user.companyId, id);
    return NextResponse.json(full, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create option";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    const estimate = await prisma.estimate.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!estimate) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await request.json();
    const optionId = body.optionId as string | undefined;
    if (!optionId) return badRequestResponse("optionId is required");

    const option = await prisma.estimateOption.findFirst({
      where: { id: optionId, estimateId: id },
    });
    if (!option) return NextResponse.json({ error: "Option not found" }, { status: 404 });

    if (body.label !== undefined) {
      await prisma.estimateOption.update({
        where: { id: optionId },
        data: { label: String(body.label).trim() || option.label },
      });
    }

    if (body.select === true) {
      await prisma.estimate.update({
        where: { id },
        data: { selectedOptionId: optionId },
      });
      await recalculateEstimateTotals(id);
    }

    const full = await getEstimateForCompany(user.companyId, id);
    return NextResponse.json(full);
  } catch {
    return unauthorizedResponse();
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    const estimate = await prisma.estimate.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!estimate) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const optionId = request.nextUrl.searchParams.get("optionId");
    if (!optionId) return badRequestResponse("optionId is required");

    try {
      await deleteEstimateOption(id, optionId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete option";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    await recalculateEstimateTotals(id);
    const full = await getEstimateForCompany(user.companyId, id);
    return NextResponse.json(full);
  } catch {
    return unauthorizedResponse();
  }
}
