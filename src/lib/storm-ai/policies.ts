import { prisma } from "@/lib/prisma";
import {
  formatPoliciesForPrompt,
  scorePolicyMatch,
  type StormAiPolicyDto,
} from "./policies-shared";

export {
  POLICY_CATEGORIES,
  formatPoliciesForPrompt,
  scorePolicyMatch,
  type StormAiPolicyDto,
} from "./policies-shared";

export function serializePolicy(row: {
  id: string;
  title: string;
  category: string | null;
  description: string;
  active: boolean;
  sortOrder: number;
}): StormAiPolicyDto {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    description: row.description,
    active: row.active,
    sortOrder: row.sortOrder,
  };
}

export async function listActiveCompanyPolicies(companyId: string) {
  const rows = await prisma.stormAiCompanyPolicy.findMany({
    where: { companyId, active: true },
    orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
  });
  return rows.map(serializePolicy);
}

export async function searchCompanyPolicies(companyId: string, query: string, take = 8) {
  const policies = await listActiveCompanyPolicies(companyId);
  const q = query.trim();
  if (!q) return policies.slice(0, take);
  return policies
    .map((policy) => ({ policy, score: scorePolicyMatch(policy, q) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, take)
    .map((row) => row.policy);
}

export async function getCompanyPolicy(companyId: string, policyId: string) {
  const row = await prisma.stormAiCompanyPolicy.findFirst({
    where: { id: policyId, companyId, active: true },
  });
  return row ? serializePolicy(row) : null;
}

export async function formatCompanyPoliciesForPrompt(companyId: string) {
  const policies = await listActiveCompanyPolicies(companyId);
  return formatPoliciesForPrompt(policies);
}

export async function formatPolicyCheckForTurn(companyId: string, question: string) {
  const policies = await listActiveCompanyPolicies(companyId);
  if (!policies.length) return null;
  const matches = await searchCompanyPolicies(companyId, question, 4);
  if (!matches.length) {
    return `Company policy check for this question: no specific policy matched. Do not invent company rules. Call search_company_policies if the question might still relate to how this company operates.`;
  }
  const lines = matches.map((policy) => {
    const heading = policy.category ? `${policy.title} (${policy.category})` : policy.title;
    return `### ${heading}\n${policy.description.trim()}`;
  });
  return `Company policy check for this question (always apply these before answering):\n${lines.join("\n\n")}`;
}
