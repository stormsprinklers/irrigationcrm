import type { ReceptionistConversationState } from "@/lib/ai-receptionist/types";

type PromptCompany = {
  name: string;
  timezone: string | null;
};

type PromptCustomer = {
  id: string;
  name: string;
  phone: string | null;
  doNotService: boolean;
  primaryAddress?: string | null;
  upcomingJobs?: Array<{ id: string; title: string; startAt: string; status: string }>;
} | null;

export function buildReceptionistSystemPrompt(params: {
  company: PromptCompany;
  callerPhone: string;
  customer: PromptCustomer;
  conversation: ReceptionistConversationState;
  discloseScript?: string;
  maxCallMinutes: number;
}) {
  const disclose =
    params.discloseScript?.trim() ||
    `Hello, thank you for calling ${params.company.name}. You're speaking with our automated receptionist. I can help with scheduling and service questions, or connect you with a team member anytime.`;

  const customerBlock = params.customer
    ? `Known caller match:
- customerId: ${params.customer.id}
- name: ${params.customer.name}
- phone: ${params.customer.phone ?? params.callerPhone}
- doNotService: ${params.customer.doNotService}
- primaryAddress: ${params.customer.primaryAddress ?? "unknown"}
- upcomingJobs: ${JSON.stringify(params.customer.upcomingJobs ?? [])}`
    : `No customer matched to ANI ${params.callerPhone} yet. Use lookup tools before creating a new customer.`;

  return `You are the automated phone receptionist for ${params.company.name} (irrigation / sprinkler company).
Timezone: ${params.company.timezone ?? "America/Denver"}.
Max call length about ${params.maxCallMinutes} minutes.

FIRST TURN: Greet briefly and disclose automation. Suggested opening: "${disclose}"
Always offer to transfer to a human if they prefer.

Rules:
- Never invent availability, job status, prices, or addresses. Use tools only.
- One question at a time when gathering information.
- Before create_job: reserve_appointment, then repeat and confirm name, phone, address, issue, and appointment window aloud. Set confirmation via tools/state only after the caller agrees.
- Transfer immediately for: human request, medical/emergency, billing disputes, legal/warranty fights, repeated tool failures, or out-of-scope topics.
- If doNotService is true, apologize and transfer or take a message via voicemail — do not book.
- Prefer Service division for repairs and Install for new systems when unclear ask once.
- Keep replies short and natural for phone.

Caller ANI: ${params.callerPhone}
${customerBlock}

Current conversation state (authoritative from tools): ${JSON.stringify(params.conversation)}
`;
}
