"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { HolidayLightingQuoter } from "@/components/holiday-lighting/HolidayLightingQuoter";
import { useHolidayLightingFeatures } from "@/components/layout/CompanyBrandProvider";

function NewQuoteInner() {
  const { enabled } = useHolidayLightingFeatures();
  const searchParams = useSearchParams();
  const customerId = searchParams.get("customerId");
  const customerName = searchParams.get("customerName");
  const address = searchParams.get("address");
  const city = searchParams.get("city");
  const state = searchParams.get("state");
  const zip = searchParams.get("zip");

  if (!enabled) {
    return (
      <ContentArea>
        <PageHeader title="New holiday lighting quote" />
        <p className="text-sm text-muted-foreground">
          Enable holiday lighting tools under{" "}
          <Link href="/settings" className="text-primary underline">
            Settings → Company
          </Link>
          .
        </p>
      </ContentArea>
    );
  }

  return (
    <ContentArea className="flex max-w-none flex-col">
      <PageHeader
        breadcrumb={["Holiday lighting", "New quote"]}
        title="New holiday lighting quote"
      />
      <HolidayLightingQuoter
        initialCustomerId={customerId}
        initialCustomerName={customerName}
        initialAddress={address}
        initialCity={city}
        initialState={state}
        initialZip={zip}
      />
    </ContentArea>
  );
}

export default function NewHolidayLightingQuotePage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-muted-foreground">Loading…</p>}>
      <NewQuoteInner />
    </Suspense>
  );
}
