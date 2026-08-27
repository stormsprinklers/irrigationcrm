import { randomUUID } from "crypto";
import {
  createOAuthState,
  exchangeGoogleOAuthCode,
  verifyOAuthState,
} from "@/lib/google-oauth/oauth";
import {
  getGeneralGoogleOAuthConfig,
  isGeneralGoogleOAuthConfigured,
} from "@/lib/google-oauth/config";
import { prisma } from "@/lib/prisma";

export const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

export class GoogleCalendarApiError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

export function isGoogleCalendarConfigured() {
  return isGeneralGoogleOAuthConfigured();
}

export async function getGoogleCalendarConnectionStatus(companyId: string) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      googleCalendarRefreshToken: true,
      googleCalendarConnectedEmail: true,
      googleCalendarConnectedAt: true,
    },
  });
  if (!company) return null;
  return {
    configured: isGoogleCalendarConfigured(),
    connected: Boolean(company.googleCalendarRefreshToken),
    email: company.googleCalendarConnectedEmail,
    connectedAt: company.googleCalendarConnectedAt,
  };
}

export function buildGoogleCalendarAuthUrl(companyId: string, redirectUri: string) {
  const { clientId } = getGeneralGoogleOAuthConfig();
  if (!clientId) throw new GoogleCalendarApiError("Google OAuth is not configured", 503);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_CALENDAR_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state: createOAuthState(companyId),
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export { verifyOAuthState };

export async function exchangeGoogleCalendarOAuthCode(code: string, redirectUri: string) {
  return exchangeGoogleOAuthCode(
    code,
    redirectUri,
    getGeneralGoogleOAuthConfig(),
    GoogleCalendarApiError
  );
}

export async function getGoogleCalendarAccessToken(companyId: string) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { googleCalendarRefreshToken: true },
  });
  if (!company?.googleCalendarRefreshToken) {
    throw new GoogleCalendarApiError("Google Calendar is not connected", 400);
  }

  const { clientId, clientSecret } = getGeneralGoogleOAuthConfig();
  if (!clientId || !clientSecret) {
    throw new GoogleCalendarApiError("Google OAuth is not configured", 503);
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: company.googleCalendarRefreshToken,
      grant_type: "refresh_token",
    }),
  });

  const data = (await res.json()) as { access_token?: string; error?: string };
  if (!res.ok || !data.access_token) {
    throw new GoogleCalendarApiError(data.error ?? "Failed to refresh Google Calendar token", res.status);
  }
  return data.access_token;
}

export async function fetchPrimaryCalendarEmail(accessToken: string) {
  const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = (await res.json()) as { id?: string; error?: { message?: string } };
  if (!res.ok) {
    throw new GoogleCalendarApiError(data.error?.message ?? "Failed to read Google Calendar", res.status);
  }
  return data.id ?? null;
}

export async function createGoogleMeetEvent(params: {
  companyId: string;
  title: string;
  description?: string;
  startAt: Date;
  endAt: Date;
  timeZone: string;
  attendeeEmails: string[];
}): Promise<{ htmlLink: string | null; hangoutLink: string | null } | null> {
  const company = await prisma.company.findUnique({
    where: { id: params.companyId },
    select: { googleCalendarRefreshToken: true },
  });
  if (!company?.googleCalendarRefreshToken) return null;

  const accessToken = await getGoogleCalendarAccessToken(params.companyId);
  const attendees = [...new Set(params.attendeeEmails.map((e) => e.trim().toLowerCase()).filter(Boolean))].map(
    (email) => ({ email })
  );

  const url =
    "https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      summary: params.title,
      description: params.description ?? "",
      start: { dateTime: params.startAt.toISOString(), timeZone: params.timeZone },
      end: { dateTime: params.endAt.toISOString(), timeZone: params.timeZone },
      attendees,
      guestsCanModify: false,
      conferenceData: {
        createRequest: {
          requestId: randomUUID(),
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      },
    }),
  });

  const data = (await res.json()) as {
    htmlLink?: string;
    hangoutLink?: string;
    conferenceData?: { entryPoints?: Array<{ entryPointType?: string; uri?: string }> };
    error?: { message?: string };
  };

  if (!res.ok) {
    throw new GoogleCalendarApiError(data.error?.message ?? "Failed to create Google Meet event", res.status);
  }

  const meetFromConference = data.conferenceData?.entryPoints?.find(
    (entry) => entry.entryPointType === "video"
  )?.uri;

  return {
    htmlLink: data.htmlLink ?? null,
    hangoutLink: data.hangoutLink ?? meetFromConference ?? null,
  };
}
