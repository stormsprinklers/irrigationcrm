import { redirect } from "next/navigation";

type Props = { params: Promise<{ id: string }> };

/** Legacy deep link — estimate detail lives at /estimates/[id]. */
export default async function LegacyCustomerEstimateRedirect({ params }: Props) {
  const { id } = await params;
  redirect(`/estimates/${id}`);
}
