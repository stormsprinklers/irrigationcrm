"use client";

import { useState } from "react";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { PriceBookImportResult } from "@/lib/price-book/types";

type Props = {
  open: boolean;
  type: "SERVICE" | "MATERIAL";
  onClose: () => void;
  onImported: (result: PriceBookImportResult) => void;
};

export function PriceBookImportDialog({ open, type, onClose, onImported }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [updateExisting, setUpdateExisting] = useState(false);
  const [uploading, setUploading] = useState(false);

  if (!open) return null;

  async function handleImport() {
    if (!file) {
      toast.error("Choose a CSV file to import");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", type);
      formData.append("updateExisting", String(updateExisting));

      const res = await fetch("/api/price-book/import", { method: "POST", body: formData });
      const result = (await res.json()) as PriceBookImportResult & { error?: string };
      if (!res.ok) {
        toast.error(result.error ?? "Import failed");
        return;
      }

      onImported(result);
      toast.success(`Imported ${result.created} new, updated ${result.updated}`);
      if (result.errors.length > 0) {
        toast.message(`${result.errors.length} row issue(s) — check import summary`);
      }
      onClose();
      setFile(null);
    } finally {
      setUploading(false);
    }
  }

  const label = type === "SERVICE" ? "services" : "materials";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-lg border bg-background p-6 shadow-lg">
        <h2 className="text-lg font-semibold">Import {label} from CSV</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Upload a Housecall Pro price book export (.csv). Required columns for {label} follow HCP
          templates — {type === "SERVICE" ? "Industry, Category, Name" : "Category, Name"}.
        </p>

        <div className="mt-4 space-y-3">
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm"
          />
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={updateExisting} onCheckedChange={(c) => setUpdateExisting(Boolean(c))} />
            Update existing items with the same name in the same category
          </label>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={uploading}>
            Cancel
          </Button>
          <Button type="button" onClick={handleImport} disabled={uploading || !file}>
            <Upload className="h-4 w-4" />
            {uploading ? "Importing..." : "Import CSV"}
          </Button>
        </div>
      </div>
    </div>
  );
}
