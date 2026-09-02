"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useVoiceDevice } from "@/contexts/VoiceDeviceProvider";
import { createCallDraftVisit } from "@/lib/schedule/create-draft";

export function BookCallAppointmentModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { activeCall, notifyVisitBooked } = useVoiceDevice();
  const started = useRef(false);

  useEffect(() => {
    if (!open) {
      started.current = false;
      return;
    }
    if (started.current) return;
    started.current = true;

    if (activeCall?.callerInfo?.doNotService) {
      toast.error("This customer is marked DO NOT SERVICE and cannot be scheduled");
      onOpenChange(false);
      return;
    }

    void (async () => {
      try {
        const visit = await createCallDraftVisit({
          customerId: activeCall?.callerInfo?.customerId,
          callSessionId: activeCall?.sessionId,
          callerName: activeCall?.callerInfo?.name,
          callerPhone: activeCall?.remoteNumber ?? activeCall?.callerInfo?.phone,
        });
        notifyVisitBooked(visit.id);
        onOpenChange(false);
        router.push(`/visits/${visit.id}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to create appointment");
        onOpenChange(false);
      }
    })();
  }, [open, activeCall, notifyVisitBooked, onOpenChange, router]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4">
      <div className="flex items-center gap-2 rounded-lg border border-border bg-white px-4 py-3 text-sm shadow-xl">
        <Loader2 className="h-4 w-4 animate-spin" />
        Opening appointment…
      </div>
    </div>
  );
}
