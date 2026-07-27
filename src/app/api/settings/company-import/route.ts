import { NextRequest, NextResponse } from "next/server";
import {
  forbiddenResponse,
  requireSessionUser,
  unauthorizedResponse,
} from "@/lib/api-auth";
import {
  CHESTNUT_CHEER_COMPANY_ID,
  importChecklistTemplatesToChestnut,
  importCustomersToChestnut,
  importEmployeesToChestnut,
  importNotificationTemplatesToChestnut,
  importPriceBookCategoriesToChestnut,
  listStormChecklistTemplates,
  listStormCustomers,
  listStormEmployees,
  listStormNotificationTemplates,
  listStormPriceBookCategories,
} from "@/lib/company-import/storm-to-chestnut";

async function requireCcAdmin() {
  const user = await requireSessionUser();
  if (user.role !== "ADMIN") return { error: forbiddenResponse() as NextResponse };
  if (user.companyId !== CHESTNUT_CHEER_COMPANY_ID) {
    return {
      error: NextResponse.json(
        {
          error:
            "Company import is only available when logged into the Chestnut & Cheer company.",
        },
        { status: 403 }
      ),
    };
  }
  return { user };
}

export async function GET() {
  try {
    const auth = await requireCcAdmin();
    if ("error" in auth && auth.error) return auth.error;

    const [
      employees,
      customers,
      notificationTemplates,
      checklistTemplates,
      priceBookCategories,
    ] = await Promise.all([
      listStormEmployees(),
      listStormCustomers(),
      listStormNotificationTemplates(),
      listStormChecklistTemplates(),
      listStormPriceBookCategories(),
    ]);

    return NextResponse.json({
      sourceCompany: "Storm Sprinklers",
      employees,
      customers,
      notificationTemplates,
      checklistTemplates,
      priceBookCategories,
    });
  } catch {
    return unauthorizedResponse();
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireCcAdmin();
    if ("error" in auth && auth.error) return auth.error;

    const body = await request.json();
    const type = String(body.type ?? "");
    const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];

    if (!ids.length) {
      return NextResponse.json({ error: "Select at least one item" }, { status: 400 });
    }

    const targetCompanyId = CHESTNUT_CHEER_COMPANY_ID;

    if (type === "employees") {
      return NextResponse.json(await importEmployeesToChestnut(targetCompanyId, ids));
    }
    if (type === "customers") {
      return NextResponse.json(await importCustomersToChestnut(targetCompanyId, ids));
    }
    if (type === "notificationTemplates") {
      return NextResponse.json(
        await importNotificationTemplatesToChestnut(targetCompanyId, ids)
      );
    }
    if (type === "checklistTemplates") {
      return NextResponse.json(
        await importChecklistTemplatesToChestnut(targetCompanyId, ids)
      );
    }
    if (type === "priceBookCategories") {
      return NextResponse.json(
        await importPriceBookCategoriesToChestnut(targetCompanyId, ids)
      );
    }

    return NextResponse.json({ error: "Invalid import type" }, { status: 400 });
  } catch {
    return unauthorizedResponse();
  }
}
