import { CallObjectionCategory } from "@prisma/client";
import { getOpenAIApiKey } from "@/lib/openai/client";
import { prisma } from "@/lib/prisma";

/** Skip OpenAI summarization below this length to save tokens on short/failed connects. */
export const MIN_TRANSCRIPT_WORDS_FOR_SUMMARY = 30;

export const CALL_OBJECTION_LABELS: Record<CallObjectionCategory, string> = {
  NA: "N/A (booked)",
  PRICE_SHOPPING: "Price shopping",
  PRICE_FEE: "Price / fee",
  AVAILABILITY_URGENCY: "Availability / urgency",
  SCHEDULING_CONFLICT: "Scheduling conflict",
  OTHER: "Other",
};

export type CallSummaryResult = {
  summary: string;
  booked: boolean;
  objectionCategory: CallObjectionCategory;
  objectionReason: string | null;
};

const SUMMARY_SYSTEM_PROMPT = `You summarize phone calls for Storm Sprinklers, an irrigation / sprinkler field-service company.

Return ONLY valid JSON with this shape:
{
  "booked": boolean,
  "summary": string,
  "objectionCategory": "na" | "price_shopping" | "price_fee" | "availability_urgency" | "scheduling_conflict" | "other",
  "objectionReason": string | null
}

Rules for "booked":
- true if the caller clearly scheduled an appointment, confirmed a time, or the CSR successfully booked them.
- false if they did not book, deferred, hung up, said they would call back, shop around, talk to a spouse, or otherwise left without a confirmed appointment.

Rules for "summary":
- One concise paragraph (3–6 sentences). Past tense, third person. No bullets or headings.
- Include what was discussed, outcome, and any timing mentioned.
- If reschedule/cancellation, say so and why.
- If a complaint, say what it was about.
- If they did NOT book: the paragraph MUST include (1) why you think they did not book, treating soft objections the same as hard objections, and (2) where value was not built that could have been (e.g. CSR quoted a trip/service fee without explaining what the visit includes, did not offer a window that fits, did not ask about the problem, did not create urgency).
- Soft objections count. Examples that are ALL objections (usually price/fee): "okay, I'm going to call other companies", "I'll discuss with my spouse", "I can't believe you charge $40 just to give me a quote", "it costs money just to get a quote?", "that is way more than another company quoted me".
- Do not invent details that are not in the transcript. If the transcript is sparse, say what little can be gathered.

Rules for "objectionCategory" (primary reason they did not book — pick the best single category):
- "na" if booked is true. objectionReason must be null.
- "price_shopping" — calling around to compare prices, wants an immediate price over the phone and is frustrated they cannot get one, will get other quotes first.
- "price_fee" — objects to trip fee, service fee, diagnostic fee, or the quoted price ("it costs money just to get a quote?", "that's way more than another company"). Spouse/call-around after hearing a fee usually belongs here, not "other".
- "availability_urgency" — needs someone sooner / today / emergency and we could not meet that timing.
- "scheduling_conflict" — cannot be home at offered times (work, etc.) and wanted a time they could be home.
- "other" — did not book for a reason that is none of the above (including unclear).
- If several apply, pick the one that most clearly stopped the booking.

"objectionReason": one or two sentences naming the objection and any missed value-building. Null when booked is true.`;

export function countTranscriptWords(transcript: string): number {
  return transcript
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function parseObjectionCategory(raw: unknown, booked: boolean): CallObjectionCategory {
  if (booked) return CallObjectionCategory.NA;
  const key = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  switch (key) {
    case "na":
    case "n/a":
    case "none":
      return CallObjectionCategory.OTHER;
    case "price_shopping":
    case "priceshopping":
      return CallObjectionCategory.PRICE_SHOPPING;
    case "price_fee":
    case "price":
    case "fee":
    case "service_fee":
      return CallObjectionCategory.PRICE_FEE;
    case "availability_urgency":
    case "availability":
    case "urgency":
      return CallObjectionCategory.AVAILABILITY_URGENCY;
    case "scheduling_conflict":
    case "scheduling":
      return CallObjectionCategory.SCHEDULING_CONFLICT;
    default:
      return CallObjectionCategory.OTHER;
  }
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        const parsed = JSON.parse(trimmed.slice(start, end + 1)) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      } catch {
        return null;
      }
    }
  }
  return null;
}

export async function generateCallSummaryFromTranscript(
  transcript: string
): Promise<CallSummaryResult> {
  const apiKey = getOpenAIApiKey();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const trimmed = transcript.trim();
  if (!trimmed) {
    throw new Error("Transcript is empty");
  }
  if (countTranscriptWords(trimmed) < MIN_TRANSCRIPT_WORDS_FOR_SUMMARY) {
    throw new Error("Transcript too short to summarize");
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SUMMARY_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Summarize this call transcript as JSON:\n\n${trimmed.slice(0, 12000)}`,
        },
      ],
      max_tokens: 500,
      temperature: 0.2,
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(err || `OpenAI summary failed (${res.status})`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = data.choices?.[0]?.message?.content?.trim() ?? "";
  const parsed = extractJsonObject(raw);
  if (!parsed) {
    throw new Error("OpenAI returned an empty summary");
  }

  const booked = Boolean(parsed.booked);
  const summary =
    typeof parsed.summary === "string" ? parsed.summary.trim() : "";
  if (!summary) {
    throw new Error("OpenAI returned an empty summary");
  }

  const objectionCategory = parseObjectionCategory(parsed.objectionCategory, booked);
  const objectionReason = booked
    ? null
    : typeof parsed.objectionReason === "string" && parsed.objectionReason.trim()
      ? parsed.objectionReason.trim()
      : null;

  return { summary, booked, objectionCategory, objectionReason };
}

/** Generate (or refresh) AI summary for a CallLog that already has a transcript. */
export async function summarizeCallLog(
  callLogId: string,
  options?: { force?: boolean }
): Promise<{
  ok: boolean;
  summary?: string;
  objectionCategory?: CallObjectionCategory | null;
  objectionReason?: string | null;
  skipped?: string;
}> {
  const call = await prisma.callLog.findUnique({
    where: { id: callLogId },
    select: { id: true, transcript: true, aiSummary: true, objectionCategory: true, objectionReason: true },
  });

  if (!call) return { ok: false, skipped: "Call not found" };
  if (!call.transcript?.trim()) {
    return { ok: false, skipped: "No transcript" };
  }
  if (countTranscriptWords(call.transcript) < MIN_TRANSCRIPT_WORDS_FOR_SUMMARY) {
    return { ok: true, skipped: "Transcript under 30 words" };
  }
  if (call.aiSummary?.trim() && !options?.force) {
    return {
      ok: true,
      summary: call.aiSummary,
      objectionCategory: call.objectionCategory,
      objectionReason: call.objectionReason,
      skipped: "Already summarized",
    };
  }

  const result = await generateCallSummaryFromTranscript(call.transcript);
  await prisma.callLog.update({
    where: { id: call.id },
    data: {
      aiSummary: result.summary,
      objectionCategory: result.objectionCategory,
      objectionReason: result.objectionReason,
    },
  });

  return {
    ok: true,
    summary: result.summary,
    objectionCategory: result.objectionCategory,
    objectionReason: result.objectionReason,
  };
}

/** After a transcript is written, generate summary in the background (best-effort). */
export async function summarizeCallLogsForTranscriptUpdate(callLogIds: string[]): Promise<void> {
  for (const id of callLogIds) {
    try {
      await summarizeCallLog(id);
    } catch (err) {
      console.error("Call summary failed for", id, err);
    }
  }
}
