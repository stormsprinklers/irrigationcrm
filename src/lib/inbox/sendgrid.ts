/** @deprecated Use `@/lib/inbox/email` — kept for existing imports. */
export {
  getDefaultFromEmail,
  isEmailConfigured,
  sendEmail,
  type SendEmailResult,
} from "./email";
export {
  validateEmailWebhook,
  validateEmailWebhook as validateSendGridWebhook,
} from "./email-webhook";
