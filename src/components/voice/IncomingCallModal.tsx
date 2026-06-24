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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold">Incoming call</h2>
        <p className="text-sm text-muted-foreground">Answer or decline</p>
        <div className="py-8 text-center">
          <p className="text-2xl font-semibold">{displayName}</p>
          {isKnownCustomer ? (
            <CallerIdDetails callerInfo={callerInfo} className="mt-2 text-base" />
          ) : null}
          <p className="mt-2 text-muted-foreground">{callerInfo?.phone}</p>
        </div>
        <div className="flex gap-3">
          <Button variant="destructive" className="flex-1" onClick={rejectIncoming}>
            <PhoneOff className="mr-2 h-4 w-4" />
            Decline
          </Button>
          <Button className="flex-1" onClick={acceptIncoming}>
            <Phone className="mr-2 h-4 w-4" />
            Accept
          </Button>
        </div>
      </div>
    </div>
  );
}
