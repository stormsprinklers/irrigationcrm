"use client";

import { useEffect, useState } from "react";
import { BookingForm } from "@/components/booking/BookingForm";

type Props = {
  slug: string;
};

export default function PublicBookingPageClient({ slug }: Props) {
  const [data, setData] = useState<{
    company: {
      name: string;
      phone: string | null;
      supportEmail: string | null;
      description: string | null;
    };
    slots: Array<{ startAt: string; endAt: string }>;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/book/public/${slug}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Not found");
        setData(json);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }, [slug]);

  if (error) {
    return (
      <main className="mx-auto max-w-lg p-8">
        <h1 className="text-2xl font-semibold">Online booking</h1>
        <p className="mt-2 text-muted-foreground">{error}</p>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="mx-auto max-w-lg p-8">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Book with {data.company.name}</h1>
        {data.company.description && (
          <p className="mt-2 text-sm text-muted-foreground">{data.company.description}</p>
        )}
      </div>
      <div className="rounded-lg border border-border bg-white p-6">
        <BookingForm
          slug={slug}
          company={data.company}
          initialSlots={data.slots}
          showHeader={false}
        />
      </div>
    </main>
  );
}
