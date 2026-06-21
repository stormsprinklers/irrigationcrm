import PublicBookingPageClient from "./PublicBookingPageClient";

export default async function PublicBookingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <PublicBookingPageClient slug={slug} />;
}
