export default function CardSetupCancelledPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center p-8 text-center">
      <h1 className="text-2xl font-semibold">Card setup cancelled</h1>
      <p className="mt-2 text-muted-foreground">
        No card was saved. You can try again using the link from your service provider.
      </p>
    </main>
  );
}
