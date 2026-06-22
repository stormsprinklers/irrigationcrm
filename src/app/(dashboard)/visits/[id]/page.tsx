import { Suspense } from "react";
import { VisitDetail } from "@/components/visits/VisitDetail";
import { ContentArea } from "@/components/layout/ContentArea";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function VisitPage({ params }: Props) {
  const { id } = await params;

  return (
    <ContentArea className="max-w-6xl">
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading visit...</p>}>
        <VisitDetail visitId={id} />
      </Suspense>
    </ContentArea>
  );
}
