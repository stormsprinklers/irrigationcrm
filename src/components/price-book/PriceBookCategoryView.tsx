"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { CategoryCard } from "@/components/price-book/CategoryCard";
import { PriceBookItemDialog } from "@/components/price-book/PriceBookItemDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PriceBookCategoryDTO, PriceBookItemDTO } from "@/lib/price-book/types";
import { blobProxyUrl } from "@/lib/blob/urls";

type Props = { categoryId: string };

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

export function PriceBookCategoryView({ categoryId }: Props) {
  const router = useRouter();
  const [category, setCategory] = useState<
    (PriceBookCategoryDTO & {
      parent?: { id: string; name: string } | null;
      children?: PriceBookCategoryDTO[];
    }) | null
  >(null);
  const [items, setItems] = useState<PriceBookItemDTO[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<PriceBookItemDTO | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [catRes, itemRes] = await Promise.all([
      fetch(`/api/price-book/categories/${categoryId}`),
      fetch(`/api/price-book/items?categoryId=${categoryId}&activeOnly=false`),
    ]);
    if (catRes.ok) setCategory(await catRes.json());
    if (itemRes.ok) setItems(await itemRes.json());
  }, [categoryId]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  async function createSubcategory() {
    if (!category) return;
    const name = prompt("Subcategory name");
    if (!name?.trim()) return;
    const res = await fetch("/api/price-book/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), type: category.type, parentId: category.id }),
    });
    if (!res.ok) {
      toast.error("Failed to create subcategory");
      return;
    }
    toast.success("Subcategory created");
    await load();
  }

  async function renameCategory() {
    if (!category) return;
    const name = prompt("Rename category", category.name);
    if (!name?.trim() || name.trim() === category.name) return;
    const res = await fetch(`/api/price-book/categories/${category.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    if (!res.ok) {
      toast.error("Failed to rename category");
      return;
    }
    toast.success("Category renamed");
    await load();
  }

  async function deleteCategory() {
    if (!category) return;
    const itemCount = items.length;
    const childCount = category.children?.length ?? 0;
    const warning =
      itemCount || childCount
        ? `Delete “${category.name}”? This permanently removes ${itemCount} item(s) and ${childCount} subcategory(ies).`
        : `Delete “${category.name}”?`;
    if (!confirm(warning)) return;
    const res = await fetch(`/api/price-book/categories/${category.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to delete category");
      return;
    }
    toast.success("Category deleted");
    const backHref = category.type === "MATERIAL" ? "/price-book/materials" : "/price-book";
    router.push(category.parent ? `/price-book/categories/${category.parent.id}` : backHref);
  }

  async function renameChild(child: PriceBookCategoryDTO) {
    const name = prompt("Rename subcategory", child.name);
    if (!name?.trim() || name.trim() === child.name) return;
    const res = await fetch(`/api/price-book/categories/${child.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    if (!res.ok) {
      toast.error("Failed to rename subcategory");
      return;
    }
    toast.success("Subcategory renamed");
    await load();
  }

  async function deleteChild(child: PriceBookCategoryDTO) {
    const itemCount = child._count?.items ?? 0;
    const childCount = child._count?.children ?? 0;
    const warning =
      itemCount || childCount
        ? `Delete “${child.name}”? This permanently removes ${itemCount} item(s) and ${childCount} subcategory(ies).`
        : `Delete “${child.name}”?`;
    if (!confirm(warning)) return;
    const res = await fetch(`/api/price-book/categories/${child.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to delete subcategory");
      return;
    }
    toast.success("Subcategory deleted");
    await load();
  }

  async function duplicateItem(item: PriceBookItemDTO) {
    const res = await fetch(`/api/price-book/items/${item.id}/duplicate`, { method: "POST" });
    if (!res.ok) {
      toast.error("Failed to duplicate item");
      return;
    }
    toast.success("Item duplicated");
    await load();
  }

  async function removeItem(item: PriceBookItemDTO) {
    if (!confirm(`Remove “${item.name}”? It will be deactivated and hidden from new estimates.`)) {
      return;
    }
    const res = await fetch(`/api/price-book/items/${item.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to remove item");
      return;
    }
    toast.success("Item removed");
    await load();
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading category...</p>;
  if (!category) return <p className="text-sm text-muted-foreground">Category not found.</p>;

  const backHref = category.type === "MATERIAL" ? "/price-book/materials" : "/price-book";
  const itemLabel = category.type === "SERVICE" ? "service" : "material";

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" className="-ml-2 mb-2" asChild>
          <Link href={category.parent ? `/price-book/categories/${category.parent.id}` : backHref}>
            <ArrowLeft className="h-4 w-4" />
            Back to {category.parent?.name ?? (category.type === "MATERIAL" ? "materials" : "services")}
          </Link>
        </Button>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold">{category.name}</h1>
              <Badge variant="outline">{category.type === "SERVICE" ? "Service" : "Material"}</Badge>
            </div>
            {category.parent ? (
              <p className="mt-1 text-sm text-muted-foreground">Under {category.parent.name}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => void renameCategory()}>
              <Pencil className="h-4 w-4" />
              Rename
            </Button>
            <Button variant="outline" size="sm" onClick={() => void deleteCategory()}>
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
            <Button variant="outline" size="sm" onClick={createSubcategory}>
              <Plus className="h-4 w-4" />
              Subcategory
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setEditingItem(null);
                setDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              Add {itemLabel}
            </Button>
          </div>
        </div>
      </div>

      {(category.children?.length ?? 0) > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Subcategories
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {category.children?.map((child) => (
              <CategoryCard
                key={child.id}
                category={child}
                href={`/price-book/categories/${child.id}`}
                onRename={() => void renameChild(child)}
                onDelete={() => void deleteChild(child)}
              />
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {category.type === "SERVICE" ? "Services" : "Materials"}
        </h2>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No items in this category yet.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="w-12 px-4 py-2 font-medium" />
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">SKU</th>
                  <th className="px-4 py-2 font-medium">Price</th>
                  <th className="px-4 py-2 font-medium">Cost</th>
                  <th className="px-4 py-2 font-medium">Unit</th>
                  {category.type === "SERVICE" && <th className="px-4 py-2 font-medium">Labor</th>}
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-t">
                    <td className="px-4 py-3">
                      {item.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={blobProxyUrl(item.imageUrl)}
                          alt=""
                          className="h-10 w-10 rounded object-cover"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded bg-muted" />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium">{item.name}</p>
                      {item.description ? (
                        <p className="line-clamp-1 text-xs text-muted-foreground">{item.description}</p>
                      ) : null}
                      {!item.active && <Badge variant="outline">Inactive</Badge>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{item.sku ?? "—"}</td>
                    <td className="px-4 py-3">{formatCurrency(item.unitPrice)}</td>
                    <td className="px-4 py-3">
                      {item.unitCost != null ? formatCurrency(item.unitCost) : "—"}
                    </td>
                    <td className="px-4 py-3">{item.unit}</td>
                    {category.type === "SERVICE" && (
                      <td className="px-4 py-3 text-muted-foreground">
                        {item.laborRatePreset
                          ? `${item.laborRatePreset.name}${item.laborHours ? ` × ${item.laborHours}h` : ""}`
                          : item.materials?.length
                            ? `${item.materials.length} material(s)`
                            : "—"}
                      </td>
                    )}
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Edit item"
                          onClick={() => {
                            setEditingItem(item);
                            setDialogOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Duplicate item"
                          onClick={() => void duplicateItem(item)}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Remove item"
                          onClick={() => void removeItem(item)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <PriceBookItemDialog
        open={dialogOpen}
        type={category.type}
        categoryId={category.id}
        item={editingItem}
        onClose={() => {
          setDialogOpen(false);
          setEditingItem(null);
        }}
        onSaved={load}
      />
    </div>
  );
}
