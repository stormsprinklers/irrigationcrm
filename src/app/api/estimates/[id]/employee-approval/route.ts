import { NextRequest, NextResponse } from "next/server";
import { EstimateStatus, Prisma } from "@prisma/client";
import { badRequestResponse, requireSessionUser, unauthorizedResponse, forbiddenResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { getEstimateForCompany } from "@/lib/estimates/queries";
import { onEstimateClosed } from "@/lib/notifications/estimate-followup";

type Params = { params: Promise<{ id: string }> };
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser(request);
    if (!["ADMIN", "MANAGER", "CSR", "TECH", "INSTALLER", "SALES", "SOCIAL_MEDIA_MANAGER"].includes(user.role)) return forbiddenResponse();
    const body = await request.json();
    if (body.confirmEmployeeApproval !== true) return badRequestResponse("Confirm employee approval without a customer signature");
    const { id } = await params;
    const estimate = await prisma.estimate.findFirst({ where: { id, companyId: user.companyId }, include: { options: true, lineItems: true } });
    if (!estimate) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (estimate.status === "APPROVED" || estimate.status === "CONVERTED" || estimate.signatureBlobUrl || estimate.signedAt) return badRequestResponse("This estimate already has an approval or signature");
    const optionId = typeof body.selectedOptionId === "string" ? body.selectedOptionId : estimate.selectedOptionId ?? (estimate.options.length === 1 ? estimate.options[0]!.id : null);
    if ((estimate.options.length && !optionId) || (optionId && !estimate.options.some((option) => option.id === optionId))) return badRequestResponse("Select an option belonging to this estimate");
    const lines = estimate.lineItems.filter((line) => line.optionId === optionId || (!estimate.options.length && line.optionId == null));
    if (!lines.length) return badRequestResponse("Add a line item before approving");
    const option = estimate.options.find((item) => item.id === optionId);
    const approvedAt = new Date();
    const employeeApproval = { method: "EMPLOYEE", employeeId: user.id, employeeName: user.name, approvedAt: approvedAt.toISOString(), selectedOptionId: optionId };
    const metadata = estimate.designExportMetadata && typeof estimate.designExportMetadata === "object" && !Array.isArray(estimate.designExportMetadata) ? estimate.designExportMetadata : {};
    await prisma.$transaction(async (tx) => {
      await tx.estimate.update({ where: { id, companyId: user.companyId, updatedAt: estimate.updatedAt }, data: {
        status: EstimateStatus.APPROVED, approvedAt, selectedOptionId: optionId,
        ...(option ? { subtotal: option.subtotal, discountTotal: option.discountTotal, total: option.total } : {}),
        designExportMetadata: { ...metadata, employeeApproval } as Prisma.InputJsonValue,
      } });
      if (optionId) await tx.estimateOption.updateMany({ where: { id: optionId, estimateId: id }, data: { declinedAt: null } });
      await tx.staffAuditLog.create({ data: { companyId: user.companyId, actorId: user.id, entityType: "Estimate", entityId: id, action: "EMPLOYEE_APPROVAL", customerId: estimate.customerId, visitId: estimate.visitId, before: { status: estimate.status }, after: employeeApproval } });
      await tx.estimateNote.create({ data: { estimateId: id, authorId: user.id, body: `Approved by employee ${user.name} without a customer signature.` } });
    });
    const { advanceCustomerPipeline } = await import("@/lib/customers/pipeline");
    await advanceCustomerPipeline({
      companyId: user.companyId,
      customerId: estimate.customerId,
      stage: "CONVERTED",
      occurredAt: approvedAt,
    }).catch((error) => console.error("Estimate pipeline conversion failed", error));
    await onEstimateClosed(id).catch(() => {});
    return NextResponse.json(await getEstimateForCompany(user.companyId, id));
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") return unauthorizedResponse();
    if (error && typeof error === "object" && "code" in error && error.code === "P2025") return NextResponse.json({ error: "Estimate changed. Reload before approving." }, { status: 409 });
    return badRequestResponse("Could not record employee approval");
  }
}
