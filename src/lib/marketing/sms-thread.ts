import { recordOutboundCustomerSms } from "@/lib/inbox/record-outbound-sms";

/** Store the exact outbound text so replies have campaign context in the SMS inbox. */
export async function recordCampaignSmsInThread(params: {
  companyId: string;
  customerId?: string | null;
  phone: string;
  body: string;
  twilioMessageSid: string;
}) {
  try {
    await recordOutboundCustomerSms({
      companyId: params.companyId,
      customerId: params.customerId,
      to: params.phone,
      body: params.body,
      twilioMessageSid: params.twilioMessageSid,
    });
  } catch (error) {
    // Twilio has already accepted the text. Keep the campaign send successful
    // and let the status callback update delivery rather than sending twice.
    console.error("Could not add campaign SMS to inbox", error);
  }
}
