const ESTIMATE_SENT_PREFIX = "internal_note:estimate:";
const PIPELINE_EMAIL_PREFIX = "internal_note:pipeline_email:";

export function estimateSentActivityStatus(estimateId: string) {
  return `${ESTIMATE_SENT_PREFIX}${estimateId}`;
}

export function parseEstimateSentActivity(status: string | null | undefined) {
  if (!status?.startsWith(ESTIMATE_SENT_PREFIX)) return null;
  const estimateId = status.slice(ESTIMATE_SENT_PREFIX.length).trim();
  return estimateId ? { estimateId } : null;
}

export function pipelineEmailActivityStatus(followUpId: string) {
  return `${PIPELINE_EMAIL_PREFIX}${followUpId}`;
}

export function parsePipelineEmailActivity(status: string | null | undefined) {
  if (!status?.startsWith(PIPELINE_EMAIL_PREFIX)) return null;
  const followUpId = status.slice(PIPELINE_EMAIL_PREFIX.length).trim();
  return followUpId ? { followUpId } : null;
}
