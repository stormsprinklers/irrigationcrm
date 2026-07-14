import { requireOpenAIApiKey } from "@/lib/openai/client";

export type ApplicantAnswers = {
  hardWorkMeaning: string;
  integrityMeaning: string;
  inconvenientServiceExample: string;
  personalGoals: string;
};

export type ApplicantScoreBreakdown = {
  hardWork: number;
  service: number;
  integrity: number;
  goals: number;
  total: number;
};

const SYSTEM_PROMPT = `You are an evaluation engine.
Score job applicant responses using strict rule-based criteria only.
Do not infer personality, tone, intent, or values.
Do not reward eloquence, grammar, or style.

There are four sections.
Each section scores 0–3 points.

Scoring Rules (apply independently per section)

+1 point if the response is more than 25 words.

The remaining +2 points are awarded as follows:

Hard Work (0–3)
+1 if the response shows consistency or reliability
+1 if the response shows sustained effort under discomfort

Service (0–3)
+1 if the response describes a specific real person
+1 if the service was not work-related (voluntary, personal)

Integrity (0–3)
+1 if integrity is tied to relationships or trust with others
+1 if integrity is tied to an internal moral compass (doing right without supervision)

Goals (0–3)
+1 if the response includes a real, defined goal (not vague or generic)
+1 if the goal requires real effort or sacrifice, not a natural or passive outcome

Return ONLY compact JSON with integer fields (no markdown):
{"hardWork":0,"service":0,"integrity":0,"goals":0}`;

function clampSection(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(3, Math.round(n)));
}

export function normalizeScoreBreakdown(
  input: Partial<ApplicantScoreBreakdown> | null | undefined
): ApplicantScoreBreakdown | null {
  if (!input) return null;
  const hardWork = clampSection(input.hardWork);
  const service = clampSection(input.service);
  const integrity = clampSection(input.integrity);
  const goals = clampSection(input.goals);
  const total =
    input.total != null && Number.isFinite(Number(input.total))
      ? Math.max(0, Math.min(12, Math.round(Number(input.total))))
      : hardWork + service + integrity + goals;
  return { hardWork, service, integrity, goals, total };
}

export function scoreBreakdownFromMetadata(
  metadata: unknown
): ApplicantScoreBreakdown | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const raw = (metadata as Record<string, unknown>).aiScoreBreakdown;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return normalizeScoreBreakdown(raw as Partial<ApplicantScoreBreakdown>);
}

export async function scoreApplicantAnswers(
  answers: ApplicantAnswers
): Promise<ApplicantScoreBreakdown | null> {
  try {
    const apiKey = requireOpenAIApiKey();
    const userPrompt = [
      "Hard Work — What does hard work mean to you?",
      answers.hardWorkMeaning,
      "",
      "Service — What was a time when you served someone when it was inconvenient?",
      answers.inconvenientServiceExample,
      "",
      "Integrity — What does it mean to have integrity?",
      answers.integrityMeaning,
      "",
      "Goals — What personal goals are you currently working on?",
      answers.personalGoals,
    ].join("\n");

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        max_tokens: 80,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!res.ok) {
      console.error("Hiring AI score failed:", await res.text().catch(() => ""));
      return null;
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = data.choices?.[0]?.message?.content?.trim() ?? "";
    try {
      const parsed = JSON.parse(raw) as Partial<ApplicantScoreBreakdown>;
      return normalizeScoreBreakdown(parsed);
    } catch {
      const match = raw.match(/-?\d+/);
      if (!match) return null;
      const total = Math.max(0, Math.min(12, Math.round(Number(match[0]))));
      // Legacy single-integer response: keep total only; section grades unknown
      return { hardWork: 0, service: 0, integrity: 0, goals: 0, total };
    }
  } catch (err) {
    console.error("Hiring AI score error:", err);
    return null;
  }
}
