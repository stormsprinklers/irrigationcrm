import test from "node:test";
import assert from "node:assert/strict";
import {
  INBOUND_SMS_MEDIA_MAX_BYTES,
  missingTwilioMediaItems,
  normalizeInboundTwilioMedia,
  parseTwilioMediaParams,
  twilioMediaAuthCandidates,
} from "../twilio-media";
import { isBrowserImageMimeType } from "../attachments";

test("inbound MMS limit accommodates full-resolution phone photos", () => {
  assert.equal(INBOUND_SMS_MEDIA_MAX_BYTES, 25 * 1024 * 1024);
});

test("Twilio media parsing preserves provider indexes for retry recovery", () => {
  assert.deepEqual(
    parseTwilioMediaParams({
      NumMedia: "2",
      MediaUrl0: "https://api.twilio.com/media/ME0",
      MediaContentType0: "image/jpeg",
      MediaUrl1: "https://api.twilio.com/media/ME1",
      MediaContentType1: "image/heic",
    }),
    [
      { url: "https://api.twilio.com/media/ME0", contentType: "image/jpeg", index: 0 },
      { url: "https://api.twilio.com/media/ME1", contentType: "image/heic", index: 1 },
    ]
  );
});

test("retried MMS webhooks resume only missing media indexes", () => {
  const items = [
    { index: 0, url: "zero" },
    { index: 1, url: "one" },
    { index: 2, url: "two" },
  ];
  assert.deepEqual(missingTwilioMediaItems(items, ["media-0.jpg", "media-2.png"]), [
    { index: 1, url: "one" },
  ]);
});

test("Twilio media authentication prefers dedicated and general API keys", () => {
  assert.deepEqual(
    twilioMediaAuthCandidates({
      TWILIO_MEDIA_API_KEY: "SK-media",
      TWILIO_MEDIA_API_SECRET: "media-secret",
      TWILIO_API_KEY: "SK-general",
      TWILIO_API_SECRET: "general-secret",
      TWILIO_ACCOUNT_SID: "AC-account",
      TWILIO_AUTH_TOKEN: "auth-token",
    }).map((item) => item.source),
    ["media-api-key", "api-key", "account-token"]
  );
});

test("HEIC and HEIF media are converted to browser-safe JPEG", async () => {
  let calls = 0;
  const fakeConverter = async () => {
    calls += 1;
    return new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  };
  for (const mimeType of ["image/heic", "image/heif; charset=binary"]) {
    const result = await normalizeInboundTwilioMedia(
      Buffer.from([0, 1, 2]),
      mimeType,
      fakeConverter
    );
    assert.equal(result.mimeType, "image/jpeg");
    assert.equal(result.converted, true);
    assert.deepEqual(result.buffer, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  }
  assert.equal(calls, 2);
});

test("unsupported browser image formats render as downloads if conversion falls back", () => {
  assert.equal(isBrowserImageMimeType("image/jpeg"), true);
  assert.equal(isBrowserImageMimeType("image/webp"), true);
  assert.equal(isBrowserImageMimeType("image/heic"), false);
  assert.equal(isBrowserImageMimeType("image/tiff"), false);
});
