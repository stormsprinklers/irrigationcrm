import { getSlackBotToken } from "@/lib/slack/config";

type SlackApiResponse = {
  ok: boolean;
  error?: string;
  upload_url?: string;
  file_id?: string;
  response_metadata?: { messages?: string[] };
};

const SLACK_CHANNEL_ID_PATTERN = /^[CGDZ][A-Z0-9]{8,}$/;

export function normalizeSlackChannelId(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  // Allow pasted values like "#general (C0123...)" — extract the encoded ID.
  const embedded = trimmed.match(/[CGDZ][A-Z0-9]{8,}/i);
  if (embedded) return embedded[0].toUpperCase();

  const withoutHash = trimmed.replace(/^#/, "");
  return withoutHash.toUpperCase();
}

export function validateSlackChannelId(channelId: string) {
  const normalized = normalizeSlackChannelId(channelId);
  if (!normalized) {
    return { ok: false as const, error: "Slack channel ID is required" };
  }
  if (normalized.startsWith("U")) {
    return {
      ok: false as const,
      error:
        "Slack user IDs (U…) are not valid here. Use a channel ID (C…), private channel (G…), or DM channel (D…).",
    };
  }
  if (!SLACK_CHANNEL_ID_PATTERN.test(normalized)) {
    return {
      ok: false as const,
      error:
        "Invalid Slack channel ID. Open the channel in Slack → channel details → copy the ID (starts with C, G, D, or Z).",
    };
  }
  return { ok: true as const, channelId: normalized };
}

function formatSlackError(method: string, data: SlackApiResponse) {
  const details = data.response_metadata?.messages?.filter(Boolean).join("; ");
  const hint =
    data.error === "not_in_channel"
      ? "Invite the Slack bot to the channel"
      : data.error === "missing_scope"
        ? "Bot needs files:write and chat:write scopes"
        : data.error === "invalid_arguments" && details?.includes("channel_id")
          ? "Use a channel ID (C…), not a channel name or user ID (U…)"
          : null;

  const base = data.error ?? `Slack API ${method} failed`;
  const parts = [base];
  if (hint) parts.push(hint);
  if (details) parts.push(details);
  return parts.join(": ");
}

async function slackFormApi<T extends SlackApiResponse>(
  method: string,
  fields: Record<string, string>
): Promise<T> {
  const token = getSlackBotToken();
  if (!token) {
    throw new Error("SLACK_BOT_TOKEN is not configured");
  }

  const body = new URLSearchParams(fields);

  const res = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
    },
    body,
  });

  const data = (await res.json()) as T;
  if (!data.ok) {
    throw new Error(formatSlackError(method, data));
  }
  return data;
}

function sanitizeSlackFileTitle(title: string) {
  return title.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 240) || "Google review";
}

export async function uploadPngToSlackChannel(params: {
  channelId: string;
  buffer: Buffer;
  filename: string;
  title: string;
  initialComment?: string;
}) {
  await uploadPngsToSlackChannel({
    channelId: params.channelId,
    files: [
      {
        buffer: params.buffer,
        filename: params.filename,
        title: params.title,
      },
    ],
    initialComment: params.initialComment,
  });
}

export async function uploadPngsToSlackChannel(params: {
  channelId: string;
  files: Array<{
    buffer: Buffer;
    filename: string;
    title: string;
  }>;
  initialComment?: string;
}) {
  if (params.files.length === 0) {
    throw new Error("At least one file is required");
  }

  const channel = validateSlackChannelId(params.channelId);
  if (!channel.ok) {
    throw new Error(channel.error);
  }

  const uploaded: Array<{ id: string; title: string }> = [];

  for (const file of params.files) {
    const uploadMeta = await slackFormApi<SlackApiResponse & { upload_url: string; file_id: string }>(
      "files.getUploadURLExternal",
      {
        filename: file.filename,
        length: String(file.buffer.length),
      }
    );

    if (!uploadMeta.file_id?.startsWith("F")) {
      throw new Error("Slack did not return a valid file_id for upload");
    }

    const uploadRes = await fetch(uploadMeta.upload_url, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: new Uint8Array(file.buffer),
    });

    if (!uploadRes.ok) {
      throw new Error(`Slack file upload failed (${uploadRes.status})`);
    }

    uploaded.push({
      id: uploadMeta.file_id,
      title: sanitizeSlackFileTitle(file.title),
    });
  }

  const completeFields: Record<string, string> = {
    channel_id: channel.channelId,
    files: JSON.stringify(uploaded),
  };

  const comment = params.initialComment?.trim();
  if (comment) {
    completeFields.initial_comment = comment.slice(0, 3000);
  }

  await slackFormApi("files.completeUploadExternal", completeFields);
}

export async function testSlackAuth() {
  const token = getSlackBotToken();
  if (!token) return { ok: false as const, error: "SLACK_BOT_TOKEN is not configured" };

  const res = await fetch("https://slack.com/api/auth.test", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = (await res.json()) as SlackApiResponse & { team?: string; user?: string };
  if (!data.ok) {
    return { ok: false as const, error: data.error ?? "Slack auth failed" };
  }
  return { ok: true as const, team: data.team ?? null, user: data.user ?? null };
}
