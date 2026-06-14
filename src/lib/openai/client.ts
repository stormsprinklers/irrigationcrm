export function getOpenAIApiKey() {
  return process.env.OPENAI_API_KEY ?? null;
}

export function requireOpenAIApiKey() {
  const key = getOpenAIApiKey();
  if (!key) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  return key;
}

export async function generateItemDescription(name: string, type: "SERVICE" | "MATERIAL") {
  const apiKey = requireOpenAIApiKey();
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Write a concise, professional price book description for an irrigation field service company. One or two sentences, no bullet points.",
        },
        {
          role: "user",
          content: `Write a description for this ${type.toLowerCase()} item: ${name}`,
        },
      ],
      max_tokens: 120,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || "OpenAI request failed");
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

export async function generateItemImage(name: string, description?: string | null) {
  const apiKey = requireOpenAIApiKey();
  const prompt = `Professional product photo for an irrigation service price book: ${name}. ${description ?? ""}. Clean white background, realistic, no text overlay.`;

  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "dall-e-3",
      prompt,
      n: 1,
      size: "1024x1024",
      response_format: "b64_json",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || "OpenAI image request failed");
  }

  const data = (await res.json()) as {
    data?: Array<{ b64_json?: string }>;
  };
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) throw new Error("No image returned");
  return Buffer.from(b64, "base64");
}
