import { NextRequest, NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { IntegrationType } from "@prisma/client";
import { authenticateIntegration, isIntegrationContext } from "@/lib/integrations/auth";
import { getBlobToken } from "@/lib/blob/storage";
import { prisma } from "@/lib/prisma";

type Context = { params: Promise<{ id: string }> };

function pathnameFromBlobUrl(value: string): string {
  const url = new URL(value);
  return decodeURIComponent(url.pathname.replace(/^\//, ""));
}

export async function GET(request: NextRequest, { params }: Context) {
  const auth = await authenticateIntegration(request, IntegrationType.DESIGN);
  if (!isIntegrationContext(auth)) return auth;
  const { id } = await params;
  const property = await prisma.customerProperty.findFirst({ where: { id, companyId: auth.companyId }, select: { aerialImageUrl: true } });
  if (!property?.aerialImageUrl) return NextResponse.json({ error: "No aerial image" }, { status: 404 });
  const token = getBlobToken();
  if (!token) return NextResponse.json({ error: "Blob storage unavailable" }, { status: 503 });
  const result = await get(pathnameFromBlobUrl(property.aerialImageUrl), { access: "private", token });
  if (!result?.stream || result.statusCode !== 200) return NextResponse.json({ error: "Aerial image unavailable" }, { status: 404 });
  return new NextResponse(result.stream, { headers: { "Content-Type": result.blob.contentType, "Cache-Control": "private, max-age=300" } });
}
