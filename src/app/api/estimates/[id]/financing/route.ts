import { NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { sendEstimateFinancingSms } from "@/lib/estimates/financing";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;
    const result = await sendEstimateFinancingSms({
      companyId: user.companyId,
      estimateId: id,
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, financingUrl: result.financingUrl ?? null },
        { status: result.status }
      );
    }
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Estimate financing SMS error:", error);
    return NextResponse.json({ error: "Failed to send financing text" }, { status: 500 });
  }
}
