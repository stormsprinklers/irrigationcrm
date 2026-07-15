import { getOpenAIApiKey } from "@/lib/openai/client";
import { prisma } from "@/lib/prisma";

const SUMMARY_SYSTEM_PROMPT = `You write one-paragraph summaries of phone calls for an irrigation / sprinkler field-service company (Storm Sprinklers).

Rules:
- Output exactly one concise paragraph (3–6 sentences). No bullets, headings, or labels.
- Capture the most important facts: what was discussed, outcome, and any timing the customer expects (appointment date/time window, callback, when someone is coming out).
- If the call was a reschedule or cancellation, clearly state that and why the customer chose to do so.
- If the call was a complaint, explain what the complaint was about.
- If the caller wanted to book an appointment but did not book, list the primary objections or reasons they did not book.
- Do not invent details that are not in the transcript. If the transcript is sparse, say what little can be gathered.
- Write in past tense, third person (e.g. "The customer asked…").`;

export async function generateCallSummaryFromTranscript(transcript: string): Promise<string> {
  const apiKey = getOpenAIApiKey();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const trimmed = transcript.trim();
  if (!trimmed) {
    throw new Error("Transcript is empty");
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SUMMARY_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Summarize this call transcript:\n\n${trimmed.slice(0, 12000)}`,
        },
      ],
      max_tokens: 350,
      temperature: 0.3,
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(err || `OpenAI summary failed (${res.status})`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const summary = data.choices?.[0]?.message?.content?.trim() ?? "";
  if (!summary) {
    throw new Error("OpenAI returned an empty summary");
  }
  return summary;
}

/** Generate (or refresh) AI summary for a CallLog that already has a transcript. */
export async function summarizeCallLog(
  callLogId: string,
  options?: { force?: boolean }
): Promise<{ ok: boolean; summary?: string; skipped?: string }> {
  const call = await prisma.callLog.findUnique({
    where: { id: callLogId },
    select: { id: true, transcript: true, aiSummary: true },
  });

  if (!call) return { ok: false, skipped: "Call not found" };
  if (!call.transcript?.trim()) {
    return { ok: false, skipped: "No transcript" };
  }
  if (call.aiSummary?.trim() && !options?.force) {
    return { ok: true, summary: call.aiSummary, skipped: "Already summarized" };
  }

  const summary = await generateCallSummaryFromTranscript(call.transcript);
  await prisma.callLog.update({
    where: { id: call.id },
    data: { aiSummary: summary },
  });

  return { ok: true, summary };
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
