"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ModalPortal } from "@/components/ui/ModalPortal";

type Props = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: "default" | "destructive" | "outline" | "secondary" | "ghost";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  confirmVariant = "default",
  busy,
  onConfirm,
  onCancel,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onCancel, open]);

  if (!open) return null;

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
        <button
          type="button"
          className="absolute inset-0 bg-black/50"
          aria-label="Close confirmation"
          disabled={busy}
          onClick={onCancel}
        />
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
          aria-describedby="confirm-dialog-desc"
          className="relative z-10 w-full max-w-md rounded-lg border border-border bg-white p-5 shadow-lg"
        >
          <h2 id="confirm-dialog-title" className="text-base font-semibold">
            {title}
          </h2>
          <p id="confirm-dialog-desc" className="mt-2 text-sm text-muted-foreground">
            {description}
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
              {cancelLabel}
            </Button>
            <Button
              type="button"
              variant={confirmVariant}
              disabled={busy}
              onClick={onConfirm}
            >
              {busy ? "Working…" : confirmLabel}
            </Button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
