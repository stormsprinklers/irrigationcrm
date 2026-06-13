import { NextRequest, NextResponse } from "next/server";
import type { PriceBookItemType, UserRole } from "@prisma/client";
import { badRequestResponse, forbiddenResponse, requireSessionUser, unauthorizedResponse } from "@/lib/api-auth";
import { importPriceBookCsv } from "@/lib/price-book/csv-import";
import { exportPriceBookCsv } from "@/lib/price-book/csv-parse";
import { listItems } from "@/lib/price-book/queries";
import { canManagePriceBook } from "@/lib/price-book/permissions";

export async function POST(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (!canManagePriceBook(user.role as UserRole)) return forbiddenResponse();

    const formData = await request.formData();
    const file = formData.get("file");
    const type = String(formData.get("type") ?? "SERVICE") as PriceBookItemType;
    const updateExisting = formData.get("updateExisting") === "true";

    if (!file || !(file instanceof File)) {
      return badRequestResponse("CSV file is required");
    }
    if (type !== "SERVICE" && type !== "MATERIAL") {
      return badRequestResponse("type must be SERVICE or MATERIAL");
    }

    const csvText = await file.text();
    const result = await importPriceBookCsv({
      companyId: user.companyId,
      type,
      csvText,
      updateExisting,
    });

    return NextResponse.json(result);
  } catch {
    return unauthorizedResponse();
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireSessionUser();
    if (!canManagePriceBook(user.role as UserRole)) return forbiddenResponse();

    const type = (request.nextUrl.searchParams.get("type") ?? "SERVICE") as PriceBookItemType;
    const items = await listItems({ companyId: user.companyId, type, activeOnly: false });

    if (type === "SERVICE") {
      const headers = [
        "Industry",
        "Category",
        "Subcategory_1",
        "Name",
        "Description",
        "SKU",
        "Price",
        "Cost",
        "Taxable",
        "Unit_of_measure",
        "Labor_rate",
        "Labor_hours",
      ];
      const rows = items.map((item) => {
        const parts = item.category?.name ? [item.category.name] : [];
        return {
          Industry: parts[0] ?? "General",
          Category: parts[0] ?? "General",
          Subcategory_1: "",
          Name: item.name,
          Description: item.description ?? "",
          SKU: item.sku ?? "",
          Price: item.unitPrice.toFixed(2),
          Cost: item.unitCost?.toFixed(2) ?? "",
          Taxable: item.taxable ? "true" : "false",
          Unit_of_measure: item.unit,
          Labor_rate: item.laborRate?.toFixed(2) ?? "",
          Labor_hours: item.laborHours?.toFixed(2) ?? "",
        };
      });
      const csv = exportPriceBookCsv(headers, rows);
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="price-book-services.csv"`,
        },
      });
    }

    const headers = [
      "Category",
      "Subcategory_1",
      "Name",
      "Description",
      "SKU",
      "Price",
      "Cost",
      "Taxable",
      "Unit_of_measure",
      "Material_mark_up_enabled",
    ];
    const rows = items.map((item) => ({
      Category: item.category?.name ?? "General",
      Subcategory_1: "",
      Name: item.name,
      Description: item.description ?? "",
      SKU: item.sku ?? "",
      Price: item.unitPrice.toFixed(2),
      Cost: item.unitCost?.toFixed(2) ?? "",
      Taxable: item.taxable ? "true" : "false",
      Unit_of_measure: item.unit,
      Material_mark_up_enabled: item.markupEnabled ? "true" : "false",
    }));
    const csv = exportPriceBookCsv(headers, rows);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="price-book-materials.csv"`,
      },
    });
  } catch {
    return unauthorizedResponse();
  }
}
