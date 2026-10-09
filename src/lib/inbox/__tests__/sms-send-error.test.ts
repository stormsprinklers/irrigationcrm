import test from "node:test";
import assert from "node:assert/strict";
import {
  describeSmsSendError,
  SmsSentButNotRecordedError,
} from "../sms-send-error";

test("turns Twilio opt-out errors into a short actionable message", () => {
  const error = Object.assign(new Error("A very long provider response"), {
    code: 21610,
    status: 400,
    moreInfo: "https://www.twilio.com/docs/errors/21610",
  });

  assert.deepEqual(describeSmsSendError(error), {
    error:
      "This recipient opted out of SMS. They must reply START before another message can be sent.",
    code: "TWILIO_21610",
    status: 400,
  });
});

test("never exposes an unknown database exception to the inbox", () => {
  const error = Object.assign(
    new Error("Invalid prisma.message.create invocation with several pages of internal detail"),
    { code: "P2022" }
  );

  assert.deepEqual(describeSmsSendError(error), {
    error:
      "Radar could not send this message. Try again, and contact an administrator if it keeps happening.",
    code: "SMS_SEND_FAILED",
    status: 500,
  });
});

test("warns against retrying when Twilio accepted a message that Radar did not save", () => {
  const error = new SmsSentButNotRecordedError(
    "SM123",
    new Error("Database column is missing")
  );

  assert.deepEqual(describeSmsSendError(error), {
    error:
      "The text was sent, but Radar could not save it in the conversation. Refresh the thread before trying again.",
    code: "SMS_SENT_NOT_RECORDED",
    status: 500,
  });
});
