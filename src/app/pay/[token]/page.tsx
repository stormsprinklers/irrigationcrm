import { Suspense } from "react";
import { PublicInvoicePayPage } from "@/components/invoices/PublicInvoicePayPage";

export default async function PayInvoicePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-lg p-8">
          <p className="text-sm text-muted-foreground">Loading invoice...</p>
        </main>
      }
    >
      <PublicInvoicePayPage token={token} />
    </Suspense>
  );
}
