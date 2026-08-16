import { getOpenAIApiKey } from "@/lib/openai/client";

const SYSTEM_PROMPT = `You rewrite a field technician's job notes for a customer receipt.

Rules:
- Keep every factual detail the technician wrote. Do not add work, parts, diagnoses, or results that are not in the notes.
- Fix spelling, grammar, punctuation, and capitalization.
- Use a warm, professional tone suitable for a homeowner.
- Write 1–3 short paragraphs. No bullet points, headings, quotes, or sign-offs.
- Do not mention that the text was edited by AI.
- If the notes are already clear, only make light corrections.`;

function lightCleanup(text: string) {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed) return "";
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export async function polishWorkSummaryForCustomer(raw: string | null | undefined) {
  const source = raw?.trim() ?? "";
  if (!source) return null;

  const apiKey = getOpenAIApiKey();
  if (!apiKey) return lightCleanup(source);

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
        max_tokens: 400,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: source.slice(0, 4000) },
        ],
      }),
    });
    if (!res.ok) return lightCleanup(source);
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const polished = data.choices?.[0]?.message?.content?.trim();
    return polished || lightCleanup(source);
  } catch {
    return lightCleanup(source);
  }
}
