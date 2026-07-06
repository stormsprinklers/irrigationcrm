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

function reviewerFirstName(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return "there";
  return trimmed.split(/\s+/)[0] ?? trimmed;
}

export async function generateGbpReviewReplyDraft(params: {
  companyName: string;
  locationTitle: string | null;
  reviewerName: string;
  starRating: number;
  reviewComment: string | null;
}) {
  const apiKey = requireOpenAIApiKey();

  const firstName = reviewerFirstName(params.reviewerName);
  const isPositive = params.starRating >= 4;
  const mentionWinterization = isPositive && Math.random() < 0.5;

  const winterizationRule = mentionWinterization
    ? `- Include one brief, natural sentence reminding them they can reach out to schedule sprinkler winterization before cold weather sets in. Work it in conversationally — not as a hard sell.`
    : `- Do NOT mention winterization, seasonal services, or booking appointments.`;

  const system = `You write public replies to Google Business Profile reviews for a local irrigation and sprinkler company.
Return ONLY valid JSON: { "text": "..." }

Voice: sound like a real person at a local business — friendly, direct, and human. Not corporate or scripted.

Rules:
- 2-4 sentences. Keep it concise.
- Address the reviewer by first name (${firstName}) naturally — vary how you open (do not start every reply the same way).
- If the review mentions something specific (a technician, service, timing, part of their yard, communication, price), echo that detail so the reply feels written for them.
- Vary wording every time. Never reuse stock phrases.
- Banned words and phrases (never use): thrilled, delighted, over the moon, couldn't be happier, means the world, it was our pleasure, thank you for taking the time, we appreciate your kind words, so glad, happy to hear.
- No emojis, hashtags, markdown, or placeholders like [Name].
- Do not mention AI or automated drafting.
- For ratings below 4: acknowledge the concern without being defensive; invite them to call or email so you can follow up. Do not upsell or mention seasonal services.
${winterizationRule}`;

  const user = `Business: ${params.companyName}
Location: ${params.locationTitle ?? "local service area"}

Reviewer first name: ${firstName}
Full reviewer name: ${params.reviewerName}
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
      temperature: 0.78,
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
