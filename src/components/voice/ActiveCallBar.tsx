"use client";

import { useEffect, useState } from "react";
import {
  Grid3x3,
  Mic,
  MicOff,
  Pause,
  PhoneOff,
  Play,
  Plus,
  UserPlus,
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

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

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
  const [transferOpen, setTransferOpen] = useState(false);
  const [keypadOpen, setKeypadOpen] = useState(false);
  const [dtmfSent, setDtmfSent] = useState("");
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

  return (
    <>
      <div
        className="fixed right-3 top-[calc(3.5rem+0.75rem)] z-[60] w-[min(100vw-1.5rem,22rem)] rounded-lg border border-border bg-card p-3 shadow-lg sm:right-4 sm:top-[calc(4.5rem+0.75rem)]"
        role="status"
        aria-label="Active call"
      >
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
