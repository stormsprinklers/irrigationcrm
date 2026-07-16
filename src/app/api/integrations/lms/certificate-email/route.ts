import { NextRequest, NextResponse } from "next/server";
import { extractIntegrationKey } from "@/lib/integrations/keys";
import { getDefaultFromEmail, sendEmail } from "@/lib/inbox/email";

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
      const res = await fetch(body.pdfUrl);
      if (res.ok) {
        pdfBase64 = Buffer.from(await res.arrayBuffer()).toString("base64");
      }
    } catch {
      // fall through
    }
  }
  if (!pdfBase64) {
    return NextResponse.json({ error: "pdfBase64 or pdfUrl is required" }, { status: 400 });
  }

  const fileName =
    body.pdfFileName?.trim() ||
    `${certTitle.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "certificate"}.pdf`;

  try {
    await sendEmail({
      from,
      to: [to],
      subject: `Your certificate: ${certTitle}`,
      text: `Congratulations ${learnerName}!\n\nYou have earned: ${certTitle}\n\nYour certificate PDF is attached.`,
      html: `<p>Congratulations <strong>${learnerName}</strong>!</p><p>You have earned: <strong>${certTitle}</strong>.</p><p>Your certificate PDF is attached.</p>${
        body.badgeUrl
          ? `<p><img src="${body.badgeUrl}" alt="" width="96" height="96" style="border-radius:9999px" /></p>`
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
