import type { HousecallProClient } from "@/lib/housecall-pro/client";
import { HCP_PATHS } from "@/lib/housecall-pro/constants";
import type { HcpRecord } from "@/lib/housecall-pro/types";
import { hcpId } from "@/lib/housecall-pro/utils";

const CATEGORY_ARRAY_KEYS = ["categories", "material_categories", "data"];
const MATERIALS_PATH = HCP_PATHS.materials[0];

export type MaterialCategoryCursor = {
  phase: "roots" | "children";
  page: number;
  childParentQueue: string[];
  childParentIndex: number;
  /** Category IDs imported during roots phase — checked for subcategories after all root pages. */
  rootsImportedIds: string[];
};

export function parseMaterialCategoryCursor(cursor: string | null): MaterialCategoryCursor {
  if (!cursor) {
    return { phase: "roots", page: 1, childParentQueue: [], childParentIndex: 0, rootsImportedIds: [] };
  }
  try {
    const parsed = JSON.parse(cursor) as MaterialCategoryCursor;
    if (parsed.phase === "roots" || parsed.phase === "children") {
      return {
        phase: parsed.phase,
        page: Number(parsed.page) || 1,
        childParentQueue: Array.isArray(parsed.childParentQueue) ? parsed.childParentQueue : [],
        childParentIndex: Number(parsed.childParentIndex) || 0,
        rootsImportedIds: Array.isArray(parsed.rootsImportedIds) ? parsed.rootsImportedIds : [],
      };
    }
  } catch {
    const page = Number(cursor);
    if (Number.isFinite(page) && page > 0) {
      return { phase: "roots", page, childParentQueue: [], childParentIndex: 0, rootsImportedIds: [] };
    }
  }
  return { phase: "roots", page: 1, childParentQueue: [], childParentIndex: 0, rootsImportedIds: [] };
}

export function serializeMaterialCategoryCursor(cursor: MaterialCategoryCursor): string {
  return JSON.stringify(cursor);
}

export async function fetchMaterialCategoriesPage(
  client: HousecallProClient,
  options: { parentUuid?: string | null; page: number; pageSize: number }
) {
  const params: Record<string, string | number | undefined> = {};
  if (options.parentUuid) {
    params.parent_uuid = options.parentUuid;
  }
  return client.getPaginatedFirst(HCP_PATHS.materialCategories, {
    cursor: options.page === 1 ? null : String(options.page),
    pageSize: options.pageSize,
    arrayKeys: CATEGORY_ARRAY_KEYS,
    params,
  });
}

/** Walk the full HCP material category tree (roots + subcategories). */
export async function discoverAllMaterialCategoryUuids(
  client: HousecallProClient,
  pageSize = 200
): Promise<string[]> {
  const seen = new Set<string>();
  const parentQueue: string[] = [""];

  while (parentQueue.length) {
    const parentUuid = parentQueue.shift()!;
    let page = 1;
    let nextCursor: string | null = null;

    do {
      const result = await fetchMaterialCategoriesPage(client, {
        parentUuid: parentUuid || null,
        page,
        pageSize,
      });

      for (const record of result.items) {
        const id = hcpId(record);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        parentQueue.push(id);
      }

      nextCursor = result.nextCursor;
      page = nextCursor ? Number(nextCursor) || page + 1 : page + 1;
    } while (nextCursor);
  }

  return [...seen];
}

export type MaterialsCursor = {
  categoryIndex: number;
  page: number;
};

export function parseMaterialsCursor(cursor: string | null): MaterialsCursor {
  if (!cursor) return { categoryIndex: 0, page: 1 };
  try {
    const parsed = JSON.parse(cursor) as MaterialsCursor;
    return {
      categoryIndex: Number(parsed.categoryIndex) || 0,
      page: Number(parsed.page) || 1,
    };
  } catch {
    const separator = cursor.indexOf(":");
    if (separator > 0) {
      return { categoryIndex: 0, page: Number(cursor.slice(separator + 1)) || 1 };
    }
    return { categoryIndex: 0, page: 1 };
  }
}

export function serializeMaterialsCursor(cursor: MaterialsCursor): string {
  return JSON.stringify(cursor);
}

export async function fetchMaterialsPage(
  client: HousecallProClient,
  categoryUuid: string,
  page: number,
  pageSize: number
) {
  return client.getPaginated(MATERIALS_PATH, {
    cursor: page === 1 ? null : String(page),
    pageSize,
    arrayKeys: ["materials", "data"],
    params: { material_category_uuid: categoryUuid },
  });
}
