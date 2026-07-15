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

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
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
        <div className="flex flex-wrap items-center gap-1.5">
          <Button size="sm" variant="outline" onClick={toggleMute} aria-label={activeCall.muted ? "Unmute" : "Mute"}>
            {activeCall.muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void toggleHold()}
            aria-label={activeCall.onHold ? "Resume" : "Hold"}
          >
            {activeCall.onHold ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setTransferOpen(true)} aria-label="Transfer">
            <UserPlus className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="outline" onClick={openBookAppointment} aria-label="New appointment">
            <Plus className="mr-1 h-4 w-4" />
            New
          </Button>
          <Button size="sm" variant="destructive" className="ml-auto" onClick={disconnect}>
            <PhoneOff className="mr-1 h-4 w-4" />
            Hang up
          </Button>
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
