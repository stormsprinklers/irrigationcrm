"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { EmailViewer } from "@/components/inbox/EmailViewer";

function ComposeEmailContent() {
  const searchParams = useSearchParams();
  return (
    <EmailViewer
      emailId={null}
      scope="customers"
      initialTo={searchParams.get("email")}
      initialCustomerId={searchParams.get("customerId")}
      initialName={searchParams.get("name")}
    />
  );
}

export default function InboxComposeEmailPage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-muted-foreground">Loading...</p>}>
      <ComposeEmailContent />
    </Suspense>
  );
}
