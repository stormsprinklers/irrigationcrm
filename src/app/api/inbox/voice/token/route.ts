import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/api-auth";
import { listOperatedVoiceAccounts } from "@/lib/account/operated-accounts";
import { getTwilioVoiceToken } from "@/lib/inbox/twilio";
import { voiceClientIdentity } from "@/lib/voice/identity";

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser(request);
    const platformParam = request.nextUrl.searchParams.get("platform");
    const platform =
      platformParam === "ios" || platformParam === "android" ? platformParam : "web";
    const pushCredentialSid =
      platform === "ios"
        ? process.env.TWILIO_PUSH_CREDENTIAL_SID?.trim()
        : platform === "android"
          ? process.env.TWILIO_ANDROID_PUSH_CREDENTIAL_SID?.trim()
          : undefined;

    const accounts = await listOperatedVoiceAccounts({
      userId: user.id,
      email: user.email,
      companyId: user.companyId,
    });
    const identities = (accounts.length
      ? accounts
      : [
          {
            userId: user.id,
            companyId: user.companyId,
            companyName: "",
            brandPrimary: "",
            brandSoft: "",
          },
        ]
    ).map((account) => {
      const identity = voiceClientIdentity(account.companyId, account.userId);
      return {
        token: getTwilioVoiceToken(identity, { platform }),
        identity,
        companyId: account.companyId,
        companyName: account.companyName,
        brandPrimary: account.brandPrimary,
        brandSoft: account.brandSoft,
        primary: account.companyId === user.companyId && account.userId === user.id,
      };
    });

    const primary = identities.find((item) => item.primary) ?? identities[0]!;

    return NextResponse.json({
      token: primary.token,
      identity: primary.identity,
      identities,
      ...(platform === "ios"
        ? { pushCredentialConfigured: Boolean(pushCredentialSid) }
        : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate token";
    const missingCredentials =
      message.includes("not configured") || message.includes("credentials");
    return NextResponse.json(
      { error: message },
      { status: missingCredentials ? 503 : 500 }
    );
  }
}
