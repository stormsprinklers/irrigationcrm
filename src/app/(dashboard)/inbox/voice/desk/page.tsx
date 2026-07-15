"use client";

import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { CsrDeskPanel } from "@/components/voice/CsrDeskPanel";

export default function CsrDeskPage() {
  const [bookedVisitId, setBookedVisitId] = useState<string | null>(null);

  return (
    <div className="flex min-h-0 flex-1 flex-col px-4 py-3">
      <PageHeader
        breadcrumb={["Inbox", "Voice", "CSR Desk"]}
        title="CSR Desk"
        subtitle="Take calls, book appointments, and manage the queue"
        className="mb-2 shrink-0"
      />
      {bookedVisitId ? (
        <p className="mb-3 shrink-0 text-sm text-green-700">
          Visit booked — disposition will link to this appointment when the call ends.
        </p>
      ) : null}
      <CsrDeskPanel onVisitBooked={setBookedVisitId} />
    </div>
  );
}
