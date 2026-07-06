import { ReferralPublicForm } from "@/components/referrals/ReferralPublicForm";

type Props = { params: Promise<{ slug: string; token: string }> };

export default async function PublicReferralPage({ params }: Props) {
  const { slug, token } = await params;
  return <ReferralPublicForm slug={slug} token={token} />;
}
