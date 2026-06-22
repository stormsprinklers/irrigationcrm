import { CheckCircle2 } from "lucide-react";

export default function CardSetupSuccessPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center p-8 text-center">
      <CheckCircle2 className="mb-4 h-12 w-12 text-green-600" />
      <h1 className="text-2xl font-semibold">Card saved</h1>
      <p className="mt-2 text-muted-foreground">
        Your payment card has been securely saved on file. You can close this page.
      </p>
    </main>
  );
}
