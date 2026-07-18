"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

type Props = {
  open: boolean;
  invoiceNumber: string;
  loading?: boolean;
  onClose: () => void;
  onConfirm: (voidFirst: boolean) => void;
};

export function DeleteInvoiceDialog({
  open,
  invoiceNumber,
  loading,
  onClose,
  onConfirm,
}: Props) {
  const [voidFirst, setVoidFirst] = useState(false);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close"
        onClick={() => !loading && onClose()}
      />
      <div className="relative z-10 w-full max-w-md rounded-lg border bg-background p-6 shadow-lg">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Delete invoice</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Permanently delete invoice <span className="font-medium text-foreground">{invoiceNumber}</span>
              ? This cannot be undone.
            </p>
          </div>
          <Button type="button" variant="ghost" size="icon" disabled={loading} onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <label className="mt-4 flex items-start gap-2 text-sm">
          <Checkbox
            checked={voidFirst}
            onCheckedChange={(checked) => setVoidFirst(checked === true)}
            disabled={loading}
            className="mt-0.5"
          />
          <span>
            Also void this invoice before deleting
            <span className="mt-0.5 block text-xs text-muted-foreground">
              Recommended if the invoice was sent to the customer. Delete alone does not void it.
            </span>
          </span>
        </label>

        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="outline" disabled={loading} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={loading}
            onClick={() => onConfirm(voidFirst)}
          >
            {loading ? "Deleting…" : "Delete invoice"}
          </Button>
        </div>
      </div>
    </div>
  );
}
