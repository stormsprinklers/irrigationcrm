import { AffiliateMagicSignIn } from "@/components/affiliate/AffiliateMagicSignIn";

export default async function AffiliateSignInPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = "" } = await searchParams;
  return <AffiliateMagicSignIn token={token} />;
}
