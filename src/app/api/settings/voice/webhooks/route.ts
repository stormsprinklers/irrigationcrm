import { NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { configureAllSmsWebhooks, twilioWebhookUrls } from "@/lib/twilio/numbers";

export async function GET() {
  try {
    const user = await requireSessionUser();
    if (user.role !== "ADMIN" && user.role !== "MANAGER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({
      configured: Boolean(
        process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
      ),
      appUrl: process.env.NEXT_PUBLIC_APP_URL ?? null,
      urls: twilioWebhookUrls(),
      instructions: [
        "Each Twilio phone number needs its SMS webhook pointed at smsInbound.",
        "If your numbers are in an A2P Messaging Service, that service also needs the same inbound URL.",
        "Use POST /api/settings/voice/webhooks to register these URLs automatically.",
      ],
    });
  } catch {
    return unauthorizedResponse();
  }
}

export async function POST() {
  try {
    const user = await requireSessionUser();
    if (user.role !== "ADMIN" && user.role !== "MANAGER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!process.env.NEXT_PUBLIC_APP_URL?.trim()) {
      return NextResponse.json(
        {
          error:
            "NEXT_PUBLIC_APP_URL is not set in Vercel. Webhooks must use your public app URL.",
        },
        { status: 400 }
      );
    }

    const result = await configureAllSmsWebhooks(user.companyId);
    return NextResponse.json({
      ok: true,
      ...result,
      message: `Updated ${result.phoneNumbers} phone number(s) and ${result.messagingServices} messaging service(s).`,
    });
  } catch (error) {
    console.error("Twilio webhook sync failed", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to configure Twilio webhooks",
      },
      { status: 500 }
    );
  }
}
