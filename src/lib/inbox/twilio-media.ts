import { uploadPrivateBlob } from "@/lib/blob/storage";
import { safeFileName } from "@/lib/inbox/attachments";

export async function downloadTwilioMedia(params: {
  mediaUrl: string;
  companyId: string;
  messageId: string;
  mimeType: string;
  index: number;
}) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    throw new Error("Twilio credentials not configured");
  }

  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const res = await fetch(params.mediaUrl, {
    headers: { Authorization: `Basic ${auth}` },
  });

  if (!res.ok) {
    throw new Error(`Failed to download Twilio media (${res.status})`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  const ext = params.mimeType.split("/")[1]?.split(";")[0] ?? "bin";
  const fileName = `media-${params.index}.${ext}`;

  const blob = await uploadPrivateBlob(
    `inbox/${params.companyId}/sms/${params.messageId}/${Date.now()}-${safeFileName(fileName)}`,
    buffer,
    { contentType: params.mimeType }
  );

  return {
    blobUrl: blob.url,
    fileName,
    mimeType: params.mimeType,
    sizeBytes: buffer.length,
  };
}

export function parseTwilioMediaParams(params: Record<string, string>) {
  const count = Number(params.NumMedia ?? "0");
  if (!count || count <= 0) return [];

  const items: { url: string; contentType: string }[] = [];
  for (let i = 0; i < count; i++) {
    const url = params[`MediaUrl${i}`];
    const contentType = params[`MediaContentType${i}`] ?? "application/octet-stream";
    if (url) items.push({ url, contentType });
  }
  return items;
}
