export const POLICY_CATEGORIES = [
  "Discounts",
  "Callbacks",
  "Repair process",
  "Customer service",
  "Warranty",
  "Scheduling",
  "Other",
] as const;

export type StormAiPolicyDto = {
  id: string;
  title: string;
  category: string | null;
  description: string;
  active: boolean;
  sortOrder: number;
};

const PROMPT_MAX_CHARS = 10_000;

function policyHaystack(policy: StormAiPolicyDto) {
  return [policy.title, policy.category ?? "", policy.description].join(" ").toLowerCase();
}

export function scorePolicyMatch(policy: StormAiPolicyDto, query: string) {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return 1;
  const tokens = q.split(/\s+/).filter((t) => t.length > 1);
  const hay = policyHaystack(policy);
  let score = 0;
  for (const token of tokens) {
    if (policy.title.toLowerCase().includes(token)) score += 4;
    else if ((policy.category ?? "").toLowerCase().includes(token)) score += 3;
    else if (hay.includes(token)) score += 1;
  }
  if (policy.title.toLowerCase().includes(q)) score += 5;
  if (hay.includes(q)) score += 3;
  return score;
}

export function formatPoliciesForPrompt(policies: StormAiPolicyDto[]) {
  if (!policies.length) {
    return "Company policies: none are configured yet. Do not invent company rules for discounts, callbacks, repairs, or customer service.";
  }

  const blocks: string[] = [
    "Company policies (source of truth for how this company does things). Follow these over generic advice. Never invent a company rule that is not listed. If a question is about discounts, callbacks, repair process, customer service, warranty, or scheduling, apply the matching policy.",
  ];
  let used = blocks[0]!.length;
  for (const policy of policies) {
    const heading = policy.category ? `${policy.title} (${policy.category})` : policy.title;
    let body = policy.description.trim();
    const piece = `\n### ${heading}\n${body}`;
    if (used + piece.length > PROMPT_MAX_CHARS) {
      const remaining = Math.max(200, PROMPT_MAX_CHARS - used - 80);
      body = `${body.slice(0, remaining)}…`;
      blocks.push(
        `\n### ${heading}\n${body}\n[Truncated — call search_company_policies or get_company_policy for the rest.]`
      );
      break;
    }
    blocks.push(piece);
    used += piece.length;
  }
  return blocks.join("\n");
}

