"use client";

import { useState } from "react";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { CsrDeskPanel } from "@/components/voice/CsrDeskPanel";

export default function CsrDeskPage() {
  const [bookedVisitId, setBookedVisitId] = useState<string | null>(null);

  return (
    <ContentArea className="max-w-6xl">
      <PageHeader
        breadcrumb={["Inbox", "Voice", "CSR Desk"]}
        title="CSR Desk"
        subtitle="Take calls, book appointments, and manage the queue"
      />
      {bookedVisitId && (
        <p className="mb-4 text-sm text-green-700">
          Visit booked — disposition will link to this appointment when the call ends.
        </p>
      )}
      <CsrDeskPanel onVisitBooked={setBookedVisitId} />
    </ContentArea>
  );
}
