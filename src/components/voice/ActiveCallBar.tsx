"use client";

import { useEffect, useState } from "react";
import {
  Mic,
  MicOff,
  Pause,
  Phone,
  PhoneOff,
  Play,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CallerIdDetails } from "@/components/voice/CallerIdDetails";
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
    completeWarmTransfer,
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
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-white px-4 py-3 shadow-lg">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="truncate font-semibold">{label}</p>
            <CallerIdDetails callerInfo={activeCall.callerInfo} className="truncate text-xs" />
            <p className="text-sm text-muted-foreground">
              {formatDuration(seconds)}
              {activeCall.onHold ? " · On hold" : ""}
              {activeCall.muted ? " · Muted" : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={toggleMute}>
              {activeCall.muted ? (
                <MicOff className="h-4 w-4" />
              ) : (
                <Mic className="h-4 w-4" />
              )}
            </Button>
            <Button size="sm" variant="outline" onClick={() => void toggleHold()}>
              {activeCall.onHold ? (
                <Play className="h-4 w-4" />
              ) : (
                <Pause className="h-4 w-4" />
              )}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setTransferOpen(true)}>
              <UserPlus className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="outline" onClick={() => void completeWarmTransfer()}>
              Complete transfer
            </Button>
            <Button size="sm" variant="destructive" onClick={disconnect}>
              <PhoneOff className="h-4 w-4" />
              Hang up
            </Button>
          </div>
        </div>
      </div>
      <TransferDialog
        open={transferOpen}
        onOpenChange={setTransferOpen}
        onTransfer={transfer}
      />
    </>
  );
}
