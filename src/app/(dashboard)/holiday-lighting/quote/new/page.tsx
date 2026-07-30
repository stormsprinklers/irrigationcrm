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
      <HolidayLightingQuoter initialCustomerId={customerId} />
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
