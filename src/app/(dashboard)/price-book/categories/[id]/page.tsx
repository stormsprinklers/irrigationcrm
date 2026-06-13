import { PriceBookCategoryView } from "@/components/price-book/PriceBookCategoryView";
import { ContentArea } from "@/components/layout/ContentArea";

type Props = { params: Promise<{ id: string }> };

export default async function PriceBookCategoryPage({ params }: Props) {
  const { id } = await params;
  return (
    <ContentArea>
      <PriceBookCategoryView categoryId={id} />
    </ContentArea>
  );
}
