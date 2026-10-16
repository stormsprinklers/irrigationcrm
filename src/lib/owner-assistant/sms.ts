import { normalizePhone } from "@/lib/inbox/contacts";
import { sendSms } from "@/lib/inbox/twilio";
import { getOpenAIApiKey } from "@/lib/openai/client";
import { prisma } from "@/lib/prisma";
import { listOwnerAssistantCompanies } from "./access";
import { buildOwnerAssistantPrompt } from "./prompt";
import { executeOwnerAssistantTool } from "./tools";
import { OWNER_ASSISTANT_TOOLS } from "./types";
import { isOwnerAssistantAvailable } from "./availability";

type Config = NonNullable<Awaited<ReturnType<typeof prisma.ownerAssistantConfig.findUnique>>> & {
  owner: { id: string; name: string; email: string; companyId: string };
  phoneNumber: { e164: string } | null;
};

export function isAuthorizedOwnerAssistantRecipient(config: Pick<Config, "authorizedPhoneE164">, recipient: string) {
  return Boolean(config.authorizedPhoneE164) && normalizePhone(recipient) === normalizePhone(config.authorizedPhoneE164!);
}

export async function handleOwnerAssistantSms(config: Config, input: { body: string; messageSid?: string; from: string }) {
  if (!config.phoneNumber || !isAuthorizedOwnerAssistantRecipient(config, input.from)) return { handled: true, replied: false };
  const body = input.body.trim().slice(0, 4000);
  if (!body) return { handled: true, replied: false };

  if (!isOwnerAssistantAvailable(config.availabilityJson)) {
    await sendSms({ companyId: config.homeCompanyId, from: config.phoneNumber.e164, to: config.authorizedPhoneE164!, body: `${config.name} is outside its configured availability window.`, skipCompanyPrefix: true });
    return { handled: true, replied: true };
  }

  if (input.messageSid) {
    const duplicate = await prisma.ownerAssistantMessage.findUnique({ where: { providerSid: input.messageSid }, select: { id: true } });
    if (duplicate) return { handled: true, replied: false };
  }
  await prisma.ownerAssistantMessage.create({ data: { configId: config.id, providerSid: input.messageSid || null, role: "user", channel: "SMS", content: body } });
  const recent = await prisma.ownerAssistantMessage.findMany({ where: { configId: config.id, channel: "SMS" }, orderBy: { createdAt: "desc" }, take: 24 });
  const companies = await listOwnerAssistantCompanies(config.owner);
  const apiKey = process.env.OWNER_ASSISTANT_OPENAI_API_KEY?.trim() || getOpenAIApiKey();
  if (!apiKey) throw new Error("Owner assistant OpenAI key is not configured");

  const messages: Array<Record<string, unknown>> = [
    { role: "system", content: buildOwnerAssistantPrompt({ name: config.name, ownerName: config.owner.name, companies }) },
    ...recent.reverse().map((message) => ({ role: message.role, content: message.content })),
  ];
  let reply = "I couldn't complete that request.";
  for (let round = 0; round < 5; round += 1) {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OWNER_ASSISTANT_TEXT_MODEL || "gpt-4o-mini",
        messages,
        tools: OWNER_ASSISTANT_TOOLS.map((tool) => ({ type: "function", function: { name: tool.name, description: tool.description, parameters: tool.parameters } })),
        tool_choice: "auto",
        temperature: 0.2,
      }),
    });
    if (!response.ok) throw new Error(`Owner assistant model failed (${response.status})`);
    const data = await response.json() as { choices?: Array<{ message?: { content?: string | null; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> } }> };
    const message = data.choices?.[0]?.message;
    if (!message) throw new Error("Owner assistant returned an empty response");
    messages.push({ role: "assistant", content: message.content ?? null, tool_calls: message.tool_calls });
    if (!message.tool_calls?.length) {
      reply = (message.content || reply).trim().slice(0, 1500);
      break;
    }
    for (const call of message.tool_calls) {
      let args: unknown = {};
      try { args = JSON.parse(call.function.arguments || "{}"); } catch { args = {}; }
      const result = await executeOwnerAssistantTool({ configId: config.id, ownerUserId: config.ownerUserId }, call.function.name, args);
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }
  await prisma.ownerAssistantMessage.create({ data: { configId: config.id, role: "assistant", channel: "SMS", content: reply } });
  // Crucial invariant: the recipient is loaded from the protected config, never from model/tool input.
  await sendSms({ companyId: config.homeCompanyId, from: config.phoneNumber.e164, to: config.authorizedPhoneE164!, body: `${config.name}: ${reply}`, skipCompanyPrefix: true });
  return { handled: true, replied: true };
}
