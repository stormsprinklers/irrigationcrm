import type { DiscountType, PriceBookDiscountAppliesTo, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/visits/totals";

export function serializeDiscount(discount: {
  id: string;
  name: string;
  code: string | null;
  type: DiscountType;
  amount: Prisma.Decimal;
  active: boolean;
  appliesTo: PriceBookDiscountAppliesTo;
}) {
  return {
    id: discount.id,
    name: discount.name,
    code: discount.code,
    type: discount.type,
    amount: toNumber(discount.amount),
    active: discount.active,
    appliesTo: discount.appliesTo,
  };
}

export async function listDiscounts(companyId: string) {
  const rows = await prisma.priceBookDiscount.findMany({
    where: { companyId },
    orderBy: { name: "asc" },
  });
  return rows.map(serializeDiscount);
}

export function serializeTemplate(
  template: Prisma.EstimateTemplateGetPayload<{ include: { lineItems: true } }>
) {
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    lineItems: template.lineItems.map((item) => ({
      id: item.id,
      priceBookItemId: item.priceBookItemId,
      name: item.name,
      description: item.description,
      quantity: toNumber(item.quantity),
      unitPrice: toNumber(item.unitPrice),
      sortOrder: item.sortOrder,
    })),
  };
}

export async function listTemplates(companyId: string) {
  const rows = await prisma.estimateTemplate.findMany({
    where: { companyId },
    include: { lineItems: { orderBy: { sortOrder: "asc" } } },
    orderBy: { name: "asc" },
  });
  return rows.map(serializeTemplate);
}

export async function getTemplateLineItemsForEstimate(companyId: string, templateId: string) {
  const template = await prisma.estimateTemplate.findFirst({
    where: { id: templateId, companyId },
    include: { lineItems: { orderBy: { sortOrder: "asc" } } },
  });
  return template?.lineItems ?? [];
}

export function serializePricingForm(
  form: Prisma.PricingFormGetPayload<{ include: { category: { select: { id: true; name: true } } } }>
) {
  return {
    id: form.id,
    name: form.name,
    description: form.description,
    fields: form.fields,
    categoryId: form.categoryId,
    category: form.category,
  };
}

export async function listPricingForms(companyId: string) {
  const rows = await prisma.pricingForm.findMany({
    where: { companyId },
    include: { category: { select: { id: true, name: true } } },
    orderBy: { name: "asc" },
  });
  return rows.map(serializePricingForm);
}

export type PricingFormField = {
  id: string;
  label: string;
  type: "select" | "number" | "text";
  options?: string[];
  mapsToItemName?: string;
  mapsToPrice?: number;
};

export function generateLineItemsFromAnswers(
  fields: PricingFormField[],
  answers: Record<string, string | number>
) {
  const items: { name: string; quantity: number; unitPrice: number; description?: string }[] = [];
  for (const field of fields) {
    const answer = answers[field.id];
    if (answer == null || answer === "") continue;
    if (field.mapsToItemName && field.mapsToPrice != null) {
      items.push({
        name: field.mapsToItemName,
        quantity: field.type === "number" ? Number(answer) || 1 : 1,
        unitPrice: field.mapsToPrice,
        description: `${field.label}: ${answer}`,
      });
    }
  }
  return items;
}
