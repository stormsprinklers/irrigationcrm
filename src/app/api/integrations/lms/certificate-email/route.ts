import { NextRequest, NextResponse } from "next/server";
import { extractIntegrationKey } from "@/lib/integrations/keys";
import { getDefaultFromEmail, sendEmail } from "@/lib/inbox/email";
import {
  readResponseBufferLimited,
  safeOutboundFetch,
  validateOutboundUrlSyntax,
} from "@/lib/security/outbound-fetch";

const MAX_CERTIFICATE_BYTES = 10 * 1024 * 1024;

function certificateHosts() {
  const hosts = (process.env.LMS_CERTIFICATE_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean);
  try {
    if (process.env.LMS_INTEGRATION_URL) hosts.push(new URL(process.env.LMS_INTEGRATION_URL).hostname);
  } catch {
    // Deployment validation reports malformed configured URLs.
  }
  return [...new Set(hosts)];
}

function authorizeLmsRequest(request: NextRequest): boolean {
  const expected = process.env.LMS_INTEGRATION_KEY?.trim();
  if (!expected) return false;
  const provided = extractIntegrationKey(request);
  return Boolean(provided && provided === expected);
}

export async function POST(request: NextRequest) {
  if (!authorizeLmsRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > 15 * 1024 * 1024) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  let body: {
    to?: string;
    learnerName?: string;
    certTitle?: string;
    badgeUrl?: string | null;
    pdfBase64?: string;
    pdfUrl?: string | null;
    pdfFileName?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const to = body.to?.trim();
  const certTitle = body.certTitle?.trim() || "Certificate";
  const learnerName = body.learnerName?.trim() || "Learner";
  if (!to) {
    return NextResponse.json({ error: "to is required" }, { status: 400 });
  }

  const from = getDefaultFromEmail();
  if (!from) {
    return NextResponse.json({ error: "Email sender not configured" }, { status: 503 });
  }

  let pdfBase64 = body.pdfBase64?.trim() || "";
  if (!pdfBase64 && body.pdfUrl) {
    try {
      const allowedHosts = certificateHosts();
      if (!allowedHosts.length) throw new Error("Certificate download hosts are not configured");
      const res = await safeOutboundFetch(body.pdfUrl, {}, { allowedHosts });
      if (res.ok) {
        const contentType = res.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
        if (contentType !== "application/pdf") throw new Error("Certificate URL did not return a PDF");
        pdfBase64 = (await readResponseBufferLimited(res, MAX_CERTIFICATE_BYTES)).toString("base64");
      }
    } catch {
      // fall through
    }
  }
  if (!pdfBase64) {
    return NextResponse.json({ error: "pdfBase64 or pdfUrl is required" }, { status: 400 });
  }
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(pdfBase64) || pdfBase64.length % 4 !== 0) {
    return NextResponse.json({ error: "Certificate PDF is not valid base64" }, { status: 400 });
  }
  const pdfBytes = Buffer.from(pdfBase64, "base64");
  if (pdfBytes.length > MAX_CERTIFICATE_BYTES) {
    return NextResponse.json({ error: "Certificate PDF is too large" }, { status: 413 });
  }
  if (pdfBytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
    return NextResponse.json({ error: "Certificate attachment is not a PDF" }, { status: 400 });
  }

  const fileName =
    body.pdfFileName?.trim() ||
    `${certTitle.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "certificate"}.pdf`;

  let safeBadgeUrl: string | null = null;
  if (body.badgeUrl) {
    try {
      safeBadgeUrl = validateOutboundUrlSyntax(body.badgeUrl, {
        allowedHosts: certificateHosts(),
      }).toString();
    } catch {
      safeBadgeUrl = null;
    }
  }

  try {
    await sendEmail({
      from,
      to: [to],
      subject: `Your certificate: ${certTitle}`,
      text: `Congratulations ${learnerName}!\n\nYou have earned: ${certTitle}\n\nYour certificate PDF is attached.`,
      html: `<p>Congratulations <strong>${learnerName}</strong>!</p><p>You have earned: <strong>${certTitle}</strong>.</p><p>Your certificate PDF is attached.</p>${
        safeBadgeUrl
          ? `<p><img src="${safeBadgeUrl.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}" alt="" width="96" height="96" style="border-radius:9999px" /></p>`
          : ""
      }`,
      attachments: [
        {
          filename: fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`,
          contentType: "application/pdf",
          content: pdfBase64,
        },
      ],
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Certificate email failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to send email" },
      { status: 500 }
    );
  }
}
