import { HiringBookingClient } from "./HiringBookingClient";

export default async function HiringPublicBookingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <HiringBookingClient token={token} />
      </div>
    </main>
  );
}
