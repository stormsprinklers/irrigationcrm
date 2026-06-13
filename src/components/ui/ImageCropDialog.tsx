"use client";

import { useCallback, useEffect, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { Button } from "@/components/ui/button";
import { getCroppedImageBlob } from "@/lib/images/cropImage";

type Props = {
  open: boolean;
  imageSrc: string | null;
  fileName?: string;
  title?: string;
  cropShape?: "round" | "rect";
  aspect?: number;
  onClose: () => void;
  onConfirm: (file: File) => void | Promise<void>;
};

export function ImageCropDialog({
  open,
  imageSrc,
  fileName = "photo.jpg",
  title = "Adjust photo",
  cropShape = "round",
  aspect = 1,
  onClose,
  onConfirm,
}: Props) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
    }
  }, [open, imageSrc]);

  const onCropComplete = useCallback((_croppedArea: Area, croppedPixels: Area) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  async function handleConfirm() {
    if (!imageSrc || !croppedAreaPixels) return;

    setSaving(true);
    try {
      const mimeType = fileName.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
      const blob = await getCroppedImageBlob(imageSrc, croppedAreaPixels, mimeType);
      const extension = mimeType === "image/png" ? "png" : "jpg";
      const safeBaseName = fileName.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9._-]/g, "_") || "photo";
      const file = new File([blob], `${safeBaseName}.${extension}`, { type: mimeType });
      await onConfirm(file);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  if (!open || !imageSrc) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-lg border border-border bg-white shadow-lg">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Drag to reposition and use the slider to zoom. Your photo will fit the frame without stretching.
          </p>
        </div>

        <div className="relative h-72 bg-muted">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={aspect}
            cropShape={cropShape}
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>

        <div className="space-y-3 px-4 py-4">
          <label className="flex items-center gap-3 text-sm">
            <span className="w-12 shrink-0 text-muted-foreground">Zoom</span>
            <input
              type="range"
              min={1}
              max={3}
              step={0.05}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-full"
            />
          </label>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="button" onClick={handleConfirm} disabled={saving || !croppedAreaPixels}>
              {saving ? "Saving..." : "Use photo"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
