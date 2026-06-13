import { PriceBookHub } from "@/components/price-book/PriceBookHub";
import { ContentArea } from "@/components/layout/ContentArea";

export default function PriceBookPage() {
  return (
    <ContentArea>
      <PriceBookHub
        type="SERVICE"
        title="Services"
        breadcrumb={["Price book", "Services"]}
      />
    </ContentArea>
  );
}
