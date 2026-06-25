import { NextRequest, NextResponse } from "next/server";
import { forbiddenForFieldRole, badRequestResponse, forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { linkRachioDevice, unlinkRachioDevice } from "@/lib/rachio/property";
import { RachioApiError } from "@/lib/rachio/types";

type Params = { params: Promise<{ id: string; propertyId: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const fieldDenied = forbiddenForFieldRole(user.role); if (fieldDenied) return fieldDenied;

    const { id: customerId, propertyId } = await params;
    const body = await request.json();
    const deviceId = body.deviceId?.trim();

    if (!deviceId) return badRequestResponse("deviceId is required");

    const deviceKind =
      body.deviceKind === "hose_timer" ? ("hose_timer" as const) : ("controller" as const);

    const { controller, device, entity } = await linkRachioDevice(
      user.companyId,
      customerId,
      propertyId,
      deviceId,
      deviceKind
    );

    return NextResponse.json({
      link: {
        id: controller.id,
        externalDeviceId: controller.externalDeviceId,
        status: controller.status,
        metadata: controller.metadata,
      },
      device: device ?? entity,
    });
  } catch (error) {
    if (error instanceof RachioApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return unauthorizedResponse();
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const fieldDenied = forbiddenForFieldRole(user.role); if (fieldDenied) return fieldDenied;

    const { id: customerId, propertyId } = await params;
    await unlinkRachioDevice(user.companyId, customerId, propertyId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof RachioApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return unauthorizedResponse();
  }
}
