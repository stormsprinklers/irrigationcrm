import test from "node:test";
import assert from "node:assert/strict";
import { prepareSmsMediaDelivery } from "../sms-media-delivery";

function media(sizeBytes: number, mimeType = "video/mp4") {
  return {
    blobUrl: "https://store.private.blob.vercel-storage.com/inbox/company-1/sms/outbound/clip.mp4",
    publicUrl: "/api/blob?pathname=inbox%2Fcompany-1%2Fsms%2Foutbound%2Fclip.mp4",
    fileName: "clip.mp4",
    mimeType,
    sizeBytes,
  };
}

test("carrier-sized video stays inline as MMS", () => {
  const previousToken = process.env.TWILIO_AUTH_TOKEN;
  const previousUrl = process.env.NEXT_PUBLIC_APP_URL;
  process.env.TWILIO_AUTH_TOKEN = "test-token";
  process.env.NEXT_PUBLIC_APP_URL = "https://crm.example.com";
  try {
    const result = prepareSmsMediaDelivery({
      companyId: "company-1",
      body: "Small clip",
      media: [media(500 * 1024)],
    });
    assert.equal(result.body, "Small clip");
    assert.equal(result.mediaUrls.length, 1);
    assert.match(result.mediaUrls[0]!, /^https:\/\/crm\.example\.com\/api\/twilio\/mms\/media/);
  } finally {
    if (previousToken === undefined) delete process.env.TWILIO_AUTH_TOKEN;
    else process.env.TWILIO_AUTH_TOKEN = previousToken;
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = previousUrl;
  }
});

test("larger video becomes a signed customer link instead of an unreliable MMS attachment", () => {
  const previousToken = process.env.TWILIO_AUTH_TOKEN;
  const previousUrl = process.env.NEXT_PUBLIC_APP_URL;
  process.env.TWILIO_AUTH_TOKEN = "test-token";
  process.env.NEXT_PUBLIC_APP_URL = "https://crm.example.com";
  try {
    const result = prepareSmsMediaDelivery({
      companyId: "company-1",
      body: "Here is the video",
      media: [media(4 * 1024 * 1024)],
      publicBaseUrl: "https://customers.chestnut.example",
    });
    assert.equal(result.mediaUrls.length, 0);
    assert.equal(result.linkCount, 1);
    assert.match(
      result.body,
      /^Here is the video\n\nView video: https:\/\/customers\.chestnut\.example\//
    );
  } finally {
    if (previousToken === undefined) delete process.env.TWILIO_AUTH_TOKEN;
    else process.env.TWILIO_AUTH_TOKEN = previousToken;
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = previousUrl;
  }
});

test("SMS media cannot reference another company's private blob", () => {
  assert.throws(
    () =>
      prepareSmsMediaDelivery({
        companyId: "company-2",
        body: "Nope",
        media: [media(100)],
      }),
    /does not belong to this company/
  );
});
