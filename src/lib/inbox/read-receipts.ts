export type SmsReadReceipt = {
  readAt: string;
  user: { id: string; name: string };
};

export type SmsReadAudienceMember = { id: string; name: string };

export function formatSmsReadReceipt(receipts: SmsReadReceipt[]) {
  const names = receipts.map((receipt) => receipt.user.name);
  if (names.length === 0) return null;
  if (names.length === 1) return `Seen by ${names[0]}`;
  if (names.length === 2) return `Seen by ${names[0]} and ${names[1]}`;
  return `Seen by ${names.length}`;
}

export function formatSmsReadReceiptDetails(
  receipts: SmsReadReceipt[],
  audience: SmsReadAudienceMember[]
) {
  const seenIds = new Set(receipts.map((receipt) => receipt.user.id));
  const seenNames = receipts.map((receipt) => receipt.user.name);
  const unseenNames = audience
    .filter((employee) => !seenIds.has(employee.id))
    .map((employee) => employee.name);

  return [
    `Seen: ${seenNames.length > 0 ? seenNames.join(", ") : "Nobody"}`,
    `Not seen: ${unseenNames.length > 0 ? unseenNames.join(", ") : "Nobody"}`,
  ].join("\n");
}
