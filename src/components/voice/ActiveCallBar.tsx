"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Grid3x3,
  GripHorizontal,
  Mic,
  MicOff,
  Pause,
  PhoneOff,
  Play,
  Plus,
  UserPlus,
  UserRoundPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CallDialPad, isDtmfKey } from "@/components/voice/CallDialPad";
import { CallerIdDetails } from "@/components/voice/CallerIdDetails";
import { InboundLineCard } from "@/components/voice/InboundLineCard";
import { BookCallAppointmentModal } from "@/components/voice/BookCallAppointmentModal";
import { useVoiceDevice } from "@/contexts/VoiceDeviceProvider";
import { TransferDialog } from "@/components/voice/TransferDialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { formatPhoneDisplay } from "@/lib/inbox/phone";
import { createDraftCustomer } from "@/lib/schedule/create-draft";

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const CALL_BOX_POSITION_KEY = "storm-crm-active-call-position";
const VIEWPORT_MARGIN = 8;

type CallBoxPosition = { left: number; top: number };

function CallActionButton({
  label,
  onClick,
  ariaLabel,
  variant = "outline",
  className,
  children,
}: {
  label: string;
  onClick: () => void;
  ariaLabel: string;
  variant?: "outline" | "destructive" | "default";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-0.5", className)}>
      <Button size="sm" variant={variant} onClick={onClick} aria-label={ariaLabel}>
        {children}
      </Button>
      <span className="text-[10px] leading-tight text-muted-foreground">{label}</span>
    </div>
  );
}

export function ActiveCallBar() {
  const router = useRouter();
  const {
    activeCall,
    disconnect,
    toggleMute,
    toggleHold,
    sendDigits,
    transfer,
    openBookAppointment,
    bookAppointmentOpen,
    setBookAppointmentOpen,
  } = useVoiceDevice();
  const [seconds, setSeconds] = useState(0);
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [keypadOpen, setKeypadOpen] = useState(false);
  const [dtmfSent, setDtmfSent] = useState("");
  const [boxPosition, setBoxPosition] = useState<CallBoxPosition | null>(null);
  const [dragging, setDragging] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null);
  const [waitingQueue, setWaitingQueue] = useState<
    Array<{ id: string; fromNumber: string; customer?: { name: string | null } | null }>
  >([]);

  useEffect(() => {
    if (!activeCall) {
      setSeconds(0);
      setKeypadOpen(false);
      setDtmfSent("");
      return;
    }
    const start = Date.now();
    const timer = setInterval(() => {
      setSeconds(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [activeCall]);

  const clampToViewport = useCallback((left: number, top: number): CallBoxPosition => {
    const box = boxRef.current;
    const width = box?.offsetWidth ?? Math.min(window.innerWidth - VIEWPORT_MARGIN * 2, 352);
    const height = box?.offsetHeight ?? 280;
    return {
      left: Math.max(VIEWPORT_MARGIN, Math.min(left, Math.max(VIEWPORT_MARGIN, window.innerWidth - width - VIEWPORT_MARGIN))),
      top: Math.max(VIEWPORT_MARGIN, Math.min(top, Math.max(VIEWPORT_MARGIN, window.innerHeight - height - VIEWPORT_MARGIN))),
    };
  }, []);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(CALL_BOX_POSITION_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored) as Partial<CallBoxPosition>;
      if (typeof parsed.left === "number" && typeof parsed.top === "number") {
        setBoxPosition(clampToViewport(parsed.left, parsed.top));
      }
    } catch {
      // A malformed local preference should never affect calls.
    }
  }, [clampToViewport]);

  useEffect(() => {
    const keepInViewport = () => {
      setBoxPosition((position) => {
        if (!position) return position;
        const clamped = clampToViewport(position.left, position.top);
        return clamped.left === position.left && clamped.top === position.top ? position : clamped;
      });
    };
    window.addEventListener("resize", keepInViewport);
    return () => window.removeEventListener("resize", keepInViewport);
  }, [clampToViewport]);

  useEffect(() => {
    if (!boxPosition) return;
    const frame = window.requestAnimationFrame(() => {
      setBoxPosition((position) => {
        if (!position) return position;
        const clamped = clampToViewport(position.left, position.top);
        return clamped.left === position.left && clamped.top === position.top ? position : clamped;
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [boxPosition, clampToViewport, keypadOpen, waitingQueue.length]);

  useEffect(() => {
    if (!keypadOpen || !activeCall) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (!isDtmfKey(event.key)) return;
      event.preventDefault();
      if (sendDigits(event.key)) {
        setDtmfSent((prev) => (prev + event.key).slice(-24));
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [keypadOpen, activeCall, sendDigits]);

  useEffect(() => {
    if (!activeCall) {
      setWaitingQueue([]);
      return;
    }
    let previousCount = 0;
    const load = () => {
      fetch("/api/voice/queue")
        .then((r) => r.json())
        .then((data) => {
          const next = (data.queue ?? []) as typeof waitingQueue;
          if (next.length > previousCount) {
            const newest = next[next.length - 1];
            toast.message("Caller waiting in queue", {
              description: newest?.customer?.name
                ? `${newest.customer.name} is on hold.`
                : "A caller is on hold until you finish this call.",
              duration: 8000,
            });
          }
          previousCount = next.length;
          setWaitingQueue(next);
        })
        .catch(() => {});
    };
    load();
    const timer = setInterval(load, 4000);
    return () => clearInterval(timer);
  }, [activeCall]);

  if (!activeCall) return null;

  const label =
    activeCall.callerInfo?.customerId && activeCall.callerInfo?.name
      ? activeCall.callerInfo.name
      : formatPhoneDisplay(activeCall.remoteNumber) ||
        (activeCall.direction === "inbound" ? "Incoming" : "Outbound");

  const knownCustomerId = activeCall.callerInfo?.customerId;
  const callerName = activeCall.callerInfo?.name;
  const callerPhone = activeCall.remoteNumber || activeCall.callerInfo?.phone;

  async function createCustomerFromCall() {
    if (creatingCustomer) return;
    if (knownCustomerId) {
      router.push(`/customers/${knownCustomerId}?edit=1`);
      return;
    }
    setCreatingCustomer(true);
    try {
      const created = await createDraftCustomer({
        name: callerName,
        phone: callerPhone,
      });
      router.push(`/customers/${created.id}?edit=1`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create customer");
    } finally {
      setCreatingCustomer(false);
    }
  }

  function startDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const box = boxRef.current;
    if (!box) return;
    event.preventDefault();
    const rect = box.getBoundingClientRect();
    dragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setBoxPosition({ left: rect.left, top: rect.top });
    setDragging(true);
  }

  function moveDrag(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setBoxPosition(clampToViewport(event.clientX - drag.offsetX, event.clientY - drag.offsetY));
  }

  function endDrag(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
    setDragging(false);
    setBoxPosition((position) => {
      if (position) {
        window.localStorage.setItem(CALL_BOX_POSITION_KEY, JSON.stringify(position));
      }
      return position;
    });
  }

  return (
    <>
      <div
        ref={boxRef}
        className={cn(
          "fixed z-[60] w-[min(100vw-1.5rem,22rem)] rounded-lg border border-border bg-card p-3 shadow-lg",
          boxPosition ? "" : "right-3 top-[calc(3.5rem+0.75rem)] sm:right-4 sm:top-[calc(4.5rem+0.75rem)]"
        )}
        style={boxPosition ? { left: boxPosition.left, top: boxPosition.top } : undefined}
        role="status"
        aria-label="Active call"
      >
        <div
          className={cn(
            "mb-2 flex touch-none select-none items-center justify-between rounded-md px-1 py-0.5 text-xs text-muted-foreground",
            dragging ? "cursor-grabbing bg-muted" : "cursor-grab hover:bg-muted/70"
          )}
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          aria-label="Drag live call box to move it"
        >
          <span>Drag to move</span>
          <GripHorizontal className="h-4 w-4" aria-hidden />
        </div>
        <div className="mb-3 min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {activeCall.transferring
              ? "Warm transfer"
              : activeCall.direction === "inbound"
                ? "On call"
                : "Outbound call"}
          </p>
          <p className="truncate font-semibold text-foreground">{label}</p>
          <CallerIdDetails
            callerInfo={activeCall.callerInfo}
            className="truncate text-xs text-muted-foreground"
          />
          {activeCall.direction === "inbound" ? (
            <InboundLineCard info={activeCall.inboundLine} className="mt-2" />
          ) : null}
          <p className="text-xs text-muted-foreground">
            {formatDuration(seconds)}
            {activeCall.onHold ? " · On hold" : ""}
            {activeCall.muted ? " · Muted" : ""}
          </p>
          {waitingQueue.length > 0 ? (
            <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs text-amber-950">
              <p className="font-semibold">
                {waitingQueue.length === 1
                  ? "1 caller waiting in queue"
                  : `${waitingQueue.length} callers waiting in queue`}
              </p>
              <p className="mt-0.5 text-[11px] text-amber-900/80">
                They are on hold. Pick them up from CSR Desk after this call.
              </p>
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <CallActionButton
            label={activeCall.muted ? "Unmute" : "Mute"}
            ariaLabel={activeCall.muted ? "Unmute" : "Mute"}
            onClick={toggleMute}
          >
            {activeCall.muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </CallActionButton>
          <CallActionButton
            label={activeCall.onHold ? "Resume" : "Hold"}
            ariaLabel={activeCall.onHold ? "Resume" : "Hold"}
            onClick={() => void toggleHold()}
          >
            {activeCall.onHold ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
          </CallActionButton>
          <CallActionButton
            label={keypadOpen ? "Hide pad" : "Keypad"}
            ariaLabel={keypadOpen ? "Hide keypad" : "Show keypad"}
            variant={keypadOpen ? "default" : "outline"}
            onClick={() => setKeypadOpen((open) => !open)}
          >
            <Grid3x3 className="h-4 w-4" />
          </CallActionButton>
          <CallActionButton
            label="Transfer"
            ariaLabel="Transfer"
            onClick={() => setTransferOpen(true)}
          >
            <UserPlus className="h-4 w-4" />
          </CallActionButton>
          <CallActionButton
            label="New appt"
            ariaLabel="New appointment"
            onClick={openBookAppointment}
          >
            <Plus className="h-4 w-4" />
          </CallActionButton>
          <CallActionButton
            label={knownCustomerId ? "Customer" : "New customer"}
            ariaLabel={knownCustomerId ? "Open customer" : "New customer"}
            onClick={() => void createCustomerFromCall()}
          >
            <UserRoundPlus className="h-4 w-4" />
          </CallActionButton>
          <CallActionButton
            label="Hang up"
            ariaLabel="Hang up"
            variant="destructive"
            className="ml-auto"
            onClick={disconnect}
          >
            <PhoneOff className="h-4 w-4" />
          </CallActionButton>
        </div>
        {keypadOpen ? (
          <div className="mt-3 border-t border-border pt-3">
            <p className="mb-2 min-h-5 truncate text-center font-mono text-sm tracking-[0.2em] text-foreground">
              {dtmfSent || "Enter digits"}
            </p>
            <CallDialPad
              compact
              onDigit={(digit) => {
                if (sendDigits(digit)) {
                  setDtmfSent((prev) => (prev + digit).slice(-24));
                }
              }}
            />
          </div>
        ) : null}
      </div>
      <TransferDialog
        open={transferOpen}
        onOpenChange={setTransferOpen}
        onTransfer={transfer}
      />
      <BookCallAppointmentModal
        open={bookAppointmentOpen}
        onOpenChange={setBookAppointmentOpen}
      />
    </>
  );
}
