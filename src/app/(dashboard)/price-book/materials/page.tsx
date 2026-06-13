import { PriceBookHub } from "@/components/price-book/PriceBookHub";
import { ContentArea } from "@/components/layout/ContentArea";

export default function PriceBookMaterialsPage() {
  return (
    <ContentArea>
      <PriceBookHub
        type="MATERIAL"
        title="Materials"
        breadcrumb={["Price book", "Materials"]}
      />
    </ContentArea>
  );
}
