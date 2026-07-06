import { getSlackBotToken } from "@/lib/slack/config";

type SlackApiResponse = {
  ok: boolean;
  error?: string;
  upload_url?: string;
  file_id?: string;
};

async function slackApi<T extends SlackApiResponse>(
  method: string,
  body: Record<string, unknown>
): Promise<T> {
  const token = getSlackBotToken();
  if (!token) {
    throw new Error("SLACK_BOT_TOKEN is not configured");
  }

  const res = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  });

  const data = (await res.json()) as T;
  if (!data.ok) {
    throw new Error(data.error ?? `Slack API ${method} failed`);
  }
  return data;
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

  const uploaded: Array<{ id: string; title: string }> = [];

  for (const file of params.files) {
    const uploadMeta = await slackApi<SlackApiResponse & { upload_url: string; file_id: string }>(
      "files.getUploadURLExternal",
      {
        filename: file.filename,
        length: file.buffer.length,
      }
    );

    const uploadRes = await fetch(uploadMeta.upload_url, {
      method: "POST",
      headers: { "Content-Type": "image/png" },
      body: new Uint8Array(file.buffer),
    });

    if (!uploadRes.ok) {
      throw new Error(`Slack file upload failed (${uploadRes.status})`);
    }

    uploaded.push({ id: uploadMeta.file_id, title: file.title });
  }

  await slackApi("files.completeUploadExternal", {
    files: uploaded,
    channel_id: params.channelId,
    initial_comment: params.initialComment,
  });
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
