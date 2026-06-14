import type { PriceBookItemType, PriceBookPricingMode } from "@prisma/client";
import { parseCurrency, parseCsv, parseOptionalBoolean } from "./csv-parse";
import { ensureCategoryPath } from "./queries";
import { prisma } from "@/lib/prisma";

export type ImportResult = {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
};

function getColumn(row: Record<string, string>, ...keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (value?.trim()) return value.trim();
  }
  return "";
}

function categoryPathFromRow(row: Record<string, string>, type: PriceBookItemType): string[] {
  if (type === "SERVICE") {
    const industry = getColumn(row, "industry");
    const category = getColumn(row, "category");
    const subcategories = Object.keys(row)
      .filter((k) => /^subcategory_\d+$/.test(k) || /^subcategory\d+$/.test(k))
      .sort()
      .map((k) => row[k]?.trim())
      .filter(Boolean) as string[];
    return [industry, category, ...subcategories].filter(Boolean);
  }

  const category = getColumn(row, "category");
  const subcategories = Object.keys(row)
    .filter((k) => /^subcategory_\d+$/.test(k) || /^subcategory\d+$/.test(k))
    .sort()
    .map((k) => row[k]?.trim())
    .filter(Boolean) as string[];
  return [category, ...subcategories].filter(Boolean);
}

export async function importPriceBookCsv(params: {
  companyId: string;
  type: PriceBookItemType;
  csvText: string;
  updateExisting?: boolean;
}): Promise<ImportResult> {
  const { headers, rows } = parseCsv(params.csvText);
  const result: ImportResult = { created: 0, updated: 0, skipped: 0, errors: [] };

  if (headers.length === 0) {
    result.errors.push("CSV file has no headers");
    return result;
  }

  const headerMap = headers.map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const records = rows.map((cells) => {
    const row: Record<string, string> = {};
    headerMap.forEach((key, index) => {
      row[key] = (cells[index] ?? "").trim();
    });
    return row;
  });

  for (let index = 0; index < records.length; index++) {
    const row = records[index];
    const line = index + 2;
    const name = getColumn(row, "name");
    if (!name) {
      result.skipped++;
      continue;
    }

    const path = categoryPathFromRow(row, params.type);
    if (path.length === 0) {
      result.errors.push(`Row ${line}: missing category${params.type === "SERVICE" ? " or industry" : ""}`);
      result.skipped++;
      continue;
    }

    try {
      const categoryId = await ensureCategoryPath(params.companyId, params.type, path);
      const description = getColumn(row, "description") || null;
      const sku = getColumn(row, "sku", "part_number", "part#") || null;
      const unitPrice = parseCurrency(getColumn(row, "price")) ?? 0;
      const unitCost = parseCurrency(getColumn(row, "cost"));
      const unit = getColumn(row, "unit_of_measure", "unit") || "each";
      const taxable = parseOptionalBoolean(getColumn(row, "taxable")) ?? false;
      const markupEnabled =
        parseOptionalBoolean(getColumn(row, "material_mark_up_enabled", "material_markup_enabled")) ?? false;
      const laborRateName = getColumn(row, "labor_rate_name", "labor_rate");
      const laborRateRow = laborRateName
        ? await prisma.laborRate.findFirst({
            where: { companyId: params.companyId, name: { equals: laborRateName, mode: "insensitive" } },
          })
        : null;
      const laborRate = parseCurrency(getColumn(row, "labor_rate", "hourly_rate"));
      const laborHours = parseCurrency(getColumn(row, "labor_hours", "hours"));
      const pricingModeRaw = getColumn(row, "pricing_mode").toUpperCase();
      const pricingMode: PriceBookPricingMode =
        pricingModeRaw === "MANUAL" ? "MANUAL" : "CALCULATED";
      const imageUrl = getColumn(row, "image_url") || null;

      const existing = await prisma.priceBookItem.findFirst({
        where: {
          categoryId,
          type: params.type,
          name: { equals: name, mode: "insensitive" },
        },
      });

      if (existing && !params.updateExisting) {
        result.skipped++;
        continue;
      }

      const data = {
        categoryId,
        type: params.type,
        name,
        description,
        sku,
        imageUrl,
        unitPrice,
        unitCost,
        unit,
        taxable,
        markupEnabled,
        laborRate: params.type === "SERVICE" && !laborRateRow ? laborRate : null,
        laborRateId: params.type === "SERVICE" ? laborRateRow?.id ?? null : null,
        laborHours: params.type === "SERVICE" ? laborHours : null,
        pricingMode: params.type === "SERVICE" ? pricingMode : "MANUAL",
        trackMaterials: params.type === "SERVICE" ? Boolean(laborRateRow || laborHours) : false,
        active: true,
      };

      let itemId: string;
      if (existing) {
        await prisma.priceBookItem.update({ where: { id: existing.id }, data });
        itemId = existing.id;
        result.updated++;
      } else {
        const created = await prisma.priceBookItem.create({ data });
        itemId = created.id;
        result.created++;
      }

      const { recalculateItemPrice } = await import("./pricing");
      await recalculateItemPrice(itemId);
    } catch (error) {
      result.errors.push(
        `Row ${line}: ${error instanceof Error ? error.message : "Import failed"}`
      );
      result.skipped++;
    }
  }

  return result;
}
