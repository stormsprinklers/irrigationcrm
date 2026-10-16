import { hash } from "bcryptjs";
import type { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/api-auth";
import { normalizePhone } from "@/lib/inbox/contacts";
import { listOwnerAssistantCompanies, requireRealAdmin } from "@/lib/owner-assistant/access";
import { parseOwnerAssistantAvailability } from "@/lib/owner-assistant/availability";
import { verifyOwnerAssistantStepUpToken } from "@/lib/owner-assistant/step-up";
import { OWNER_ASSISTANT_VOICES } from "@/lib/owner-assistant/types";
import { prisma } from "@/lib/prisma";

async function context(request: NextRequest) {
  const session = await requireSessionUser(request);
  const owner = await requireRealAdmin(session);
  const token = request.headers.get("x-owner-assistant-mfa")?.trim() || "";
  const verified = await verifyOwnerAssistantStepUpToken(token, { userId: owner.id, companyId: owner.companyId });
  if (!verified.ok) throw new Error("MFA_REQUIRED");
  return { owner, companies: await listOwnerAssistantCompanies(owner) };
}

type ConfigWithPhone = Prisma.OwnerAssistantConfigGetPayload<{ include: { phoneNumber: true } }>;

function serialize(config: ConfigWithPhone | null, companies: Awaited<ReturnType<typeof listOwnerAssistantCompanies>>) {
  return {
    config: config ? {
      id: config.id,
      enabled: config.enabled,
      name: config.name,
      authorizedPhoneE164: config.authorizedPhoneE164,
      hasPin: Boolean(config.pinHash),
      voice: config.voice,
      availability: config.availabilityJson,
      maxCallMinutes: config.maxCallMinutes,
      phoneNumber: config.phoneNumber ? { id: config.phoneNumber.id, e164: config.phoneNumber.e164, friendlyName: config.phoneNumber.friendlyName, smsEnabled: config.phoneNumber.smsEnabled, voiceEnabled: config.phoneNumber.voiceEnabled } : null,
    } : null,
    companies: companies.map(({ companyId, companyName }) => ({ id: companyId, name: companyName })),
  };
}

export async function GET(request: NextRequest) {
  try {
    const { owner, companies } = await context(request);
    const config = await prisma.ownerAssistantConfig.findUnique({ where: { ownerUserId: owner.id }, include: { phoneNumber: true } });
    return NextResponse.json(serialize(config, companies));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    return NextResponse.json({ error: message === "MFA_REQUIRED" ? "Two-factor verification required" : "Admin access required" }, { status: message === "MFA_REQUIRED" ? 401 : 403 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { owner, companies } = await context(request);
    const body = await request.json();
    const name = String(body.name ?? "Storm Assistant").trim().slice(0, 80) || "Storm Assistant";
    const authorizedPhoneE164 = normalizePhone(String(body.authorizedPhoneE164 ?? ""));
    if (!/^\+\d{10,15}$/.test(authorizedPhoneE164)) return NextResponse.json({ error: "Enter a valid authorized phone number" }, { status: 400 });
    const voice = String(body.voice ?? "alloy");
    if (!(OWNER_ASSISTANT_VOICES as readonly string[]).includes(voice)) return NextResponse.json({ error: "Invalid voice" }, { status: 400 });
    const availabilityJson = parseOwnerAssistantAvailability(body.availability);
    const pin = body.pin == null ? "" : String(body.pin).trim();
    if (pin && !/^\d{6,10}$/.test(pin)) return NextResponse.json({ error: "PIN must be 6–10 digits" }, { status: 400 });
    const existing = await prisma.ownerAssistantConfig.findUnique({ where: { ownerUserId: owner.id }, select: { pinHash: true, phoneNumberId: true } });
    const pinHash = pin ? await hash(pin, 12) : existing?.pinHash;
    const enabled = Boolean(body.enabled);
    if (enabled && (!pinHash || !existing?.phoneNumberId || !process.env.OWNER_ASSISTANT_PUBLIC_WSS_URL?.trim() || !process.env.OWNER_ASSISTANT_SECRET?.trim())) {
      return NextResponse.json({ error: "Set a PIN, buy a phone number, and configure the owner-assistant service before enabling it" }, { status: 400 });
    }
    const config = await prisma.ownerAssistantConfig.upsert({
      where: { ownerUserId: owner.id },
      create: { ownerUserId: owner.id, homeCompanyId: owner.companyId, enabled, name, authorizedPhoneE164, pinHash, voice, availabilityJson, maxCallMinutes: Math.min(30, Math.max(5, Number(body.maxCallMinutes) || 12)) },
      update: { enabled, name, authorizedPhoneE164, ...(pin ? { pinHash } : {}), voice, availabilityJson, maxCallMinutes: Math.min(30, Math.max(5, Number(body.maxCallMinutes) || 12)) },
      include: { phoneNumber: true },
    });
    return NextResponse.json(serialize(config, companies));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed";
    return NextResponse.json({ error: message === "MFA_REQUIRED" ? "Two-factor verification required" : message }, { status: message === "MFA_REQUIRED" ? 401 : 500 });
  }
}
