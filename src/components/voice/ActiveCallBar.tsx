"use client";

import { useEffect, useState } from "react";
import {
  Mic,
  MicOff,
  Pause,
  PhoneOff,
  Play,
  Plus,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CallerIdDetails } from "@/components/voice/CallerIdDetails";
import { BookCallAppointmentModal } from "@/components/voice/BookCallAppointmentModal";
import { useVoiceDevice } from "@/contexts/VoiceDeviceProvider";
import { TransferDialog } from "@/components/voice/TransferDialog";
import { cn } from "@/lib/utils";

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
    transfer,
    openBookAppointment,
    bookAppointmentOpen,
    setBookAppointmentOpen,
  } = useVoiceDevice();
  const [seconds, setSeconds] = useState(0);
  const [transferOpen, setTransferOpen] = useState(false);

  useEffect(() => {
    if (!activeCall) {
      setSeconds(0);
      return;
    }
    const start = Date.now();
    const timer = setInterval(() => {
      setSeconds(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [activeCall]);

  if (!activeCall) return null;

  const label =
    activeCall.callerInfo?.customerId && activeCall.callerInfo?.name
      ? activeCall.callerInfo.name
      : (activeCall.remoteNumber ??
        (activeCall.direction === "inbound" ? "Incoming" : "Outbound"));

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
          <p className="text-xs text-muted-foreground">
            {formatDuration(seconds)}
            {activeCall.onHold ? " · On hold" : ""}
            {activeCall.muted ? " · Muted" : ""}
          </p>
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
