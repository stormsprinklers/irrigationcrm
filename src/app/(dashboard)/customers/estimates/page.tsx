import { Suspense } from "react";
import CustomerEstimatesPageInner from "./CustomerEstimatesPageInner";

export default function CustomerEstimatesPage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-muted-foreground">Loading...</p>}>
      <CustomerEstimatesPageInner />
    </Suspense>
  );
}
