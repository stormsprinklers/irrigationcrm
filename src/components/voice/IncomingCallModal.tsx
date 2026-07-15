"use client";

import { Phone, PhoneOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CallerIdDetails } from "@/components/voice/CallerIdDetails";
import { useVoiceDevice } from "@/contexts/VoiceDeviceProvider";

export function IncomingCallModal() {
  const { incomingCall, acceptIncoming, rejectIncoming } = useVoiceDevice();

  if (!incomingCall) return null;

  const { callerInfo } = incomingCall;
  const isKnownCustomer = Boolean(callerInfo?.customerId && callerInfo?.name);
  const displayName = isKnownCustomer
    ? callerInfo!.name!
    : (callerInfo?.phone ?? "Unknown caller");

  return (
    <div
      className="fixed right-3 top-[calc(3.5rem+0.75rem)] z-[60] w-[min(100vw-1.5rem,22rem)] rounded-lg border border-border bg-card p-4 shadow-lg sm:right-4 sm:top-[calc(4.5rem+0.75rem)]"
      role="alertdialog"
      aria-label="Incoming call"
    >
      <div className="mb-3 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <Phone className="h-5 w-5 animate-pulse" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Incoming call
          </p>
          <p className="truncate font-semibold text-foreground">{displayName}</p>
          {isKnownCustomer ? (
            <CallerIdDetails callerInfo={callerInfo} className="truncate text-xs text-muted-foreground" />
          ) : null}
          <p className="truncate text-xs text-muted-foreground">{callerInfo?.phone}</p>
        </div>
      </div>
      <div className="flex gap-2">
        <Button variant="destructive" size="sm" className="flex-1" onClick={rejectIncoming}>
          <PhoneOff className="mr-1.5 h-4 w-4" />
          Decline
        </Button>
        <Button size="sm" className="flex-1" onClick={acceptIncoming}>
          <Phone className="mr-1.5 h-4 w-4" />
          Accept
        </Button>
      </div>
    </div>
  );
}
