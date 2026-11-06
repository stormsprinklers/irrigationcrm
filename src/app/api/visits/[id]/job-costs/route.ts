import { NextRequest, NextResponse } from "next/server";
import { forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { canViewProfitMargins, isFieldRole } from "@/lib/employees";
import { requireFieldVisitAccess } from "@/lib/field/visit-guard";
import {
  loadVisitJobCosts,
  parseVisitContractorCostItems,
  saveVisitJobCostItems,
} from "@/lib/visits/job-costs";

type Params = { params: Promise<{ id: string }> };

function canEditJobCosts(role: string) {
  return role === "ADMIN" || role === "MANAGER" || role === "TECH" || role === "INSTALLER";
}

async function authorizeVisit(user: Awaited<ReturnType<typeof requireSessionUser>>, visitId: string) {
  if (!canEditJobCosts(user.role)) return forbiddenResponse();
  if (isFieldRole(user.role)) {
    const access = await requireFieldVisitAccess(user, visitId);
    if (!access.ok) return access.response;
  }
  return null;
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser(request);
    const { id } = await params;
    const denied = await authorizeVisit(user, id);
    if (denied) return denied;
    const costs = await loadVisitJobCosts(user.companyId, id);
    if (!costs) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const showRates = canViewProfitMargins(user.role);
    return NextResponse.json({
      ...costs,
      labor: costs.labor.map((entry) => showRates ? entry : { ...entry, hourlyRate: null, cost: null }),
      laborCost: showRates ? costs.laborCost : null,
      totalCost: showRates ? costs.totalCost : null,
      showRates,
    });
  } catch {
    return unauthorizedResponse();
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser(request);
    const { id } = await params;
    const denied = await authorizeVisit(user, id);
    if (denied) return denied;
    const body = await request.json();
    const items = parseVisitContractorCostItems({ jobCostItems: body.items });
    const saved = await saveVisitJobCostItems({
      companyId: user.companyId,
      visitId: id,
      userId: user.id,
      items,
    });
    if (!saved) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ items: saved });
  } catch {
    return unauthorizedResponse();
  }
}
