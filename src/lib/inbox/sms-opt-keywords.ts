/** Whole-message SMS keywords (no other words). */
export function normalizeSmsKeyword(body: string) {
  return body.trim().toUpperCase();
}

export function isExactSmsStop(body: string) {
  return normalizeSmsKeyword(body) === "STOP";
}

export function isExactSmsStart(body: string) {
  return normalizeSmsKeyword(body) === "START";
}

export function marketingSmsStopReply(companyName: string) {
  return `${companyName}: You have unsubscribed and will no longer receive messages, including appointment reminders. Reply START at any time to resubscribe.`;
}

export function marketingSmsStartReply(companyName: string) {
  return `${companyName}: You have resubscribed and will receive messages, including appointment reminders. Reply STOP at any time to unsubscribe.`;
}
