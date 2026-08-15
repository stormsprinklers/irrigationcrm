import { UserRole } from "@prisma/client";
import { getOpenAIApiKey } from "@/lib/openai/client";
import { prisma } from "@/lib/prisma";

export const REVIEW_ALIAS_ROLES: UserRole[] = [UserRole.TECH, UserRole.INSTALLER];

export function normalizeNameToken(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function tokenizeName(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .map((part) => normalizeNameToken(part))
    .filter(Boolean);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function commentMentionsName(comment: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) return false;
  return new RegExp(`\\b${escapeRegExp(trimmed)}\\b`, "i").test(comment);
}

export async function reservedReviewNameTokens(companyId: string, excludeUserId?: string) {
  const others = await prisma.user.findMany({
    where: {
      companyId,
      status: "ACTIVE",
      role: { in: REVIEW_ALIAS_ROLES },
      ...(excludeUserId ? { NOT: { id: excludeUserId } } : {}),
    },
    select: { firstName: true, lastName: true, name: true, reviewNameAliases: true },
  });

  const reserved = new Set<string>();
  for (const user of others) {
    for (const token of [
      ...tokenizeName(user.firstName),
      ...tokenizeName(user.lastName),
      ...tokenizeName(user.name),
      ...user.reviewNameAliases.flatMap((alias) => tokenizeName(alias)),
    ]) {
      reserved.add(token);
    }
  }
  return reserved;
}

export function sanitizeReviewAliases(raw: unknown, reserved: Set<string>, ownFirstName: string) {
  const list = Array.isArray(raw)
    ? raw.map((item) => String(item).trim()).filter(Boolean)
    : typeof raw === "string"
      ? raw
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      : [];

  const own = normalizeNameToken(ownFirstName);
  const seen = new Set<string>();
  const aliases: string[] = [];
  const collisions: string[] = [];

  for (const alias of list) {
    const token = normalizeNameToken(alias);
    if (!token || token === own || seen.has(token)) continue;
    if (reserved.has(token)) {
      collisions.push(alias);
      continue;
    }
    seen.add(token);
    aliases.push(alias);
    if (aliases.length >= 5) break;
  }

  return { aliases, collisions };
}

export async function generateReviewNameAliases(params: {
  companyId: string;
  userId: string;
  firstName: string;
}): Promise<string[]> {
  const reserved = await reservedReviewNameTokens(params.companyId, params.userId);
  const apiKey = getOpenAIApiKey();
  if (!apiKey) return [];

  const reservedList = [...reserved].slice(0, 80).join(", ");
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
        {
          role: "system",
          content:
            'You invent plausible misspellings and nicknames of a first name as they might appear in a customer Google review. Return JSON: { "aliases": ["...", "..."] } with exactly 5 unique one-word alternatives. Do not include the original name. Do not use any name from the reserved list.',
        },
        {
          role: "user",
          content: `First name: ${params.firstName}\nReserved names (do not use): ${reservedList || "(none)"}`,
        },
      ],
      max_tokens: 200,
      temperature: 0.8,
    }),
  });

  if (!res.ok) return [];
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as { aliases?: unknown };
    return sanitizeReviewAliases(parsed.aliases, reserved, params.firstName).aliases;
  } catch {
    return [];
  }
}

export async function ensureReviewNameAliases(companyId: string, userId: string) {
  const user = await prisma.user.findFirst({
    where: { id: userId, companyId, role: { in: REVIEW_ALIAS_ROLES } },
    select: { firstName: true, reviewNameAliases: true },
  });
  if (!user?.firstName) return;
  if (user.reviewNameAliases.length > 0) return;

  const aliases = await generateReviewNameAliases({
    companyId,
    userId,
    firstName: user.firstName,
  });
  if (!aliases.length) return;

  await prisma.user.update({
    where: { id: userId },
    data: { reviewNameAliases: aliases },
  });
}

export async function ensureCompanyReviewAliases(companyId: string) {
  const techs = await prisma.user.findMany({
    where: {
      companyId,
      status: "ACTIVE",
      role: { in: REVIEW_ALIAS_ROLES },
      reviewNameAliases: { equals: [] },
    },
    select: { id: true },
  });
  for (const tech of techs) {
    await ensureReviewNameAliases(companyId, tech.id);
  }
}
