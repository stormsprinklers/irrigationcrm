import { getOpenAIApiKey } from "@/lib/openai/client";
import type { WebsiteLeadInput } from "@/lib/integrations/schemas";

const ISSUE_LABELS: Record<string, string> = {
  "not-turning-on": "Sprinklers not turning on",
  "not-turning-off": "Sprinklers won't turn off",
  leak: "Leak or wet spots",
  "broken-heads": "Broken sprinkler heads",
  "broken-backflow": "Broken backflow device",
  "main-shutoff": "Main shutoff valve",
  "moving-adding-heads": "Moving or adding sprinkler heads",
  "coverage-issues": "Coverage / dry spots",
};

type QuoteSnapshot = {
  id?: string;
  title?: string | null;
  description?: string | null;
  price?: number | string | null;
  price_range?: { min?: number | string; max?: number | string } | null;
  priceRange?: { min?: number | string; max?: number | string } | null;
  min?: number | string;
  max?: number | string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function asMoneyNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function money(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

export function isPricingQuoteLead(source: string | null | undefined) {
  const key = (source ?? "").trim().toLowerCase();
  return key === "pricing-quote" || key === "unbooked-estimate";
}

export function formatQuoteEstimate(quote: unknown): string | null {
  const q = asRecord(quote) as QuoteSnapshot | null;
  if (!q) return null;

  const range = q.price_range ?? q.priceRange ?? null;
  const min = asMoneyNumber(range?.min ?? q.min);
  const max = asMoneyNumber(range?.max ?? q.max);
  if (min != null && max != null) {
    if (min === max) return money(min);
    return `${money(min)}–${money(max)}`;
  }
  const price = asMoneyNumber(q.price);
  if (price != null) return money(price);
  return null;
}

function extractPricingContext(metadata: unknown) {
  const meta = asRecord(metadata) ?? {};
  const pricingInputs =
    asRecord(meta.pricingInputs) ?? asRecord(meta.pricing_inputs) ?? {};
  const quote =
    meta.quote ??
    meta.pricing_quote_snapshot ??
    meta.pricingQuoteSnapshot ??
    null;
  const serviceCategory =
    (typeof meta.serviceCategory === "string" && meta.serviceCategory) ||
    (typeof meta.service_category === "string" && meta.service_category) ||
    (typeof pricingInputs.serviceCategory === "string" && pricingInputs.serviceCategory) ||
    null;
  const serviceTitle =
    (typeof meta.serviceTitle === "string" && meta.serviceTitle) ||
    (typeof meta.service_title === "string" && meta.service_title) ||
    null;

  return { meta, pricingInputs, quote, serviceCategory, serviceTitle };
}

function deterministicIssueBullets(pricingInputs: Record<string, unknown>): string[] {
  const bullets: string[] = [];
  const category = String(pricingInputs.serviceCategory ?? "");

  if (category === "repair") {
    const issueTypes = Array.isArray(pricingInputs.issueTypes)
      ? pricingInputs.issueTypes.map(String)
      : pricingInputs.issueType
        ? [String(pricingInputs.issueType)]
        : [];
    const followUps = asRecord(pricingInputs.repairFollowUps) ?? {};
    for (const id of issueTypes) {
      const base = ISSUE_LABELS[id] ?? id.replace(/-/g, " ");
      const follow = followUps[id];
      bullets.push(follow ? `${base} (${String(follow).replace(/-/g, " ")})` : base);
    }
    if (issueTypes.includes("moving-adding-heads") && pricingInputs.headCount) {
      bullets.push(`Head count: ${String(pricingInputs.headCount)}`);
    }
  } else if (category === "seasonal") {
    const st = String(pricingInputs.seasonalServiceType ?? "");
    const labels: Record<string, string> = {
      tuneup: "Summer Tune-Up",
      winterization: "Winterization",
      both: "Maintenance plan (tune-up + winterization)",
    };
    bullets.push(labels[st] ?? "Seasonal service");
    if (pricingInputs.zoneCount) bullets.push(`Zones: ${String(pricingInputs.zoneCount)}`);
  } else if (category === "installation") {
    bullets.push("New sprinkler system installation");
    if (pricingInputs.turfSqFt) bullets.push(`Turf: ${String(pricingInputs.turfSqFt)} sq ft`);
    if (pricingInputs.waterType) bullets.push(`Water: ${String(pricingInputs.waterType)}`);
  }

  return bullets;
}

function fallbackIssueSummary(
  pricingInputs: Record<string, unknown>,
  serviceTitle: string | null,
  estimate: string | null
): string {
  const bullets = deterministicIssueBullets(pricingInputs);
  if (bullets.length) {
    return `Customer selected: ${bullets.join("; ")}.${
      estimate ? ` They saw an online estimate of ${estimate}.` : ""
    }`;
  }
  if (serviceTitle) {
    return `Customer looked at ${serviceTitle}.${
      estimate ? ` Online estimate shown: ${estimate}.` : ""
    }`;
  }
  return estimate
    ? `Customer received an online estimate of ${estimate} but did not book.`
    : "Customer completed the pricing wizard but did not book an appointment.";
}

async function generateAiIssueSummary(params: {
  pricingInputs: Record<string, unknown>;
  quote: unknown;
  serviceCategory: string | null;
  serviceTitle: string | null;
  estimate: string | null;
  notes: string | null;
}): Promise<string | null> {
  const apiKey = getOpenAIApiKey();
  if (!apiKey) return null;

  const quote = asRecord(params.quote);
  const userPayload = {
    serviceCategory: params.serviceCategory,
    serviceTitle: params.serviceTitle,
    estimateShown: params.estimate,
    quoteTitle: quote?.title ?? null,
    quoteDescription: quote?.description ?? null,
    pricingSelections: params.pricingInputs,
    notes: params.notes,
  };

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.2,
        max_tokens: 220,
        messages: [
          {
            role: "system",
            content: [
              "You write brief outreach briefs for Storm Sprinklers CSRs.",
              "Given pricing-wizard answers, summarize the customer's likely lawn/sprinkler issues in 2–4 short sentences.",
              "Be specific and practical: what problem to ask about on the call, what service they were priced for.",
              "Do not invent issues that aren't supported by the data.",
              "Do not mention AI. No bullets. Plain prose only.",
            ].join(" "),
          },
          {
            role: "user",
            content: `Summarize what to reach out about:\n${JSON.stringify(userPayload)}`,
          },
        ],
      }),
    });
    if (!res.ok) {
      console.error("pricing quote AI summary failed:", await res.text().catch(() => ""));
      return null;
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch (err) {
    console.error("pricing quote AI summary error:", err);
    return null;
  }
}

export type PricingQuoteEnrichment = {
  estimateLabel: string | null;
  quoteTitle: string | null;
  issueSummary: string;
  issueBullets: string[];
  inboxBlock: string;
  notificationBody: string;
  metadataPatch: Record<string, unknown>;
};

/**
 * Build estimate + AI issue summary for unbooked pricing-quote leads.
 */
export async function enrichPricingQuoteLead(
  input: WebsiteLeadInput
): Promise<PricingQuoteEnrichment | null> {
  if (!isPricingQuoteLead(input.source)) return null;

  const { pricingInputs, quote, serviceCategory, serviceTitle } = extractPricingContext(
    input.metadata
  );
  const estimateLabel = formatQuoteEstimate(quote);
  const q = asRecord(quote);
  const quoteTitle =
    (typeof q?.title === "string" && q.title.trim()) ||
    serviceTitle ||
    input.notes ||
    null;
  const issueBullets = deterministicIssueBullets(pricingInputs);

  const aiSummary = await generateAiIssueSummary({
    pricingInputs,
    quote,
    serviceCategory,
    serviceTitle: quoteTitle,
    estimate: estimateLabel,
    notes: input.notes ?? null,
  });
  const issueSummary =
    aiSummary ??
    fallbackIssueSummary(pricingInputs, quoteTitle, estimateLabel);

  const lines = [
    "— Online estimate —",
    estimateLabel
      ? `Estimate shown: ${estimateLabel}${quoteTitle ? ` (${quoteTitle})` : ""}`
      : quoteTitle
        ? `Quoted option: ${quoteTitle}`
        : "Estimate: not available",
    "",
    "— What they're dealing with —",
    issueSummary,
  ];
  if (issueBullets.length) {
    lines.push("", "Selections:", ...issueBullets.map((b) => `• ${b}`));
  }

  const notificationBody = [
    estimateLabel ?? quoteTitle ?? "Unbooked estimate",
    issueSummary.split(/(?<=[.!?])\s+/)[0] ?? issueSummary,
  ]
    .filter(Boolean)
    .join(" · ")
    .slice(0, 180);

  return {
    estimateLabel,
    quoteTitle,
    issueSummary,
    issueBullets,
    inboxBlock: lines.join("\n"),
    notificationBody,
    metadataPatch: {
      aiIssueSummary: issueSummary,
      formattedEstimate: estimateLabel,
      quoteTitle,
    },
  };
}
