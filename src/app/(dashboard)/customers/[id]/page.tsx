import { CustomerProfile } from "@/components/customers/CustomerProfile";
import { ContentArea } from "@/components/layout/ContentArea";

type Props = { params: Promise<{ id: string }> };

export default async function CustomerDetailPage({ params }: Props) {
  const { id } = await params;

  return (
    <ContentArea className="max-w-5xl">
      <CustomerProfile customerId={id} />
    </ContentArea>
  );
}
