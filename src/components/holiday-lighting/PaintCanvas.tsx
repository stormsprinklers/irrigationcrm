"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Eraser, Paintbrush, RotateCcw, Trash2 } from "lucide-react";

type ToolMode = "paint" | "erase";

type PaintCanvasProps = {
  imageUrl: string;
  disabled?: boolean;
  onReadyChange?: (ready: boolean) => void;
};

export type PaintCanvasHandle = {
  exportForApi: () => Promise<{ cleanBlob: Blob; markedBlob: Blob } | null>;
  hasPaint: () => boolean;
};

const MAX_EDGE = 1536;
const PAINT_COLOR = "rgba(230, 194, 122, 0.85)";

export function PaintCanvas({
  imageUrl,
  disabled = false,
  onReadyChange,
  canvasRef,
}: PaintCanvasProps & {
  canvasRef: React.MutableRefObject<PaintCanvasHandle | null>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageCanvasRef = useRef<HTMLCanvasElement>(null);
  const paintCanvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const historyRef = useRef<ImageData[]>([]);

  const [mode, setMode] = useState<ToolMode>("paint");
  const [brushSize, setBrushSize] = useState(28);
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 });
  const [hasPaint, setHasPaint] = useState(false);
  const [canUndo, setCanUndo] = useState(false);

  const syncCanvasSize = useCallback(() => {
    const img = imageRef.current;
    const imageCanvas = imageCanvasRef.current;
    const paintCanvas = paintCanvasRef.current;
    const container = containerRef.current;
    if (!img || !imageCanvas || !paintCanvas || !container) return;

    const displayW = container.clientWidth;
    const scale = displayW / img.naturalWidth;
    const displayH = Math.round(img.naturalHeight * scale);

    const needsBitmapInit =
      imageCanvas.width !== img.naturalWidth ||
      imageCanvas.height !== img.naturalHeight;

    if (needsBitmapInit) {
      imageCanvas.width = img.naturalWidth;
      imageCanvas.height = img.naturalHeight;
      paintCanvas.width = img.naturalWidth;
      paintCanvas.height = img.naturalHeight;

      const ctx = imageCanvas.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, imageCanvas.width, imageCanvas.height);
        ctx.drawImage(img, 0, 0);
      }
      setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
    }

    for (const canvas of [imageCanvas, paintCanvas]) {
      canvas.style.width = `${displayW}px`;
      canvas.style.height = `${displayH}px`;
    }
  }, []);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imageRef.current = img;
      historyRef.current = [];
      setHasPaint(false);
      setCanUndo(false);

      const imageCanvas = imageCanvasRef.current;
      const paintCanvas = paintCanvasRef.current;
      if (imageCanvas && paintCanvas) {
        // Force bitmap re-init for the new photo
        imageCanvas.width = img.naturalWidth;
        imageCanvas.height = img.naturalHeight;
        paintCanvas.width = img.naturalWidth;
        paintCanvas.height = img.naturalHeight;
        const ctx = imageCanvas.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, imageCanvas.width, imageCanvas.height);
          ctx.drawImage(img, 0, 0);
        }
        setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
      }

      syncCanvasSize();
      onReadyChange?.(true);
    };
    img.onerror = () => onReadyChange?.(false);
    img.src = imageUrl;
    onReadyChange?.(false);

    return () => {
      imageRef.current = null;
    };
  }, [imageUrl, onReadyChange, syncCanvasSize]);

  useEffect(() => {
    const onResize = () => syncCanvasSize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [syncCanvasSize]);

  const getPaintCtx = () => paintCanvasRef.current?.getContext("2d") ?? null;

  const pushHistory = () => {
    const canvas = paintCanvasRef.current;
    const ctx = getPaintCtx();
    if (!canvas || !ctx) return;
    historyRef.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    if (historyRef.current.length > 30) historyRef.current.shift();
    setCanUndo(true);
  };

  const pointerToCanvas = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = paintCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((e.clientY - rect.top) / rect.height) * canvas.height;
    return { x, y };
  };

  const drawStroke = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const ctx = getPaintCtx();
    if (!ctx) return;

    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = brushSize * (naturalSize.w / Math.max(paintCanvasRef.current?.clientWidth || 1, 1));

    if (mode === "erase") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.strokeStyle = "rgba(0,0,0,1)";
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = PAINT_COLOR;
    }

    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  };

  const handlePointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    e.preventDefault();
    const point = pointerToCanvas(e);
    if (!point) return;
    pushHistory();
    drawingRef.current = true;
    lastPointRef.current = point;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drawStroke(point, point);
    setHasPaint(true);
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || disabled) return;
    e.preventDefault();
    const point = pointerToCanvas(e);
    const last = lastPointRef.current;
    if (!point || !last) return;
    drawStroke(last, point);
    lastPointRef.current = point;
  };

  const handlePointerUp = () => {
    drawingRef.current = false;
    lastPointRef.current = null;
    const canvas = paintCanvasRef.current;
    const ctx = getPaintCtx();
    if (!canvas || !ctx) return;
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let painted = false;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 10) {
        painted = true;
        break;
      }
    }
    setHasPaint(painted);
  };

  const undo = () => {
    const canvas = paintCanvasRef.current;
    const ctx = getPaintCtx();
    const prev = historyRef.current.pop();
    if (!canvas || !ctx || !prev) return;
    ctx.putImageData(prev, 0, 0);
    setCanUndo(historyRef.current.length > 0);
    handlePointerUp();
  };

  const clearPaint = () => {
    const canvas = paintCanvasRef.current;
    const ctx = getPaintCtx();
    if (!canvas || !ctx) return;
    pushHistory();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasPaint(false);
  };

  const exportForApi = useCallback(async (): Promise<{
    cleanBlob: Blob;
    markedBlob: Blob;
  } | null> => {
    const img = imageRef.current;
    const paintCanvas = paintCanvasRef.current;
    if (!img || !paintCanvas || !img.naturalWidth) return null;

    const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));

    const cleanCanvas = document.createElement("canvas");
    cleanCanvas.width = w;
    cleanCanvas.height = h;
    const cleanCtx = cleanCanvas.getContext("2d");
    if (!cleanCtx) return null;
    cleanCtx.drawImage(img, 0, 0, w, h);

    const markedCanvas = document.createElement("canvas");
    markedCanvas.width = w;
    markedCanvas.height = h;
    const markedCtx = markedCanvas.getContext("2d");
    if (!markedCtx) return null;
    markedCtx.drawImage(img, 0, 0, w, h);
    markedCtx.drawImage(paintCanvas, 0, 0, w, h);

    const cleanBlob = await new Promise<Blob | null>((resolve) =>
      cleanCanvas.toBlob((b) => resolve(b), "image/png")
    );
    const markedBlob = await new Promise<Blob | null>((resolve) =>
      markedCanvas.toBlob((b) => resolve(b), "image/png")
    );

    if (!cleanBlob || !markedBlob) return null;
    return { cleanBlob, markedBlob };
  }, []);

  useEffect(() => {
    canvasRef.current = {
      exportForApi,
      hasPaint: () => hasPaint,
    };
  }, [canvasRef, exportForApi, hasPaint]);

  return (
    <div className="space-y-3">
      <div
        ref={containerRef}
        className="relative w-full overflow-hidden rounded-2xl border border-border bg-muted/40"
      >
        <canvas ref={imageCanvasRef} className="block w-full" aria-hidden />
        <canvas
          ref={paintCanvasRef}
          className="absolute inset-0 touch-none cursor-crosshair"
          style={{ touchAction: "none" }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setMode("paint")}
          disabled={disabled}
          className={`inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold touch-manipulation ${
            mode === "paint"
              ? "bg-primary text-primary-foreground"
              : "border border-border bg-white text-foreground"
          }`}
        >
          <Paintbrush className="h-4 w-4" aria-hidden />
          Paint
        </button>
        <button
          type="button"
          onClick={() => setMode("erase")}
          disabled={disabled}
          className={`inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold touch-manipulation ${
            mode === "erase"
              ? "bg-primary text-primary-foreground"
              : "border border-border bg-white text-foreground"
          }`}
        >
          <Eraser className="h-4 w-4" aria-hidden />
          Erase
        </button>
        <button
          type="button"
          onClick={undo}
          disabled={disabled || !canUndo}
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-white px-4 text-sm font-semibold text-foreground disabled:opacity-40 touch-manipulation"
        >
          <RotateCcw className="h-4 w-4" aria-hidden />
          Undo
        </button>
        <button
          type="button"
          onClick={clearPaint}
          disabled={disabled || !hasPaint}
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-white px-4 text-sm font-semibold text-foreground disabled:opacity-40 touch-manipulation"
        >
          <Trash2 className="h-4 w-4" aria-hidden />
          Clear
        </button>
      </div>

      <label className="flex items-center gap-3 text-sm text-muted-foreground">
        <span className="shrink-0 font-medium">Brush</span>
        <input
          type="range"
          min={12}
          max={64}
          value={brushSize}
          onChange={(e) => setBrushSize(Number(e.target.value))}
          disabled={disabled}
          className="w-full accent-primary"
          aria-label="Brush size"
        />
      </label>
    </div>
  );
}
