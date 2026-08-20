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

/** Rotate opening style so replies do not all start the same AI-sounding way. */
const OPENING_STYLES = [
  "Start by thanking them by name for the review, then jump into a specific detail they mentioned.",
  "Open with a short reaction to a concrete detail from the review (tech name, yard area, timing), then thank them.",
  "Lead with appreciation for trusting the company, then reference one specific point from their review.",
  "Start with their first name and a direct line about the work (e.g. glad the zone is fixed / system is running), then thank them for posting.",
  "Open by naming the technician or service they mentioned if present; otherwise open with a brief thanks and what went well.",
  "Begin with a casual one-sentence thanks using their name, then add one personal detail from the review.",
] as const;

const BANNED_OPENERS =
  /^(it'?s\s+)?(so\s+)?(great|good|wonderful|awesome|nice|amazing|lovely)\s+to\s+hear\b/i;

function pickOpeningStyle() {
  return OPENING_STYLES[Math.floor(Math.random() * OPENING_STYLES.length)]!;
}

function stripBannedOpener(text: string): string {
  const trimmed = text.trim();
  // Drop a leading stock opener sentence if the model ignores the ban list.
  const sentences = trimmed.split(/(?<=[.!?])\s+/);
  if (sentences.length < 2) return trimmed;
  if (BANNED_OPENERS.test(sentences[0] ?? "")) {
    return sentences.slice(1).join(" ").trim() || trimmed;
  }
  return trimmed;
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
  const openingStyle = pickOpeningStyle();

  const winterizationRule = mentionWinterization
    ? `- Include one brief, natural sentence reminding them they can reach out to schedule sprinkler winterization before cold weather sets in. Work it in conversationally — not as a hard sell.`
    : `- Do NOT mention winterization, seasonal services, or booking appointments.`;

  const system = `You write public replies to Google Business Profile reviews for a local irrigation and sprinkler company.
Return ONLY valid JSON: { "text": "..." }

Voice: sound like a real owner or office manager typing a quick reply — friendly, specific, and human. Not corporate, not scripted, not "AI customer service."

Opening (critical):
- ${openingStyle}
- Never open with generic emotion filler. Especially never start with: "It's great to hear", "Great to hear", "So glad to hear", "Happy to hear", "Wonderful to hear", "Awesome to hear", or any "___ to hear that..." opener.
- Do not start two replies the same way across generations; invent a fresh opening each time.

Rules:
- 2-4 sentences. Keep it concise.
- Use first name (${firstName}) somewhere naturally — not always as the first two words.
- If the review mentions something specific (a technician, service, timing, part of their yard, communication, price), echo that detail so the reply feels written for them.
- Star-only reviews (no comment): keep it short and warm without inventing details.
- Vary wording every time. Never reuse stock phrases.
- Banned words and phrases (never use): thrilled, delighted, over the moon, couldn't be happier, means the world, it was our pleasure, thank you for taking the time, we appreciate your kind words, so glad, happy to hear, great to hear, glad to hear, wonderful to hear, awesome to hear, it's great to hear, so glad to hear.
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
      temperature: 0.9,
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

  return { text: stripBannedOpener(text) };
}
