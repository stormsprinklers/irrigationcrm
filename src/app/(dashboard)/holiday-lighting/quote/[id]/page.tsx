"use client";

import { use } from "react";
import Link from "next/link";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { HolidayLightingQuoter } from "@/components/holiday-lighting/HolidayLightingQuoter";
import { useHolidayLightingFeatures } from "@/components/layout/CompanyBrandProvider";

export default function HolidayLightingQuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { enabled } = useHolidayLightingFeatures();

  if (!enabled) {
    return (
      <ContentArea>
        <PageHeader title="Holiday lighting quote" />
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
      <PageHeader breadcrumb={["Holiday lighting", "Quote"]} title="Holiday lighting quote" />
      <HolidayLightingQuoter quoteId={id} />
    </ContentArea>
  );
}
