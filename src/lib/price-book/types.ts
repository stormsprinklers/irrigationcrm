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

export type LaborRateDTO = {
  id: string;
  name: string;
  hourlyCost: number;
  hourlyPrice: number;
  isDefault: boolean;
  sortOrder: number;
};

export type MaterialMarkupTierDTO = {
  id: string;
  minCost: number;
  maxCost: number | null;
  markupPercent: number;
  sortOrder: number;
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
    unitCost?: number | null;
    markupEnabled?: boolean;
    unit: string;
  };
};

export type ServicePriceBreakdownDTO = {
  laborSubtotal: number;
  materialsSubtotal: number;
  total: number;
  lines: Array<{ label: string; amount: number }>;
};

export type PriceBookItemDTO = {
  id: string;
  categoryId: string;
  type: "SERVICE" | "MATERIAL";
  name: string;
  description: string | null;
  sku: string | null;
  imageUrl: string | null;
  unitPrice: number;
  unitCost: number | null;
  unit: string;
  taxable: boolean;
  markupEnabled: boolean;
  laborRate: number | null;
  laborRateId: string | null;
  laborHours: number | null;
  pricingMode: "MANUAL" | "CALCULATED";
  lastCalculatedPrice: number | null;
  trackMaterials: boolean;
  active: boolean;
  sortOrder: number;
  category?: { id: string; name: string; slug: string; type: "SERVICE" | "MATERIAL" };
  laborRatePreset?: LaborRateDTO | null;
  priceBreakdown?: ServicePriceBreakdownDTO | null;
  materials?: PriceBookMaterialLinkDTO[];
};

export type PriceBookImportResult = {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
};

export type PriceBookSettingsDTO = {
  flatRatePricingEnabled: boolean;
  materialMarkupsEnabled: boolean;
  openaiConfigured: boolean;
};
