export const PORTAL_SESSION_COOKIE = "portal_session";
export const PORTAL_SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 7; // 7 days
export const PORTAL_LOGIN_TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes
export const PORTAL_LOGIN_RATE_LIMIT = 3; // per email per hour

export const PORTAL_RESCHEDULABLE_STATUSES = ["SCHEDULED", "UNSCHEDULED"] as const;
