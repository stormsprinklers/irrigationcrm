import type { HousecallProClient } from "@/lib/housecall-pro/client";
import { HCP_PATHS } from "@/lib/housecall-pro/constants";
import type { PreviewCounts } from "@/lib/housecall-pro/types";
import { hcpId } from "@/lib/housecall-pro/utils";

async function countPage(
  client: HousecallProClient,
  path: string,
  arrayKeys: string[],
  params?: Record<string, string | number | undefined>
): Promise<number | undefined> {
  try {
    const result = await client.getPaginated(path, {
      pageSize: 1,
      arrayKeys,
      cursor: null,
      params,
    });
    return result.totalEstimate;
  } catch {
    return undefined;
  }
}

async function countPageFirst(
  client: HousecallProClient,
  paths: readonly string[],
  arrayKeys: string[],
  params?: Record<string, string | number | undefined>
): Promise<number | undefined> {
  try {
    const result = await client.getPaginatedFirst(paths, {
      pageSize: 1,
      arrayKeys,
      cursor: null,
      params,
    });
    return result.totalEstimate;
  } catch {
    return undefined;
  }
}

async function countMaterials(client: HousecallProClient): Promise<number | undefined> {
  try {
    const categories = await client.getPaginatedFirst(HCP_PATHS.materialCategories, {
      pageSize: 200,
      arrayKeys: ["categories", "material_categories", "data"],
      cursor: null,
    });

    let total = 0;
    let counted = false;
    for (const category of categories.items) {
      const categoryUuid = hcpId(category);
      if (!categoryUuid) continue;
      const count = await countPage(client, HCP_PATHS.materials[0], ["materials", "data"], {
        material_category_uuid: categoryUuid,
      });
      if (count != null) {
        total += count;
        counted = true;
      }
    }
    return counted ? total : undefined;
  } catch {
    return undefined;
  }
}

export async function fetchPreviewCounts(client: HousecallProClient): Promise<PreviewCounts> {
  let companyName: string | undefined;
  try {
    const company = await client.get("/company");
    companyName = String(company.name ?? company.company_name ?? "").trim() || undefined;
  } catch {
    // company endpoint may vary
  }

  const [
    tags,
    serviceZones,
    employees,
    materialCategories,
    materials,
    services,
    customers,
    jobs,
    estimates,
    invoices,
  ] = await Promise.all([
    countPage(client, "/tags", ["tags"]),
    countPage(client, "/service_zones", ["service_zones", "zones"]),
    countPage(client, "/employees", ["employees"]),
    countPageFirst(client, HCP_PATHS.materialCategories, ["categories", "material_categories", "data"]),
    countMaterials(client),
    countPageFirst(client, HCP_PATHS.services, ["services", "price_book_services"]),
    countPage(client, "/customers", ["customers"]),
    countPage(client, "/jobs", ["jobs"]),
    countPage(client, "/estimates", ["estimates"]),
    countPage(client, "/invoices", ["invoices"]),
  ]);

  return {
    connected: true,
    companyName,
    tags,
    serviceZones,
    employees,
    materialCategories,
    materials,
    services,
    customers,
    jobs,
    estimates,
    invoices,
  };
}
