import {
  PipelineConversionDeliveryStatus,
  PipelineConversionPlatform,
  Prisma,
} from "@prisma/client";
import { sendGooglePipelineEvent } from "@/lib/google-ads/data-manager";
import { sendMetaPipelineEvent } from "@/lib/meta/conversions-api";
import { prisma } from "@/lib/prisma";

const LEASE_MS = 2 * 60 * 1000;
const MAX_BACKOFF_MS = 24 * 60 * 60 * 1000;

function retryDelayMs(attempts: number, configurationMissing = false) {
  if (configurationMissing) return 6 * 60 * 60 * 1000;
  const exponential = Math.min(MAX_BACKOFF_MS, 60_000 * 2 ** Math.min(attempts, 10));
  return exponential + Math.floor(Math.random() * 30_000);
}

function message(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 2000) : "Conversion delivery failed";
}

function isConfigurationError(error: unknown) {
  const value = message(error).toLowerCase();
  return /not linked|not configured|access token|dataset/.test(value);
}

async function deliver(
  platform: PipelineConversionPlatform,
  event: Prisma.PipelineConversionEventGetPayload<Record<string, never>>
) {
  if (platform === "GOOGLE") {
    return sendGooglePipelineEvent({ companyId: event.companyId, event });
  }

  const company = await prisma.company.findUnique({
    where: { id: event.companyId },
    select: {
      metaConversionsAccessToken: true,
      metaConversionsDatasetId: true,
      metaConversionsTestEventCode: true,
    },
  });
  if (!company?.metaConversionsAccessToken || !company.metaConversionsDatasetId) {
    throw new Error("Meta Conversions API access token and dataset are not configured");
  }
  return sendMetaPipelineEvent({
    event,
    accessToken: company.metaConversionsAccessToken,
    datasetId: company.metaConversionsDatasetId,
    testEventCode: company.metaConversionsTestEventCode,
  });
}

export async function requeueCompanyPipelineDeliveries(
  companyId: string,
  platform?: PipelineConversionPlatform
) {
  const result = await prisma.pipelineConversionDelivery.updateMany({
    where: {
      event: { companyId },
      ...(platform ? { platform } : {}),
      status: { not: PipelineConversionDeliveryStatus.SENT },
    },
    data: {
      status: PipelineConversionDeliveryStatus.PENDING,
      nextAttemptAt: new Date(),
      leaseUntil: null,
      lastError: null,
    },
  });
  return result.count;
}

export async function processPipelineConversionDeliveries(limit = 50) {
  const now = new Date();
  const candidates = await prisma.pipelineConversionDelivery.findMany({
    where: {
      OR: [
        {
          status: { in: [PipelineConversionDeliveryStatus.PENDING, PipelineConversionDeliveryStatus.FAILED] },
          nextAttemptAt: { lte: now },
        },
        {
          status: PipelineConversionDeliveryStatus.PROCESSING,
          leaseUntil: { lte: now },
        },
      ],
    },
    include: { event: true },
    orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
    take: Math.max(1, Math.min(limit, 200)),
  });

  let sent = 0;
  let failed = 0;
  for (const candidate of candidates) {
    const leaseUntil = new Date(Date.now() + LEASE_MS);
    const claimed = await prisma.pipelineConversionDelivery.updateMany({
      where: {
        id: candidate.id,
        OR: [
          {
            status: { in: [PipelineConversionDeliveryStatus.PENDING, PipelineConversionDeliveryStatus.FAILED] },
            nextAttemptAt: { lte: now },
          },
          {
            status: PipelineConversionDeliveryStatus.PROCESSING,
            leaseUntil: { lte: now },
          },
        ],
      },
      data: {
        status: PipelineConversionDeliveryStatus.PROCESSING,
        leaseUntil,
        attempts: { increment: 1 },
      },
    });
    if (claimed.count === 0) continue;

    try {
      const result = await deliver(candidate.platform, candidate.event);
      await prisma.pipelineConversionDelivery.update({
        where: { id: candidate.id },
        data: {
          status: PipelineConversionDeliveryStatus.SENT,
          sentAt: new Date(),
          leaseUntil: null,
          lastError: null,
          providerRequestId: result.requestId,
          responseMetadata: result.metadata as Prisma.InputJsonValue,
        },
      });
      sent += 1;
    } catch (error) {
      const configurationMissing = isConfigurationError(error);
      await prisma.pipelineConversionDelivery.update({
        where: { id: candidate.id },
        data: {
          status: PipelineConversionDeliveryStatus.FAILED,
          leaseUntil: null,
          lastError: message(error),
          nextAttemptAt: new Date(
            Date.now() + retryDelayMs(candidate.attempts + 1, configurationMissing)
          ),
        },
      });
      failed += 1;
    }
  }

  return { examined: candidates.length, sent, failed };
}
