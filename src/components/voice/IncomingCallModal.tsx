"use client";

import { useEffect } from "react";
import { Phone, PhoneOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CallerIdDetails } from "@/components/voice/CallerIdDetails";
import { useVoiceDevice } from "@/contexts/VoiceDeviceProvider";
import { formatPhoneDisplay } from "@/lib/inbox/phone";

export function IncomingCallModal() {
  const { incomingCall, acceptIncoming, rejectIncoming } = useVoiceDevice();

  useEffect(() => {
    if (!incomingCall) return;
    const original = document.title;
    let highlight = true;
    document.title = "Incoming call";
    const titleTimer = window.setInterval(() => {
      document.title = highlight ? "Incoming call" : original;
      highlight = !highlight;
    }, 700);
    return () => {
      window.clearInterval(titleTimer);
      document.title = original;
    };
  }, [incomingCall]);

  if (!incomingCall) return null;

  const { callerInfo } = incomingCall;
  const isKnownCustomer = Boolean(callerInfo?.customerId && callerInfo?.name);
  const displayName = isKnownCustomer
    ? callerInfo!.name!
    : formatPhoneDisplay(callerInfo?.phone) || "Unknown caller";

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="alertdialog"
      aria-modal="true"
      aria-label="Incoming call"
    >
      <div className="w-full max-w-md rounded-2xl border-2 border-emerald-400 bg-card p-8 text-center shadow-2xl">
        <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 ring-8 ring-emerald-200/80">
          <Phone className="h-10 w-10 animate-pulse" />
        </div>
        <p className="text-sm font-semibold uppercase tracking-widest text-emerald-700">
          Incoming call
        </p>
        <p className="mt-2 text-2xl font-bold text-foreground">{displayName}</p>
        {isKnownCustomer ? (
          <CallerIdDetails
            callerInfo={callerInfo}
            className="mt-1 text-sm text-muted-foreground"
          />
        ) : null}
        <p className="mt-1 text-base text-muted-foreground">
          {formatPhoneDisplay(callerInfo?.phone)}
        </p>
        <div className="mt-8 flex gap-3">
          <Button
            variant="destructive"
            size="lg"
            className="h-14 flex-1 text-base"
            onClick={rejectIncoming}
          >
            <PhoneOff className="mr-2 h-5 w-5" />
            Decline
          </Button>
          <Button size="lg" className="h-14 flex-1 text-base" onClick={acceptIncoming}>
            <Phone className="mr-2 h-5 w-5" />
            Accept
          </Button>
        </div>
      </div>
    </div>
  );
}
