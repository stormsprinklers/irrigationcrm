import { NextRequest, NextResponse } from "next/server";
import { badRequestResponse, forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { canManageEmployees } from "@/lib/employees";
import { prisma } from "@/lib/prisma";
import { findZipConflict, parseZipInput } from "@/lib/service-areas";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await params;

    const area = await prisma.serviceArea.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!area) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const zips = await prisma.serviceAreaZip.findMany({
      where: { serviceAreaId: id },
      orderBy: { zipCode: "asc" },
    });

    return NextResponse.json(zips);
  } catch {
    return unauthorizedResponse();
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (!canManageEmployees(user.role)) return forbiddenResponse();

    const { id } = await params;
    const area = await prisma.serviceArea.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!area) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await request.json();
    const zipCodes = parseZipInput(String(body.zips ?? body.zipCode ?? ""));
    if (zipCodes.length === 0) return badRequestResponse("No valid zip codes provided");

    const added: string[] = [];
    const skipped: { zip: string; reason: string }[] = [];

    for (const zipCode of zipCodes) {
      const duplicate = await findZipConflict(user.companyId, zipCode);
      if (duplicate) {
        skipped.push({
          zip: zipCode,
          reason: duplicate.serviceAreaId === id ? "Already in this area" : `Assigned to ${duplicate.serviceArea.name}`,
        });
        continue;
      }

      await prisma.serviceAreaZip.create({ data: { serviceAreaId: id, zipCode } });
      added.push(zipCode);
    }

    return NextResponse.json({ added, skipped });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    return NextResponse.json({ error: "Failed to add zip codes" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const user = await requireSessionUser();
    if (!canManageEmployees(user.role)) return forbiddenResponse();

    const { id } = await params;
    const area = await prisma.serviceArea.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!area) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { searchParams } = new URL(request.url);
    const zipCode = searchParams.get("zipCode");
    if (!zipCode) return badRequestResponse("zipCode query param required");

    await prisma.serviceAreaZip.deleteMany({
      where: { serviceAreaId: id, zipCode },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    return NextResponse.json({ error: "Failed to remove zip code" }, { status: 500 });
  }
}
