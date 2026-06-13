export type PriceBookCategoryDTO = {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  _count?: { items: number };
};

export type PriceBookItemDTO = {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  unitPrice: string | number;
  unit: string;
  active: boolean;
  sortOrder: number;
  category?: { id: string; name: string; slug: string };
};
