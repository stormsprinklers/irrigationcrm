/** @deprecated Use `@/lib/inbox/email` — kept for existing imports. */
export {
  getDefaultFromEmail,
  isEmailConfigured,
  sendEmail,
  validateEmailWebhook,
  validateEmailWebhook as validateSendGridWebhook,
  type SendEmailResult,
} from "./email";
