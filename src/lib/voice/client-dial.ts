import twilio from "twilio";
import { mixWithWhite, resolveBrandPalette } from "@/lib/brand-palette";
import { prisma } from "@/lib/prisma";

export type VoiceClientBrand = {
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

/** Dial a Twilio Client identity and stamp the called company's brand onto the invite. */
export function dialVoiceClient(dial: Dial, identity: string, brand: VoiceClientBrand) {
  const client = dial.client({}, identity);
  client.parameter({ name: "companyId", value: brand.companyId });
  client.parameter({ name: "companyName", value: brand.companyName });
  client.parameter({ name: "brandPrimary", value: brand.brandPrimary });
  client.parameter({ name: "brandSoft", value: brand.brandSoft });
  return client;
}
