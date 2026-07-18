import { prisma } from "@/lib/prisma";
import { formatEstimateOptionNumber, optionLetterForIndex } from "@/lib/estimates/numbering";
import { computeTotals, sumDiscounts, sumLineItems, toNumber } from "@/lib/visits/totals";

/** Ensure estimate has at least one option; migrate orphan line items onto it. */
export async function ensureEstimateOptions(estimateId: string) {
  const estimate = await prisma.estimate.findUnique({
    where: { id: estimateId },
    include: {
      options: { orderBy: { sortOrder: "asc" } },
      lineItems: true,
      discounts: true,
    },
  });
  if (!estimate) return null;

  if (!estimate.estimateNumber) {
    const { allocateEstimateNumber } = await import("@/lib/estimates/numbering");
    const estimateNumber = await allocateEstimateNumber(estimate.companyId);
    await prisma.estimate.update({
      where: { id: estimateId },
      data: { estimateNumber },
    });
  }

  if (estimate.options.length === 0) {
    const option = await prisma.estimateOption.create({
      data: {
        estimateId,
        letter: null,
        label: "Option",
        sortOrder: 0,
        subtotal: estimate.subtotal,
        discountTotal: estimate.discountTotal,
        total: estimate.total,
      },
    });

    const orphanItems = estimate.lineItems.filter((item) => !item.optionId);
    if (orphanItems.length) {
      await prisma.estimateLineItem.updateMany({
        where: { id: { in: orphanItems.map((i) => i.id) } },
        data: { optionId: option.id },
      });
    }

    const orphanDiscounts = estimate.discounts.filter((d) => !d.optionId);
    if (orphanDiscounts.length) {
      await prisma.discount.updateMany({
        where: { id: { in: orphanDiscounts.map((d) => d.id) } },
        data: { optionId: option.id },
      });
    }

    await prisma.estimate.update({
      where: { id: estimateId },
      data: { selectedOptionId: option.id },
    });

    return option;
  }

  // Attach any remaining orphan line items / discounts to the first option
  const first = estimate.options[0]!;
  const orphanItems = estimate.lineItems.filter((item) => !item.optionId);
  if (orphanItems.length) {
    await prisma.estimateLineItem.updateMany({
      where: { id: { in: orphanItems.map((i) => i.id) } },
      data: { optionId: first.id },
    });
  }
  const orphanDiscounts = estimate.discounts.filter((d) => !d.optionId);
  if (orphanDiscounts.length) {
    await prisma.discount.updateMany({
      where: { id: { in: orphanDiscounts.map((d) => d.id) } },
      data: { optionId: first.id },
    });
  }

  if (!estimate.selectedOptionId) {
    await prisma.estimate.update({
      where: { id: estimateId },
      data: { selectedOptionId: first.id },
    });
  }

  return first;
}

/** Re-assign A/B/C letters based on sort order. Single option → no letter. */
export async function reletterEstimateOptions(estimateId: string) {
  const options = await prisma.estimateOption.findMany({
    where: { estimateId },
    orderBy: { sortOrder: "asc" },
  });

  if (options.length <= 1) {
    if (options[0]) {
      await prisma.estimateOption.update({
        where: { id: options[0].id },
        data: { letter: null, label: options[0].label === "Option A" ? "Option" : options[0].label },
      });
    }
    return;
  }

  await Promise.all(
    options.map((option, index) => {
      const letter = optionLetterForIndex(index);
      const defaultLabel = `Option ${letter}`;
      const shouldResetLabel =
        !option.label ||
        option.label === "Option" ||
        /^Option [A-Z]+$/.test(option.label);
      return prisma.estimateOption.update({
        where: { id: option.id },
        data: {
          letter,
          ...(shouldResetLabel ? { label: defaultLabel } : {}),
        },
      });
    })
  );
}

export async function recalculateOptionTotals(optionId: string) {
  const option = await prisma.estimateOption.findUnique({
    where: { id: optionId },
    include: { lineItems: true, discounts: true },
  });
  if (!option) return null;

  const subtotal = sumLineItems(option.lineItems);
  const discountTotal = sumDiscounts(subtotal, option.discounts);
  const totals = computeTotals(subtotal, discountTotal);

  return prisma.estimateOption.update({
    where: { id: optionId },
    data: {
      subtotal: totals.subtotal,
      discountTotal: totals.discountTotal,
      total: totals.total,
    },
  });
}

export async function createEstimateOption(params: {
  estimateId: string;
  duplicateFromOptionId?: string | null;
  label?: string | null;
}) {
  await ensureEstimateOptions(params.estimateId);

  const existing = await prisma.estimateOption.findMany({
    where: { estimateId: params.estimateId },
    orderBy: { sortOrder: "asc" },
  });

  const sortOrder = existing.length === 0 ? 0 : Math.max(...existing.map((o) => o.sortOrder)) + 1;
  const letter = optionLetterForIndex(existing.length === 0 ? 0 : existing.length);

  const option = await prisma.estimateOption.create({
    data: {
      estimateId: params.estimateId,
      letter: existing.length === 0 ? null : letter,
      label: params.label?.trim() || (existing.length === 0 ? "Option" : `Option ${letter}`),
      sortOrder,
    },
  });

  if (params.duplicateFromOptionId) {
    const source = await prisma.estimateOption.findFirst({
      where: { id: params.duplicateFromOptionId, estimateId: params.estimateId },
      include: { lineItems: true, discounts: true },
    });
    if (source) {
      if (source.lineItems.length) {
        await prisma.estimateLineItem.createMany({
          data: source.lineItems.map((item, index) => ({
            estimateId: params.estimateId,
            optionId: option.id,
            priceBookItemId: item.priceBookItemId,
            name: item.name,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            total: item.total,
            unit: item.unit || "each",
            sortOrder: item.sortOrder ?? index,
          })),
        });
      }
      if (source.discounts.length) {
        await prisma.discount.createMany({
          data: source.discounts.map((d) => ({
            estimateId: params.estimateId,
            optionId: option.id,
            label: d.label,
            type: d.type,
            amount: d.amount,
          })),
        });
      }
      await recalculateOptionTotals(option.id);
    }
  }

  await reletterEstimateOptions(params.estimateId);

  const estimate = await prisma.estimate.findUnique({ where: { id: params.estimateId } });
  if (!estimate?.selectedOptionId) {
    await prisma.estimate.update({
      where: { id: params.estimateId },
      data: { selectedOptionId: option.id },
    });
  }

  return prisma.estimateOption.findUniqueOrThrow({ where: { id: option.id } });
}

export async function deleteEstimateOption(estimateId: string, optionId: string) {
  const options = await prisma.estimateOption.findMany({
    where: { estimateId },
    orderBy: { sortOrder: "asc" },
  });
  if (options.length <= 1) {
    throw new Error("Cannot delete the only option on an estimate");
  }

  const estimate = await prisma.estimate.findUnique({ where: { id: estimateId } });
  await prisma.estimateOption.delete({ where: { id: optionId } });

  if (estimate?.selectedOptionId === optionId) {
    const remaining = options.filter((o) => o.id !== optionId);
    await prisma.estimate.update({
      where: { id: estimateId },
      data: { selectedOptionId: remaining[0]?.id ?? null },
    });
  }

  await reletterEstimateOptions(estimateId);
}

export function serializeOption(
  option: {
    id: string;
    letter: string | null;
    label: string;
    sortOrder: number;
    subtotal: unknown;
    discountTotal: unknown;
    total: unknown;
  },
  estimateNumber: string | null,
  optionCount: number
) {
  return {
    id: option.id,
    letter: option.letter,
    label: option.label,
    sortOrder: option.sortOrder,
    subtotal: toNumber(option.subtotal),
    discountTotal: toNumber(option.discountTotal),
    total: toNumber(option.total),
    displayNumber: formatEstimateOptionNumber(estimateNumber, option.letter, optionCount),
  };
}
