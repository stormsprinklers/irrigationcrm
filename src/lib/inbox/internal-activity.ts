const ESTIMATE_SENT_PREFIX = "internal_note:estimate:";

export function estimateSentActivityStatus(estimateId: string) {
  return `${ESTIMATE_SENT_PREFIX}${estimateId}`;
}

export function parseEstimateSentActivity(status: string | null | undefined) {
  if (!status?.startsWith(ESTIMATE_SENT_PREFIX)) return null;
  const estimateId = status.slice(ESTIMATE_SENT_PREFIX.length).trim();
  return estimateId ? { estimateId } : null;
}
