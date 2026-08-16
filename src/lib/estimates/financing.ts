import { sendSms } from "@/lib/inbox/twilio";
import { twilioSmsStatusCallbackUrl } from "@/lib/app-url";
import { prisma } from "@/lib/prisma";

export function normalizeFinancingUrl(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;
  const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withProto);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function financingSmsBody(companyName: string, financingUrl: string) {
  return `Thanks for choosing ${companyName}! If you're interested in financing your project, you can explore options without affecting your credit score with this link: ${financingUrl}`;
}

export async function sendEstimateFinancingSms(params: {
  companyId: string;
  estimateId: string;
}): Promise<
  | { ok: true; smsSent: boolean; financingUrl: string }
  | { ok: false; error: string; status: number; financingUrl?: string }
> {
  const estimate = await prisma.estimate.findFirst({
    where: { id: params.estimateId, companyId: params.companyId },
    include: {
      customer: { select: { phone: true } },
      company: { select: { name: true, estimateFinancingUrl: true, twilioPhone: true } },
    },
  });
  if (!estimate) {
    return { ok: false, error: "Estimate not found", status: 404 };
  }

  const financingUrl = normalizeFinancingUrl(estimate.company.estimateFinancingUrl);
  if (!financingUrl) {
    return { ok: false, error: "Financing link is not configured in estimate settings", status: 400 };
  }

  const phone = estimate.customer.phone?.trim();
  if (!phone) {
    return {
      ok: false,
      error: "Customer has no phone number",
      status: 400,
      financingUrl,
    };
  }
  if (!estimate.company.twilioPhone || !process.env.TWILIO_ACCOUNT_SID) {
    return {
      ok: false,
      error: "SMS is not configured",
      status: 503,
      financingUrl,
    };
  }

  try {
    await sendSms({
      companyId: params.companyId,
      from: estimate.company.twilioPhone,
      to: phone,
      body: financingSmsBody(estimate.company.name, financingUrl),
      statusCallback: twilioSmsStatusCallbackUrl(),
    });
  } catch (err) {
    console.error("[financing-sms]", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to send financing text",
      status: 503,
      financingUrl,
    };
  }

  return { ok: true, smsSent: true, financingUrl };
}
