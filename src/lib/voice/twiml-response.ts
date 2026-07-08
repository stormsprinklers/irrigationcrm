import { NextResponse } from "next/server";

export function twimlResponse(twiml: string) {
  return new NextResponse(twiml, { headers: { "Content-Type": "text/xml" } });
}

export function twimlHangup() {
  return twimlResponse("<Response><Hangup/></Response>");
}

export function twimlSayAndHangup(message: string) {
  const escaped = message
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  return twimlResponse(`<Response><Say>${escaped}</Say><Hangup/></Response>`);
}
