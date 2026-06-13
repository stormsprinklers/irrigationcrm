import { EstimateDetail } from "@/components/estimates/EstimateDetail";
import { ContentArea } from "@/components/layout/ContentArea";

type Props = { params: Promise<{ id: string }> };

export default async function EstimatePage({ params }: Props) {
  const { id } = await params;

  return (
    <ContentArea className="max-w-6xl">
      <EstimateDetail estimateId={id} />
    </ContentArea>
  );
}
