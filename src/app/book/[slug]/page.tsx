export default async function PublicBookingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return (
    <main className="mx-auto max-w-lg p-8">
      <h1 className="text-2xl font-semibold">Online booking</h1>
      <p className="mt-2 text-muted-foreground">
        Booking page for <strong>{slug}</strong> is not fully implemented yet. Contact the office to schedule service.
      </p>
    </main>
  );
}
