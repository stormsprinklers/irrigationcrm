"use client";

import { useRef, useState } from "react";
import { Crop, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export type AerialCropRect = { x: number; y: number; width: number; height: number };

type Props = {
  imageUrl: string;
  busy?: boolean;
  onApply: (crop: AerialCropRect) => void;
  onClose: () => void;
};

type DragState = { startX: number; startY: number; curX: number; curY: number } | null;

/** Full-screen dialog: drag a rectangle over the aerial image to zoom/crop into that region. */
export function AerialCropDialog({ imageUrl, busy = false, onApply, onClose }: Props) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [drag, setDrag] = useState<DragState>(null);

  function normalized(clientX: number, clientY: number) {
    const rect = imgRef.current?.getBoundingClientRect();
    if (!rect || !rect.width || !rect.height) return null;
    const x = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
    return { x, y };
  }

  function pointerDown(e: React.PointerEvent) {
    if (busy) return;
    const p = normalized(e.clientX, e.clientY);
    if (!p) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setDrag({ startX: p.x, startY: p.y, curX: p.x, curY: p.y });
  }

  function pointerMove(e: React.PointerEvent) {
    if (!drag) return;
    const p = normalized(e.clientX, e.clientY);
    if (!p) return;
    setDrag({ ...drag, curX: p.x, curY: p.y });
  }

  const rect: AerialCropRect | null = drag
    ? {
        x: Math.min(drag.startX, drag.curX),
        y: Math.min(drag.startY, drag.curY),
        width: Math.abs(drag.curX - drag.startX),
        height: Math.abs(drag.curY - drag.startY),
      }
    : null;

  const hasSelection = Boolean(rect && rect.width > 0.03 && rect.height > 0.03);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/80 p-4">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between py-2 text-white">
        <div className="flex items-center gap-2">
          <Crop className="h-4 w-4" />
          <span className="text-sm font-medium">Drag to select the area to zoom into</span>
        </div>
        <Button size="icon" variant="ghost" className="text-white hover:bg-white/10" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex flex-1 items-center justify-center overflow-hidden">
        <div className="relative select-none" style={{ touchAction: "none" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={imageUrl}
            alt="Aerial to crop"
            className="max-h-[70vh] max-w-full rounded-md"
            draggable={false}
            onPointerDown={pointerDown}
            onPointerMove={pointerMove}
            onPointerUp={() => {}}
          />
          {rect && (
            <div
              className="pointer-events-none absolute border-2 border-white bg-white/10"
              style={{
                left: `${rect.x * 100}%`,
                top: `${rect.y * 100}%`,
                width: `${rect.width * 100}%`,
                height: `${rect.height * 100}%`,
              }}
            />
          )}
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-3xl items-center justify-end gap-2 py-3">
        <Button variant="ghost" className="text-white hover:bg-white/10" onClick={() => setDrag(null)} disabled={!drag || busy}>
          Clear
        </Button>
        <Button variant="outline" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={() => rect && onApply(rect)} disabled={!hasSelection || busy}>
          {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Crop className="mr-1.5 h-3.5 w-3.5" />}
          {busy ? "Zooming in…" : "Zoom into selection"}
        </Button>
      </div>
    </div>
  );
}
