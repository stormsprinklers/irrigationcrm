import { requireOpenAIApiKey } from "@/lib/openai/client";
import {
  emptyParsedContactInfo,
  isParsedSmsContactInfo,
  type ParsedSmsContactInfo,
} from "@/lib/inbox/contact-info-types";

const SYSTEM_PROMPT = `You extract customer contact information from a single SMS message.
Return ONLY valid JSON with exactly these keys:
- firstName (string or null)
- lastName (string or null)
- homeAddress (string or null) — full mailing address as one line when possible
- email (string or null)
- phone (string or null)

Rules:
- Only include values explicitly stated or clearly implied in the message.
- Do not invent or guess missing fields.
- If no phone number is mentioned, set phone to null.
- Normalize email to lowercase.
- Strip labels like "Email:" from values.
- If only a full name is given, split into firstName and lastName when reasonable.`;

export async function extractContactInfoFromSmsMessage(
  messageBody: string
): Promise<ParsedSmsContactInfo> {
  const apiKey = requireOpenAIApiKey();

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
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Extract contact info from this SMS:\n\n${messageBody}`,
        },
      ],
      max_tokens: 400,
      temperature: 0,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || "OpenAI contact extraction failed");
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) throw new Error("No content from OpenAI");

  const parsed = JSON.parse(raw) as unknown;
  if (!isParsedSmsContactInfo(parsed)) {
    return emptyParsedContactInfo();
  }

  return {
    firstName: parsed.firstName?.trim() || null,
    lastName: parsed.lastName?.trim() || null,
    homeAddress: parsed.homeAddress?.trim() || null,
    email: parsed.email?.trim().toLowerCase() || null,
    phone: parsed.phone?.trim() || null,
  };
}
