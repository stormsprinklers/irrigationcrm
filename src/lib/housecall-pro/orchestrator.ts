import {
  HousecallProMigrationStatus,
  HousecallProMigrationStepStatus,
  HousecallProMigrationStepType,
  Prisma,
  UserRole,
} from "@prisma/client";
import {
  ATTACHMENT_BATCH_SIZE,
  DEFAULT_BATCH_SIZE,
  MIGRATION_STEP_ORDER,
  nextStep,
} from "@/lib/housecall-pro/constants";
import { createHousecallProClient } from "@/lib/housecall-pro/client";
import { runStepBatch } from "@/lib/housecall-pro/importers";
import { fetchPreviewCounts } from "@/lib/housecall-pro/preview";
import type { MigrationOptions } from "@/lib/housecall-pro/types";
import { prisma } from "@/lib/prisma";

function attachmentStep(step: HousecallProMigrationStepType) {
  return (
    step === HousecallProMigrationStepType.CUSTOMER_ATTACHMENTS ||
    step === HousecallProMigrationStepType.JOB_ATTACHMENTS ||
    step === HousecallProMigrationStepType.ESTIMATE_ATTACHMENTS
  );
}

function defaultBatchSize(step: HousecallProMigrationStepType) {
  return attachmentStep(step) ? ATTACHMENT_BATCH_SIZE : DEFAULT_BATCH_SIZE;
}

export async function getOrCreateMigration(companyId: string) {
  const existing = await prisma.housecallProMigration.findFirst({
    where: {
      companyId,
      status: {
        in: [
          HousecallProMigrationStatus.DRAFT,
          HousecallProMigrationStatus.IN_PROGRESS,
          HousecallProMigrationStatus.PAUSED,
        ],
      },
    },
    include: { steps: { orderBy: { step: "asc" } } },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return existing;

  const migration = await prisma.housecallProMigration.create({
    data: {
      companyId,
      status: HousecallProMigrationStatus.DRAFT,
      currentStep: HousecallProMigrationStepType.CONNECT,
      steps: {
        create: MIGRATION_STEP_ORDER.map((step) => ({
          step,
          status:
            step === HousecallProMigrationStepType.CONNECT
              ? HousecallProMigrationStepStatus.PENDING
              : HousecallProMigrationStepStatus.PENDING,
        })),
      },
    },
    include: { steps: { orderBy: { step: "asc" } } },
  });
  return migration;
}

export async function startMigration(companyId: string) {
  const client = createHousecallProClient();
  const preview = await fetchPreviewCounts(client);
  const migration = await getOrCreateMigration(companyId);

  const updated = await prisma.housecallProMigration.update({
    where: { id: migration.id },
    data: {
      status: HousecallProMigrationStatus.IN_PROGRESS,
      currentStep: HousecallProMigrationStepType.TAGS,
      previewJson: preview,
      startedAt: migration.startedAt ?? new Date(),
      steps: {
        updateMany: {
          where: { migrationId: migration.id, step: HousecallProMigrationStepType.CONNECT },
          data: {
            status: HousecallProMigrationStepStatus.COMPLETED,
            completedAt: new Date(),
            processed: 1,
          },
        },
      },
    },
    include: { steps: { orderBy: { step: "asc" } } },
  });

  return updated;
}

export async function pauseMigration(companyId: string) {
  const migration = await prisma.housecallProMigration.findFirst({
    where: {
      companyId,
      status: {
        in: [HousecallProMigrationStatus.IN_PROGRESS, HousecallProMigrationStatus.DRAFT],
      },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!migration) throw new Error("No active migration");

  await prisma.housecallProMigrationStep.updateMany({
    where: {
      migrationId: migration.id,
      step: migration.currentStep,
      status: HousecallProMigrationStepStatus.RUNNING,
    },
    data: { status: HousecallProMigrationStepStatus.PAUSED },
  });

  return prisma.housecallProMigration.update({
    where: { id: migration.id },
    data: {
      status: HousecallProMigrationStatus.PAUSED,
      pausedAt: new Date(),
    },
    include: { steps: { orderBy: { step: "asc" } } },
  });
}

export async function resumeMigration(companyId: string) {
  const migration = await prisma.housecallProMigration.findFirst({
    where: { companyId, status: HousecallProMigrationStatus.PAUSED },
    orderBy: { createdAt: "desc" },
  });
  if (!migration) throw new Error("No paused migration");

  return prisma.housecallProMigration.update({
    where: { id: migration.id },
    data: {
      status: HousecallProMigrationStatus.IN_PROGRESS,
      pausedAt: null,
    },
    include: { steps: { orderBy: { step: "asc" } } },
  });
}

export async function advanceMigrationStep(companyId: string) {
  const migration = await prisma.housecallProMigration.findFirst({
    where: {
      companyId,
      status: {
        in: [HousecallProMigrationStatus.IN_PROGRESS, HousecallProMigrationStatus.PAUSED],
      },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!migration) throw new Error("No active migration");

  const currentStepRow = await prisma.housecallProMigrationStep.findUnique({
    where: {
      migrationId_step: { migrationId: migration.id, step: migration.currentStep },
    },
  });
  if (
    currentStepRow &&
    currentStepRow.status !== HousecallProMigrationStepStatus.COMPLETED &&
    currentStepRow.status !== HousecallProMigrationStepStatus.SKIPPED
  ) {
    throw new Error("Current step is not complete");
  }

  const following = nextStep(migration.currentStep);
  if (!following) {
    return prisma.housecallProMigration.update({
      where: { id: migration.id },
      data: {
        status: HousecallProMigrationStatus.COMPLETED,
        completedAt: new Date(),
      },
      include: { steps: { orderBy: { step: "asc" } } },
    });
  }

  return prisma.housecallProMigration.update({
    where: { id: migration.id },
    data: {
      currentStep: following,
      status: HousecallProMigrationStatus.IN_PROGRESS,
      pausedAt: null,
    },
    include: { steps: { orderBy: { step: "asc" } } },
  });
}

export async function resetMigrationStep(
  companyId: string,
  step: HousecallProMigrationStepType
) {
  const migration = await prisma.housecallProMigration.findFirst({
    where: { companyId },
    orderBy: { createdAt: "desc" },
  });
  if (!migration) throw new Error("No migration found");

  await prisma.housecallProMigrationStep.update({
    where: { migrationId_step: { migrationId: migration.id, step } },
    data: {
      status: HousecallProMigrationStepStatus.PENDING,
      cursor: null,
      processed: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      lastError: null,
      statsJson: Prisma.DbNull,
      startedAt: null,
      completedAt: null,
    },
  });

  return prisma.housecallProMigration.update({
    where: { id: migration.id },
    data: { currentStep: step, status: HousecallProMigrationStatus.IN_PROGRESS },
    include: { steps: { orderBy: { step: "asc" } } },
  });
}

export async function skipMigrationStep(companyId: string, step: HousecallProMigrationStepType) {
  const migration = await prisma.housecallProMigration.findFirst({
    where: { companyId },
    orderBy: { createdAt: "desc" },
  });
  if (!migration) throw new Error("No migration found");

  await prisma.housecallProMigrationStep.update({
    where: { migrationId_step: { migrationId: migration.id, step } },
    data: {
      status: HousecallProMigrationStepStatus.SKIPPED,
      completedAt: new Date(),
    },
  });

  if (migration.currentStep === step) {
    const following = nextStep(step);
    if (following) {
      return prisma.housecallProMigration.update({
        where: { id: migration.id },
        data: { currentStep: following },
        include: { steps: { orderBy: { step: "asc" } } },
      });
    }
  }

  return prisma.housecallProMigration.findUnique({
    where: { id: migration.id },
    include: { steps: { orderBy: { step: "asc" } } },
  });
}

export async function processMigrationBatch(params: {
  companyId: string;
  adminUserId: string;
  step: HousecallProMigrationStepType;
}) {
  const migration = await prisma.housecallProMigration.findFirst({
    where: {
      companyId: params.companyId,
      status: {
        in: [HousecallProMigrationStatus.IN_PROGRESS, HousecallProMigrationStatus.PAUSED],
      },
    },
    include: { steps: true },
    orderBy: { createdAt: "desc" },
  });
  if (!migration) throw new Error("No active migration");
  if (migration.status === HousecallProMigrationStatus.PAUSED) {
    throw new Error("Migration is paused");
  }
  if (migration.currentStep !== params.step) {
    throw new Error(`Active step is ${migration.currentStep}`);
  }
  if (params.step === HousecallProMigrationStepType.CONNECT) {
    throw new Error("Connect step is completed during start");
  }

  const stepRow = migration.steps.find((s) => s.step === params.step);
  if (!stepRow) throw new Error("Step not found");
  if (stepRow.status === HousecallProMigrationStepStatus.COMPLETED) {
    return {
      done: true,
      step: params.step,
      processed: stepRow.processed,
      created: stepRow.created,
      updated: stepRow.updated,
      skipped: stepRow.skipped,
      failed: stepRow.failed,
      errors: [],
      cursor: stepRow.cursor,
    };
  }

  const options = (migration.optionsJson as MigrationOptions | null) ?? {};
  const client = createHousecallProClient();

  await prisma.housecallProMigrationStep.update({
    where: { id: stepRow.id },
    data: {
      status: HousecallProMigrationStepStatus.RUNNING,
      startedAt: stepRow.startedAt ?? new Date(),
    },
  });

  let batchResult;
  try {
    batchResult = await runStepBatch({
      companyId: params.companyId,
      migrationId: migration.id,
      step: params.step,
      cursor: stepRow.cursor,
      batchSize: options.batchSize ?? defaultBatchSize(params.step),
      options,
      client,
      adminUserId: params.adminUserId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Batch failed";
    await prisma.housecallProMigrationStep.update({
      where: { id: stepRow.id },
      data: {
        status: HousecallProMigrationStepStatus.FAILED,
        lastError: message,
      },
    });
    await prisma.housecallProMigration.update({
      where: { id: migration.id },
      data: { status: HousecallProMigrationStatus.FAILED },
    });
    throw err;
  }

  const nextStatus = batchResult.done
    ? HousecallProMigrationStepStatus.COMPLETED
    : HousecallProMigrationStepStatus.RUNNING;

  const recentErrors = batchResult.errors.slice(0, 20);
  await prisma.housecallProMigrationStep.update({
    where: { id: stepRow.id },
    data: {
      status: nextStatus,
      cursor: batchResult.cursor,
      processed: { increment: batchResult.processed },
      created: { increment: batchResult.created },
      updated: { increment: batchResult.updated },
      skipped: { increment: batchResult.skipped },
      failed: { increment: batchResult.failed },
      completedAt: batchResult.done ? new Date() : null,
      lastError: recentErrors[0] ?? null,
      statsJson: { recentErrors },
    },
  });

  if (batchResult.done) {
    const following = nextStep(params.step);
    if (!following) {
      await prisma.housecallProMigration.update({
        where: { id: migration.id },
        data: {
          status: HousecallProMigrationStatus.COMPLETED,
          completedAt: new Date(),
        },
      });
    }
  }

  return batchResult;
}

export async function refreshPreview(companyId: string) {
  const client = createHousecallProClient();
  const preview = await fetchPreviewCounts(client);
  const migration = await prisma.housecallProMigration.findFirst({
    where: { companyId },
    orderBy: { createdAt: "desc" },
  });
  if (migration) {
    await prisma.housecallProMigration.update({
      where: { id: migration.id },
      data: { previewJson: preview },
    });
  }
  return preview;
}

export function requireAdmin(role: string) {
  if (role !== UserRole.ADMIN) {
    throw new Error("Admin access required");
  }
}

export function isApiKeyConfigured() {
  return Boolean(process.env.HOUSECALL_PRO_API_KEY);
}
