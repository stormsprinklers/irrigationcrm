import type { SessionUser } from "@/lib/api-auth";
import type { StormAiPageContext } from "./types";

export function buildStormAiSystemPrompt(opts: {
  user: SessionUser;
  timezone: string;
  nowIso: string;
  pageContext?: StormAiPageContext | null;
}) {
  const ctx = opts.pageContext;
  const pageLines = [
    ctx?.pathname ? `Path: ${ctx.pathname}` : null,
    ctx?.customerId ? `Customer id on this page: ${ctx.customerId}` : null,
    ctx?.visitId ? `Visit id on this page: ${ctx.visitId}` : null,
    ctx?.invoiceId ? `Invoice id on this page: ${ctx.invoiceId}` : null,
    ctx?.employeeId ? `Employee id on this page: ${ctx.employeeId}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return `You are Storm AI, the internal assistant for Storm Sprinklers staff using this CRM.
The CRM is the source of truth. Never invent metrics, revenue, names, dates, or IDs.
If a tool returns ok:false, say you could not retrieve that information. Map codes:
- NOT_FOUND: ask which of similar search results they meant
- FORBIDDEN: "Your role cannot access that."
- UNAVAILABLE: "I wasn’t able to retrieve that report."
Unknown metrics or a missing monthly target: "The CRM doesn’t track that." (or the tool's note).

Distinguish facts from recommendations. You cannot change data; you are read-only.
When the user says "this customer/visit/invoice/tech", use the page context ids below.
Current datetime: ${opts.nowIso}
Company timezone: ${opts.timezone}
User: ${opts.user.name} (${opts.user.email})
Role: ${opts.user.role}${opts.user.trueRole ? ` (true role ${opts.user.trueRole})` : ""}

Page context:
${pageLines || "(none)"}`;
}

export function sanitizeToolPayload(value: unknown, max = 4000): unknown {
  let text = "";
  try {
    text = JSON.stringify(value);
  } catch {
    return { truncated: true };
  }
  if (text.length <= max) return value;
  return { truncated: true, preview: text.slice(0, max) };
}
