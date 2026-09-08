"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from "react";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 1.5;
const ZOOM_STEP = 0.1;
const ZOOM_WHEEL_SENSITIVITY = 0.0012;
const BRANCH_GAP_HALF = "0.75rem";

function clampZoom(value: number) {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(value * 1000) / 1000));
}

export function FlowArrowDown({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "h-0 w-0 border-l-[3.5px] border-r-[3.5px] border-t-[5px] border-l-transparent border-r-transparent border-t-neutral-500",
        className
      )}
      aria-hidden
    />
  );
}

export function VerticalConnector({
  taller,
  arrow = true,
}: {
  taller?: boolean;
  arrow?: boolean;
}) {
  return (
    <div className="flex flex-col items-center">
      <div className={`w-px bg-neutral-500 ${taller ? "h-5" : "h-3"}`} />
      {arrow ? <FlowArrowDown className="-mt-px" /> : null}
    </div>
  );
}

export function BranchFork({ columns }: { columns: ReactNode[] }) {
  const count = columns.length;
  if (count <= 0) return null;
  if (count === 1) {
    return (
      <div className="flex w-max flex-col items-center">
        <VerticalConnector taller />
        {columns[0]}
      </div>
    );
  }
  return (
    <div className="flex w-max flex-col items-center">
      <div className="h-3 w-px bg-neutral-500" />
      <div className="flex items-start gap-6">
        {columns.map((column, i) => (
          <div key={i} className="relative flex flex-col items-center">
            <div
              className="absolute top-0 h-px bg-neutral-500"
              style={
                i === 0
                  ? { left: "50%", right: `-${BRANCH_GAP_HALF}` }
                  : i === count - 1
                    ? { left: `-${BRANCH_GAP_HALF}`, right: "50%" }
                    : { left: `-${BRANCH_GAP_HALF}`, right: `-${BRANCH_GAP_HALF}` }
              }
            />
            <div className="flex h-7 flex-col items-center">
              <div className="w-px flex-1 bg-neutral-500" />
              <FlowArrowDown className="-mt-px" />
            </div>
            {column}
          </div>
        ))}
      </div>
    </div>
  );
}

function ZoomControls({
  zoom,
  onZoomChange,
}: {
  zoom: number;
  onZoomChange: (zoom: number) => void;
}) {
  return (
    <div className="absolute bottom-4 left-4 z-10 flex items-center gap-1 rounded-md border border-border bg-background/95 px-1 py-1 shadow-sm backdrop-blur-sm">
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-7 w-7"
        aria-label="Zoom out"
        disabled={zoom <= ZOOM_MIN}
        onClick={() => onZoomChange(clampZoom(zoom - ZOOM_STEP))}
      >
        <Minus className="h-3.5 w-3.5" />
      </Button>
      <span className="min-w-[3rem] text-center text-xs tabular-nums text-muted-foreground">
        {Math.round(zoom * 100)}%
      </span>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-7 w-7"
        aria-label="Zoom in"
        disabled={zoom >= ZOOM_MAX}
        onClick={() => onZoomChange(clampZoom(zoom + ZOOM_STEP))}
      >
        <Plus className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

export function PanCanvas({
  children,
  zoom,
  onZoomChange,
}: {
  children: ReactNode;
  zoom: number;
  onZoomChange: (zoom: number) => void;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const onZoomChangeRef = useRef(onZoomChange);
  onZoomChangeRef.current = onZoomChange;
  const pinchFocusRef = useRef<{
    vx: number;
    vy: number;
    contentX: number;
    contentY: number;
  } | null>(null);
  const [contentSize, setContentSize] = useState({ w: 1, h: 1 });
  const [grabbing, setGrabbing] = useState(false);

  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const measure = () => {
      setContentSize({
        w: Math.max(1, content.offsetWidth),
        h: Math.max(1, content.offsetHeight),
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(content);
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const focus = pinchFocusRef.current;
    if (!viewport || !focus) return;
    viewport.scrollLeft = focus.contentX * zoom - focus.vx;
    viewport.scrollTop = focus.contentY * zoom - focus.vy;
    pinchFocusRef.current = null;
  }, [zoom, contentSize.w, contentSize.h]);

  function beginZoom(nextZoom: number, clientX: number, clientY: number) {
    const viewport = viewportRef.current;
    const prev = zoomRef.current;
    const clamped = clampZoom(nextZoom);
    if (clamped === prev) return;
    if (viewport) {
      const rect = viewport.getBoundingClientRect();
      const vx = clientX - rect.left;
      const vy = clientY - rect.top;
      pinchFocusRef.current = {
        vx,
        vy,
        contentX: (viewport.scrollLeft + vx) / prev,
        contentY: (viewport.scrollTop + vy) / prev,
      };
    }
    onZoomChangeRef.current(clamped);
  }

  function zoomFromControls(nextZoom: number) {
    const viewport = viewportRef.current;
    if (!viewport) {
      onZoomChangeRef.current(clampZoom(nextZoom));
      return;
    }
    const rect = viewport.getBoundingClientRect();
    beginZoom(nextZoom, rect.left + rect.width / 2, rect.top + rect.height / 2);
  }

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      beginZoom(zoomRef.current - e.deltaY * ZOOM_WHEEL_SENSITIVITY, e.clientX, e.clientY);
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  function shouldIgnore(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return false;
    return Boolean(target.closest("button, input, textarea, select, a, label"));
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || shouldIgnore(e.target)) return;
    const el = viewportRef.current;
    if (!el) return;
    drag.current = {
      x: e.clientX,
      y: e.clientY,
      left: el.scrollLeft,
      top: el.scrollTop,
    };
    setGrabbing(true);
    el.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const el = viewportRef.current;
    const start = drag.current;
    if (!el || !start) return;
    el.scrollLeft = start.left - (e.clientX - start.x);
    el.scrollTop = start.top - (e.clientY - start.y);
  }

  function endDrag(e: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    drag.current = null;
    setGrabbing(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  }

  const scaledW = contentSize.w * zoom;
  const scaledH = contentSize.h * zoom;

  return (
    <div className="relative h-full min-h-0">
      <div
        ref={viewportRef}
        className={cn(
          "h-full min-h-0 overflow-auto bg-muted/30",
          grabbing ? "cursor-grabbing select-none" : "cursor-grab"
        )}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div className="relative" style={{ width: scaledW, height: scaledH }}>
          <div
            ref={contentRef}
            className="inline-block p-6"
            style={{
              width: "max-content",
              transform: `scale(${zoom})`,
              transformOrigin: "0 0",
            }}
          >
            {children}
          </div>
        </div>
      </div>
      <ZoomControls zoom={zoom} onZoomChange={zoomFromControls} />
    </div>
  );
}
