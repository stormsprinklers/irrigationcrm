export type PipelineFollowUpTemplate = {
  delayHours: number;
  sms: string;
  emailSubject: string;
  emailBody: string;
};

export type PipelineFollowUpSettings = {
  lead: PipelineFollowUpTemplate[];
  qualified: PipelineFollowUpTemplate[];
};

export const DEFAULT_PIPELINE_FOLLOW_UP_SETTINGS: PipelineFollowUpSettings = {
  lead: [
    {
      delayHours: 24,
      sms: "Hey {customer first name}! This is {employee} from {company}, just wanted to check if you're still interested in getting a quote?",
      emailSubject: "Still interested in a quote?",
      emailBody: "Hi {customer first name}! This is {employee} with {company}. Just wanted to follow up and see if you're still interested in getting a quote from us! We'd love to help you out. Just reply to this email and we'll get the ball rolling! Thanks! {employee}, {company}",
    },
    {
      delayHours: 72,
      sms: "Hey {customer first name} it's {employee} just circling back to see if you're still wanting a quote. We are a local family-owned business and would love to get you some pricing sent over if you're still interested.",
      emailSubject: "We'd love to earn your business!",
      emailBody: "Hey {customer first name}! Just checking back in! We're a local, family-owned business, and we'd love the opportunity to earn your business. If you're still interested, we'd be happy to put together some pricing for you. No pressure at all! Looking forward to hearing from you! {employee}, {company}",
    },
    {
      delayHours: 168,
      sms: "Hey {customer first name}, just checking in once more before I take you off our list. Do you still want a quote?",
      emailSubject: "Should we close out your request?",
      emailBody: "Hi {customer first name}, I've reached out a couple of times and haven't heard back, so I wanted to check in one last time before we close out your request. Are you still interested in receiving a quote, or have your plans changed? Either way, a quick reply would be appreciated! Thanks! {employee}, {company}",
    },
  ],
  qualified: [
    {
      delayHours: 24,
      sms: "Hey {customer first name} it's {employee} just making sure you guys got that quote we sent over? I'm here if you have any questions or concerns.",
      emailSubject: "Any questions about your quote?",
      emailBody: "Hey {customer first name}! This is {employee} from {company}. Just wanted to make sure you received the quote we sent over! Do you have any questions about the pricing or what's included? We'd be happy to walk through anything with you. Looking forward to hearing your thoughts! {employee}, {company}",
    },
    {
      delayHours: 72,
      sms: "Hey {customer first name}, just wanted to make sure you know we are licensed and insured and have 10+ years of combined experience. When would you like to schedule?",
      emailSubject: "Ready to get your project scheduled?",
      emailBody: "Hi {customer first name}! Just wanted to follow up on your quote! As a reminder, we're a locally owned, licensed and insured company with over 10 years of combined experience. We take a lot of pride in our work and would love the opportunity to show you why our customers trust us. We'd love to get your project on the schedule. Is there a particular date or timeframe that would work best for you? Thanks! {employee}, {company}",
    },
    {
      delayHours: 168,
      sms: "Hi {customer first name}, thank you for considering our small business for this job. Is it safe to assume you're no longer interested or found someone else to handle the project for you?",
      emailSubject: "Have your plans changed?",
      emailBody: "Hey {customer first name}, thank you again for considering {company} for your project! I haven't heard back, so I wanted to check in one last time. Is it safe to assume you've decided to go another direction or are no longer interested? No hard feelings either way! We'd just love to know so we can update our schedule. Thanks again for considering our small business! {employee}, {company}",
    },
  ],
};

function validTemplate(value: unknown, fallback: PipelineFollowUpTemplate) {
  if (!value || typeof value !== "object") return fallback;
  const item = value as Partial<PipelineFollowUpTemplate>;
  return {
    delayHours: Number.isFinite(Number(item.delayHours)) && Number(item.delayHours) > 0
      ? Math.round(Number(item.delayHours))
      : fallback.delayHours,
    sms: typeof item.sms === "string" && item.sms.trim() ? item.sms : fallback.sms,
    emailSubject:
      typeof item.emailSubject === "string" && item.emailSubject.trim()
        ? item.emailSubject
        : fallback.emailSubject,
    emailBody:
      typeof item.emailBody === "string" && item.emailBody.trim()
        ? item.emailBody
        : fallback.emailBody,
  };
}

export function normalizePipelineFollowUpSettings(value: unknown): PipelineFollowUpSettings {
  const source = value && typeof value === "object" ? value as Partial<PipelineFollowUpSettings> : {};
  return {
    lead: DEFAULT_PIPELINE_FOLLOW_UP_SETTINGS.lead.map((fallback, index) =>
      validTemplate(source.lead?.[index], fallback)
    ),
    qualified: DEFAULT_PIPELINE_FOLLOW_UP_SETTINGS.qualified.map((fallback, index) =>
      validTemplate(source.qualified?.[index], fallback)
    ),
  };
}

export function renderPipelineTemplate(
  template: string,
  values: { customerFirstName: string; employee: string; company: string }
) {
  return template
    .replace(/\{customer first name\}/gi, values.customerFirstName)
    .replace(/\{customer_first_name\}/gi, values.customerFirstName)
    .replace(/\{employee\}/gi, values.employee)
    .replace(/\{company\}/gi, values.company);
}

export function customerFirstName(name: string) {
  return name.trim().split(/\s+/)[0] || "there";
}

/** A manual resume starts a fresh clock for every remaining automated step. */
export function pipelineFollowUpAnchorAt(stageEnteredAt: Date, resumedAt?: Date | null) {
  return resumedAt && resumedAt > stageEnteredAt ? resumedAt : stageEnteredAt;
}
