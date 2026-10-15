import { NextRequest, NextResponse } from "next/server";
import { requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { isApnsConfigured, sendApnsNotification } from "@/lib/mobile-push/apns";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser(request);
    const devices = await prisma.mobilePushDevice.count({ where: { userId: user.id, companyId: user.companyId, platform: "ios" } });
    return NextResponse.json({ configured: isApnsConfigured(), registeredDevices: devices }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") return unauthorizedResponse();
    console.error("Push status failed", error);
    return NextResponse.json({ error: "Could not check notification status" }, { status: 500 });
  }
}

// A user can test only their own registered device in the selected company.
export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser(request);
    const body = await request.json().catch(() => ({}));
    if (!isApnsConfigured()) return NextResponse.json({ error: "Apple push notifications are not configured on the server yet." }, { status: 503 });
    const device = await prisma.mobilePushDevice.findFirst({ where: { userId: user.id, companyId: user.companyId, platform: "ios", deviceToken: String(body.deviceToken ?? "") } });
    if (!device) return NextResponse.json({ error: "Register this iPhone before testing notifications." }, { status: 404 });
    const result = await sendApnsNotification(device.deviceToken, { alert: { title: "Radar notification test", body: "Push notifications are working on this iPhone." }, deepLink: "stormcrm://inbox" });
    if (!result.ok) return NextResponse.json({ error: `Apple could not deliver the test notification: ${result.reason}` }, { status: 502 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") return unauthorizedResponse();
    console.error("Push test failed", error);
    return NextResponse.json({ error: "Could not send test notification" }, { status: 500 });
  }
}
