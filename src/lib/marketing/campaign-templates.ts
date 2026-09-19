import type { CampaignFormState } from "@/lib/marketing/types";

export type CampaignTemplate = {
  id: string;
  name: string;
  description: string;
  badge: string;
  initial: CampaignFormState;
};

const WINTERIZATION_2026: CampaignTemplate = {
  id: "sprinkler-winterization-2026",
  name: "Sprinkler winterization",
  description:
    "A friendly email and SMS sequence for returning customers, with reply routing and a final reminder.",
  badge: "2026 pricing",
  initial: {
    name: "2026 Returning Customer Winterization",
    type: "DRIP",
    channel: "EMAIL",
    subject: "Sprinkler winterization for this fall",
    bodyText: "",
    bodyHtml: "",
    aiPrompt: "",
    audienceFilters: { recordType: "CUSTOMERS" },
    dripSettings: { emailsPerDay: 50, smsPerDay: 50 },
    steps: [],
    flowNodes: [
      {
        id: "tmp-template-trigger",
        type: "TRIGGER",
        sortOrder: 0,
        config: {
          kind: "manual_audience",
          priceBookItemIds: [],
          cities: [],
          formNoBookingDays: 7,
          nextId: "tmp-template-email-1",
        },
      },
      {
        id: "tmp-template-email-1",
        type: "SEND_EMAIL",
        sortOrder: 1,
        config: {
          subject: "Sprinkler winterization for this fall",
          bodyHtml: "",
          bodyText:
            "Hi {customer_first_name},\n\nWe’re opening our 2026 sprinkler winterization schedule and wanted to give returning customers an early heads-up. Pricing starts at $125 for up to 8 sprinkler zones, plus $15 for each additional zone.\n\nIf you’d like us to take care of yours, reply to this email and we’ll help find a time.\n\nThanks,\n{company_name}",
          aiPrompt: "",
          nextId: "tmp-template-wait-1",
        },
      },
      {
        id: "tmp-template-wait-1",
        type: "WAIT",
        sortOrder: 2,
        config: {
          mode: "delay",
          delayAmount: 2,
          delayUnit: "days",
          replyKeyword: "",
          replyChannel: "any",
          action: "clicked",
          timeoutEnabled: false,
          nextId: "tmp-template-sms-1",
        },
      },
      {
        id: "tmp-template-sms-1",
        type: "SEND_SMS",
        sortOrder: 3,
        config: {
          bodyText:
            "Hi {customer_first_name}, just checking whether you’d like us to winterize your sprinklers this year. Returning-customer pricing starts at $125 for up to 8 zones, plus $15 per additional zone. Reply YES and we’ll help find a time, or NO if you’re all set.",
          nextId: "tmp-template-reply-branch",
        },
      },
      {
        id: "tmp-template-reply-branch",
        type: "BRANCH",
        sortOrder: 4,
        config: {
          kind: "if_else",
          branches: [
            {
              id: "template-negative",
              segments: [
                {
                  id: "template-negative-segment",
                  booleanOp: "AND",
                  joinOp: "AND",
                  conditions: [
                    {
                      id: "template-negative-condition",
                      field: "smsReply",
                      operator: "is_any_of",
                      value: "no, no thanks, not interested, already scheduled, all set",
                    },
                  ],
                },
              ],
              nextId: "tmp-template-exit",
            },
            {
              id: "template-positive",
              segments: [
                {
                  id: "template-positive-segment",
                  booleanOp: "AND",
                  joinOp: "AND",
                  conditions: [
                    {
                      id: "template-positive-condition",
                      field: "smsReply",
                      operator: "is_any_of",
                      value: "yes, interested, book, schedule, sounds good",
                    },
                  ],
                },
              ],
              nextId: "tmp-template-sms-positive",
            },
            {
              id: "template-other-reply",
              segments: [
                {
                  id: "template-other-reply-segment",
                  booleanOp: "AND",
                  joinOp: "AND",
                  conditions: [
                    {
                      id: "template-other-reply-condition",
                      field: "smsReply",
                      operator: "is_not_empty",
                      value: "",
                    },
                  ],
                },
              ],
              nextId: "tmp-template-sms-other",
            },
          ],
          noneNextId: "",
          timeoutEnabled: true,
          timeoutAmount: 3,
          timeoutUnit: "days",
          timeoutNextId: "tmp-template-email-2",
        },
      },
      {
        id: "tmp-template-sms-positive",
        type: "SEND_SMS",
        sortOrder: 5,
        config: {
          bodyText:
            "Great — reply with the number of zones and a day or time that usually works. We’ll confirm the appointment with you.",
          nextId: "tmp-template-exit",
        },
      },
      {
        id: "tmp-template-sms-other",
        type: "SEND_SMS",
        sortOrder: 6,
        config: {
          bodyText:
            "Thanks for getting back to us. Someone from {company_name} will follow up to help with your question.",
          nextId: "tmp-template-exit",
        },
      },
      {
        id: "tmp-template-email-2",
        type: "SEND_EMAIL",
        sortOrder: 7,
        config: {
          subject: "Still need sprinkler winterization?",
          bodyHtml: "",
          bodyText:
            "Hi {customer_first_name},\n\nJust closing the loop in case you still need sprinkler winterization this fall. Returning-customer pricing starts at $125 for up to 8 zones, plus $15 for each additional zone.\n\nReply to this email if you’d like us to help find a time. If you’ve already handled it, no need to respond.\n\nThanks,\n{company_name}",
          aiPrompt: "",
          nextId: "tmp-template-exit",
        },
      },
      {
        id: "tmp-template-exit",
        type: "EXIT",
        sortOrder: 8,
        config: {},
      },
    ],
  },
};

export const CAMPAIGN_TEMPLATES: CampaignTemplate[] = [WINTERIZATION_2026];

export function getCampaignTemplate(id: string): CampaignTemplate | null {
  const template = CAMPAIGN_TEMPLATES.find((item) => item.id === id);
  if (!template) return null;
  return JSON.parse(JSON.stringify(template)) as CampaignTemplate;
}
