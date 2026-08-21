/** True when the technician is clearly abandoning the current diagnostic for a different problem. */
export function wantsNewTechIssue(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return false;
  return /\b(different (problem|issue|symptom|fault)|new (problem|issue)|start over|something else|another (problem|issue)|wrong (problem|issue)|switch (issues?|problems?)|not that (problem|issue))\b/.test(
    t
  );
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Parse OpenAI "try again in Xs" / retry-after style hints. */
export function parseRetryAfterMs(errorText: string): number | null {
  const seconds = errorText.match(/try again in\s+([\d.]+)\s*s/i);
  if (seconds?.[1]) {
    const ms = Math.ceil(Number(seconds[1]) * 1000);
    if (Number.isFinite(ms) && ms > 0) return Math.min(Math.max(ms, 1000), 30000);
  }
  const headerLike = errorText.match(/retry-after["\s:]+(\d+)/i);
  if (headerLike?.[1]) {
    const ms = Number(headerLike[1]) * 1000;
    if (Number.isFinite(ms) && ms > 0) return Math.min(Math.max(ms, 1000), 30000);
  }
  return null;
}

export function isOpenAiRateLimitError(status: number, body: string): boolean {
  return status === 429 || /rate limit|tokens per min|TPM/i.test(body);
}
