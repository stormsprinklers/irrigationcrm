export type PriceBookCategoryDTO = {
  id: string;
  type: "SERVICE" | "MATERIAL";
  name: string;
  slug: string;
  parentId: string | null;
  sortOrder: number;
  _count?: { items: number; children: number };
  parent?: { id: string; name: string; slug: string } | null;
  children?: PriceBookCategoryDTO[];
};

export type PriceBookMaterialLinkDTO = {
  id: string;
  materialItemId: string;
  quantity: number;
  material: {
    id: string;
    name: string;
    sku: string | null;
    unitPrice: number;
    unit: string;
  };
};

export type PriceBookItemDTO = {
  id: string;
  categoryId: string;
  type: "SERVICE" | "MATERIAL";
  name: string;
  description: string | null;
  sku: string | null;
  unitPrice: number;
  unitCost: number | null;
  unit: string;
  taxable: boolean;
  markupEnabled: boolean;
  laborRate: number | null;
  laborHours: number | null;
  trackMaterials: boolean;
  active: boolean;
  sortOrder: number;
  category?: { id: string; name: string; slug: string; type: "SERVICE" | "MATERIAL" };
  materials?: PriceBookMaterialLinkDTO[];
};

export type PriceBookImportResult = {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
};
