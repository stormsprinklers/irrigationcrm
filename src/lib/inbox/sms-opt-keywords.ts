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
  return `You're opted out of marketing texts from ${companyName}. We won't send campaign SMS to this number. Reply START if you want them again.`;
}

export function marketingSmsStartReply(companyName: string) {
  return `You're opted in to marketing texts from ${companyName}. Reply STOP (by itself) anytime to opt out.`;
}
