import type { SessionUser } from "@/lib/api-auth";
import { uploadPrivateBlob } from "@/lib/blob/storage";
import { blobProxyUrl } from "@/lib/blob/urls";
import { prisma } from "@/lib/prisma";
import type { StormAiStoredAttachment } from "./attachments";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

function parseDataUrl(dataUrl: string): { mimeType: string; buffer: Buffer } | null {
  const match = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl.trim());
  if (!match) return null;
  const mimeType = match[1]!.toLowerCase();
  if (!ALLOWED.has(mimeType)) return null;
  try {
    const buffer = Buffer.from(match[2]!, "base64");
    if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) return null;
    return { mimeType, buffer };
  } catch {
    return null;
  }
}

/** Prefer explicit visitId; otherwise the tech's active field job. */
export async function resolveVisitIdForStormAiFrame(
  user: SessionUser,
  visitId?: string | null
): Promise<string | null> {
  if (visitId) {
    const visit = await prisma.visit.findFirst({
      where: { id: visitId, companyId: user.companyId },
      select: { id: true },
    });
    return visit?.id ?? null;
  }

  const active = await prisma.visit.findFirst({
    where: {
      companyId: user.companyId,
      assignedUserId: user.id,
      status: { in: ["IN_PROGRESS", "EN_ROUTE", "PAUSED"] },
    },
    orderBy: [{ startAt: "desc" }],
    select: { id: true },
  });
  return active?.id ?? null;
}

export async function storeStormAiRealtimeFrame(opts: {
  user: SessionUser;
  conversationId: string;
  dataUrl: string;
  visitId?: string | null;
  fileName?: string;
}) {
  const conversation = await prisma.stormAiConversation.findFirst({
    where: {
      id: opts.conversationId,
      userId: opts.user.id,
      companyId: opts.user.companyId,
    },
    select: { id: true },
  });
  if (!conversation) {
    return { error: "Conversation not found" as const, status: 404 as const };
  }

  const parsed = parseDataUrl(opts.dataUrl);
  if (!parsed) {
    return {
      error: "Invalid image (use JPEG/PNG/WebP under 8MB)" as const,
      status: 400 as const,
    };
  }

  const ext =
    parsed.mimeType === "image/png" ? "png" : parsed.mimeType === "image/webp" ? "webp" : "jpg";
  const fileName = (opts.fileName || `storm-ai-frame-${Date.now()}.${ext}`).replace(
    /[^a-zA-Z0-9._-]/g,
    "_"
  );

  const resolvedVisitId = await resolveVisitIdForStormAiFrame(opts.user, opts.visitId);

  let visitAttachment: {
    id: string;
    visitId: string;
    fileName: string;
    mimeType: string;
    url: string;
  } | null = null;

  if (resolvedVisitId) {
    const visitBlob = await uploadPrivateBlob(
      `visits/${opts.user.companyId}/${resolvedVisitId}/${Date.now()}-${fileName}`,
      parsed.buffer,
      { contentType: parsed.mimeType }
    );
    const row = await prisma.visitAttachment.create({
      data: {
        visitId: resolvedVisitId,
        uploadedById: opts.user.id,
        blobUrl: visitBlob.url,
        fileName,
        mimeType: parsed.mimeType,
      },
      select: { id: true, visitId: true, fileName: true, mimeType: true, blobUrl: true },
    });
    visitAttachment = {
      id: row.id,
      visitId: row.visitId,
      fileName: row.fileName,
      mimeType: row.mimeType,
      url: blobProxyUrl(row.blobUrl) ?? row.blobUrl,
    };
  }

  const chatBlob = await uploadPrivateBlob(
    `storm-ai/${opts.user.companyId}/${opts.conversationId}/${Date.now()}-${fileName}`,
    parsed.buffer,
    { contentType: parsed.mimeType }
  );
  const pathname =
    "pathname" in chatBlob && typeof chatBlob.pathname === "string"
      ? chatBlob.pathname
      : chatBlob.url.replace(/^https?:\/\/[^/]+\//, "");

  const stored: StormAiStoredAttachment = {
    blobUrl: chatBlob.url,
    pathname,
    fileName,
    mimeType: parsed.mimeType,
    kind: "image",
  };

  await prisma.stormAiMessage.create({
    data: {
      conversationId: opts.conversationId,
      userId: opts.user.id,
      role: "user",
      content: resolvedVisitId
        ? `[Camera frame captured for AI — also saved to job ${resolvedVisitId}]`
        : "[Camera frame captured for AI — no active job to attach to]",
      attachmentsJson: [stored] as never,
    },
  });

  return {
    ok: true as const,
    visitId: resolvedVisitId,
    visitAttachment,
    savedToJob: Boolean(visitAttachment),
  };
}
