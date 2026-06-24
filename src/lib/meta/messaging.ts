import { Channel, MessageDirection, Scope } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolvePageAccessToken } from "@/lib/meta/token";
import type { SocialScope } from "@/lib/inbox/types";

const GRAPH_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

export type SocialPlatform = SocialScope;

export function socialScopeToChannel(platform: SocialPlatform): Channel {
  return platform === "facebook" ? Channel.FACEBOOK : Channel.INSTAGRAM;
}

export function channelToSocialPlatform(channel: Channel): SocialPlatform | null {
  if (channel === Channel.FACEBOOK) return "facebook";
  if (channel === Channel.INSTAGRAM) return "instagram";
  return null;
}

type MetaMessagingEvent = {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
    attachments?: Array<{ type?: string; payload?: { url?: string } }>;
  };
};

export async function getCompanyMetaCredentials(companyId: string) {
  return prisma.company.findUnique({
    where: { id: companyId },
    select: {
      metaPageId: true,
      metaInstagramAccountId: true,
      metaPageAccessToken: true,
      metaAppId: true,
      metaAppSecret: true,
    },
  });
}

async function resolveToken(companyId: string) {
  const company = await getCompanyMetaCredentials(companyId);
  if (!company?.metaPageId || !company.metaPageAccessToken) {
    throw new Error("Meta Page is not configured");
  }

  const resolved = await resolvePageAccessToken({
    token: company.metaPageAccessToken,
    pageId: company.metaPageId,
    appId: company.metaAppId,
    appSecret: company.metaAppSecret,
  });

  return { company, pageToken: resolved.pageToken };
}

export async function fetchMetaParticipantProfile(params: {
  participantId: string;
  pageToken: string;
  platform: SocialPlatform;
}) {
  try {
    const fields = params.platform === "instagram" ? "name,username,profile_pic" : "name,profile_pic";
    const url = new URL(`${GRAPH_BASE}/${params.participantId}`);
    url.searchParams.set("fields", fields);
    url.searchParams.set("access_token", params.pageToken);

    const res = await fetch(url.toString(), { cache: "no-store" });
    const data = (await res.json()) as {
      name?: string;
      username?: string;
      profile_pic?: string;
      error?: { message?: string };
    };

    if (!res.ok || data.error) return null;

    const displayName =
      params.platform === "instagram"
        ? data.username
          ? `@${data.username}`
          : data.name ?? null
        : data.name ?? null;

    return { name: displayName, profilePic: data.profile_pic ?? null };
  } catch {
    return null;
  }
}

export async function findOrCreateSocialConversation(params: {
  companyId: string;
  platform: SocialPlatform;
  participantMetaId: string;
  title?: string | null;
}) {
  const channel = socialScopeToChannel(params.platform);
  const existing = await prisma.conversation.findFirst({
    where: {
      companyId: params.companyId,
      channel,
      participantMetaId: params.participantMetaId,
    },
  });

  if (existing) {
    if (params.title && !existing.title) {
      return prisma.conversation.update({
        where: { id: existing.id },
        data: { title: params.title },
      });
    }
    return existing;
  }

  return prisma.conversation.create({
    data: {
      companyId: params.companyId,
      channel,
      scope: Scope.EXTERNAL,
      participantMetaId: params.participantMetaId,
      title: params.title ?? null,
    },
  });
}

async function storeSocialMessage(params: {
  conversationId: string;
  metaMessageId: string;
  direction: MessageDirection;
  body: string;
  senderId?: string;
  sentAt: Date;
  mediaUrls?: string[];
}) {
  const existing = await prisma.message.findUnique({
    where: { metaMessageId: params.metaMessageId },
  });
  if (existing) return existing;

  const message = await prisma.message.create({
    data: {
      conversationId: params.conversationId,
      direction: params.direction,
      body: params.body,
      metaMessageId: params.metaMessageId,
      senderId: params.senderId,
      sentAt: params.sentAt,
      ...(params.mediaUrls?.length
        ? {
            media: {
              create: params.mediaUrls.map((url, index) => ({
                blobUrl: url,
                mimeType: "application/octet-stream",
                fileName: `attachment-${index + 1}`,
              })),
            },
          }
        : {}),
    },
  });

  await prisma.conversation.update({
    where: { id: params.conversationId },
    data: { lastMessageAt: params.sentAt },
  });

  return message;
}

function messageBodyFromEvent(message: NonNullable<MetaMessagingEvent["message"]>) {
  if (message.text?.trim()) return message.text.trim();
  const attachment = message.attachments?.[0];
  if (attachment?.type) {
    const label = attachment.type.replace(/_/g, " ");
    return attachment.payload?.url ? `[${label}] ${attachment.payload.url}` : `[${label}]`;
  }
  return "[Message]";
}

export async function ingestMetaMessagingEvent(params: {
  companyId: string;
  platform: SocialPlatform;
  pageId: string;
  event: MetaMessagingEvent;
}) {
  const message = params.event.message;
  if (!message?.mid) return null;

  const { pageToken } = await resolveToken(params.companyId);

  const isEcho = Boolean(message.is_echo);
  const participantId = isEcho ? params.event.recipient?.id : params.event.sender?.id;
  if (!participantId) return null;

  let title: string | null = null;
  const profile = await fetchMetaParticipantProfile({
    participantId,
    pageToken,
    platform: params.platform,
  });
  title = profile?.name ?? (params.platform === "instagram" ? "Instagram user" : "Facebook user");

  const conversation = await findOrCreateSocialConversation({
    companyId: params.companyId,
    platform: params.platform,
    participantMetaId: participantId,
    title,
  });

  const mediaUrls =
    message.attachments
      ?.map((item) => item.payload?.url)
      .filter((url): url is string => Boolean(url)) ?? [];

  return storeSocialMessage({
    conversationId: conversation.id,
    metaMessageId: message.mid,
    direction: isEcho ? MessageDirection.OUTBOUND : MessageDirection.INBOUND,
    body: messageBodyFromEvent(message),
    sentAt: params.event.timestamp ? new Date(params.event.timestamp) : new Date(),
    mediaUrls,
  });
}

export async function processMetaMessagingWebhook(body: {
  object?: string;
  entry?: Array<{
    id?: string;
    messaging?: MetaMessagingEvent[];
  }>;
}) {
  const platform: SocialPlatform | null =
    body.object === "page" ? "facebook" : body.object === "instagram" ? "instagram" : null;
  if (!platform) return [];

  const processed: string[] = [];

  for (const entry of body.entry ?? []) {
    const entryId = entry.id;
    if (!entryId) continue;

    const company = await prisma.company.findFirst({
      where: {
        OR: [{ metaPageId: entryId }, { metaInstagramAccountId: entryId }],
      },
      select: { id: true, metaPageId: true },
    });
    if (!company) continue;

    for (const event of entry.messaging ?? []) {
      try {
        await ingestMetaMessagingEvent({
          companyId: company.id,
          platform,
          pageId: company.metaPageId ?? entryId,
          event,
        });
        processed.push(company.id);
      } catch (err) {
        console.error("Meta messaging ingest failed:", err);
      }
    }
  }

  return [...new Set(processed)];
}

export async function sendSocialDm(params: {
  companyId: string;
  platform: SocialPlatform;
  participantMetaId: string;
  body: string;
  senderUserId: string;
  conversationId?: string;
}) {
  const text = params.body.trim();
  if (!text) throw new Error("Message body required");

  const { pageToken } = await resolveToken(params.companyId);

  const url = new URL(`${GRAPH_BASE}/me/messages`);
  url.searchParams.set("access_token", pageToken);

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { id: params.participantMetaId },
      message: { text },
      messaging_type: "RESPONSE",
    }),
  });

  const data = (await res.json()) as { message_id?: string; error?: { message?: string } };
  if (!res.ok || data.error) {
    throw new Error(data.error?.message ?? "Failed to send Meta message");
  }

  const conversation =
    params.conversationId
      ? await prisma.conversation.findFirst({
          where: {
            id: params.conversationId,
            companyId: params.companyId,
            channel: socialScopeToChannel(params.platform),
          },
        })
      : null;

  const thread =
    conversation ??
    (await findOrCreateSocialConversation({
      companyId: params.companyId,
      platform: params.platform,
      participantMetaId: params.participantMetaId,
    }));

  const metaMessageId = data.message_id ?? `local-${Date.now()}`;

  const message = await storeSocialMessage({
    conversationId: thread.id,
    metaMessageId,
    direction: MessageDirection.OUTBOUND,
    body: text,
    senderId: params.senderUserId,
    sentAt: new Date(),
  });

  return { conversation: thread, message };
}
