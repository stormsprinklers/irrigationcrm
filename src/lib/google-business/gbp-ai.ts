import { requireOpenAIApiKey } from "@/lib/openai/client";

export async function generateGbpPostDraft(params: {
  companyName: string;
  locationTitle: string | null;
  userBrief: string;
}) {
  const apiKey = requireOpenAIApiKey();

  const system = `You write Google Business Profile update posts for a local irrigation and sprinkler service company.
Return ONLY valid JSON: { "text": "..." }
The text should be 1-2 short paragraphs (about 120-280 words total), friendly and professional, suitable for local customers.
Do not include hashtags, emojis, or markdown. Do not mention that this was AI-generated.`;

  const user = `Business: ${params.companyName}
Location: ${params.locationTitle ?? "local service area"}

What the user wants the post to cover:
${params.userBrief.trim()}`;

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
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: 600,
      temperature: 0.6,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || "OpenAI request failed");
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) throw new Error("No content from OpenAI");

  const parsed = JSON.parse(raw) as { text?: string };
  const text = parsed.text?.trim();
  if (!text) throw new Error("AI did not return post text");

  return { text };
}

export async function generateGbpReviewReplyDraft(params: {
  companyName: string;
  locationTitle: string | null;
  reviewerName: string;
  starRating: number;
  reviewComment: string | null;
}) {
  const apiKey = requireOpenAIApiKey();

  const system = `You write public replies to Google Business Profile customer reviews for an irrigation and sprinkler company.
Return ONLY valid JSON: { "text": "..." }
Voice: respectful, personal, and professional — warm but not overly stiff or corporate.
Keep replies concise (2-4 sentences). Thank the customer by first name when possible.
For negative reviews, acknowledge concerns without being defensive and invite offline follow-up.
Do not include placeholders like [Name] — use the reviewer's name when provided.`;

  const user = `Business: ${params.companyName}
Location: ${params.locationTitle ?? "local office"}

Reviewer: ${params.reviewerName}
Rating: ${params.starRating} out of 5 stars
Review:
${params.reviewComment?.trim() || "(No written comment — star rating only)"}`;

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
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: 350,
      temperature: 0.5,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || "OpenAI request failed");
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) throw new Error("No content from OpenAI");

  const parsed = JSON.parse(raw) as { text?: string };
  const text = parsed.text?.trim();
  if (!text) throw new Error("AI did not return reply text");

  return { text };
}
