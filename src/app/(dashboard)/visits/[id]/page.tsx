import { VisitDetail } from "@/components/visits/VisitDetail";
import { ContentArea } from "@/components/layout/ContentArea";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function VisitPage({ params }: Props) {
  const { id } = await params;

  return (
    <ContentArea className="max-w-6xl">
      <VisitDetail visitId={id} />
    </ContentArea>
  );
}
