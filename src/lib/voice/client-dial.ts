import { listOperatedVoiceAccounts } from "@/lib/account/operated-accounts";
import { mobileVoiceClientIdentity, parseVoiceClientIdentity } from "./identity";
import twilio from "twilio";
import { mixWithWhite, resolveBrandPalette } from "@/lib/brand-palette";
import { findCustomerByPhone } from "@/lib/inbox/customer-lookup";
import { prisma } from "@/lib/prisma";

export type VoiceClientBrand = {
  callerName?: string;
  callerPhone?: string;
  companyId: string;
  companyName: string;
  brandPrimary: string;
  brandSoft: string;
};

type Dial = ReturnType<InstanceType<typeof twilio.twiml.VoiceResponse>["dial"]>;

export async function loadVoiceClientBrand(companyId: string): Promise<VoiceClientBrand> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      id: true,
      name: true,
      brandPrimaryColor: true,
      brandSecondaryColor: true,
      brandPalette: true,
    },
  });
  if (!company) {
    return {
      companyId,
      companyName: "Incoming call",
      brandPrimary: "#10B981",
      brandSoft: "#D1FAE5",
    };
  }
  return voiceClientBrandFromCompany(company);
}

export function voiceClientBrandFromCompany(company: {
  id: string;
  name: string;
  brandPrimaryColor?: string | null;
  brandSecondaryColor?: string | null;
  brandPalette?: unknown;
}): VoiceClientBrand {
  const palette = resolveBrandPalette(company);
  return {
    companyId: company.id,
    companyName: company.name,
    brandPrimary: palette.primary,
    brandSoft: palette.soft || mixWithWhite(palette.primary, 0.85),
  };
}

/** Resolve the caller within the called tenant, before sending the VoIP invite. */
export async function withVoiceCaller(brand: VoiceClientBrand, phone?: string): Promise<VoiceClientBrand> {
  if (!phone) return brand;
  const customer = await findCustomerByPhone(brand.companyId, phone).catch(() => null);
  return { ...brand, callerPhone: phone, callerName: customer?.name?.trim() || undefined };
}

/** Dial a Twilio Client identity and stamp the called company's brand onto the invite. */
export async function dialVoiceClient(dial: Dial, identity: string, brand: VoiceClientBrand) {
  const identities = [identity];
  const parsed = parseVoiceClientIdentity(identity);
  if (parsed) {
    const user = await prisma.user.findFirst({
      where: { id: parsed.userId, companyId: parsed.companyId, status: "ACTIVE", systemKind: null },
      select: { id: true, email: true, companyId: true },
    });
    if (user) {
      const accounts = await listOperatedVoiceAccounts({ userId: user.id, email: user.email, companyId: user.companyId });
      identities.push(...accounts.map(account => mobileVoiceClientIdentity(account.companyId, account.userId)));
    }
  }
  return appendVoiceClients(dial, identities, brand);
}

export function appendVoiceClients(dial: Dial, identities: string[], brand: VoiceClientBrand) {
  let firstClient;
  for (const target of [...new Set(identities)]) {
    const client = dial.client({}, target);
    firstClient ??= client;
    if (brand.callerName) client.parameter({ name: "callerName", value: brand.callerName });
    if (brand.callerPhone) client.parameter({ name: "callerPhone", value: brand.callerPhone });
    client.parameter({ name: "companyId", value: brand.companyId });
    client.parameter({ name: "companyName", value: brand.companyName });
    client.parameter({ name: "brandPrimary", value: brand.brandPrimary });
    client.parameter({ name: "brandSoft", value: brand.brandSoft });
  }
  return firstClient!;
}
