import { Suspense } from "react";
import { WebsiteLeadsInbox } from "@/components/inbox/WebsiteLeadsInbox";

export default function InboxLeadsPage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-muted-foreground">Loading leads...</p>}>
      <WebsiteLeadsInbox />
    </Suspense>
  );
}
