import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { getLinkedDeviceContext } from "@/lib/rachio/property";
import { RachioApiError } from "@/lib/rachio/types";

type Params = { params: Promise<{ id: string; propertyId: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id: customerId, propertyId } = await params;
    const ctx = await getLinkedDeviceContext(user.companyId, customerId, propertyId);

    if (!ctx.link) {
      return NextResponse.json({ linked: false, link: null, device: null });
    }

    return NextResponse.json({
      linked: true,
      link: {
        id: ctx.link.id,
        externalDeviceId: ctx.link.externalDeviceId,
        status: ctx.link.status,
        metadata: ctx.link.metadata,
        lastSyncedAt: ctx.link.lastSyncedAt?.toISOString() ?? null,
      },
      device: ctx.device,
    });
  } catch (error) {
    if (error instanceof RachioApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return unauthorizedResponse();
  }
}
