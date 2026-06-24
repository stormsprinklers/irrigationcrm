"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type Props = {
  slug: string;
  error?: string | null;
};

export function PortalLoginForm({ slug, error }: Props) {
  const [email, setEmail] = useState("");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customers, setCustomers] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(targetCustomerId?: string) {
    setLoading(true);
    try {
      const res = await fetch("/api/portal/auth/request-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, email, customerId: targetCustomerId ?? customerId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to send link");
      if (data.multiple) {
        setCustomers(data.customers);
        return;
      }
      setSent(true);
      if (data.devLoginUrl) {
        toast.message("Dev mode: use login link from response", {
          description: data.devLoginUrl,
        });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send link");
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="portal-card text-center">
        <h2 className="font-display text-lg uppercase text-storm-navy">Check your email</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          If we found an account for {email}, we sent a sign-in link. It expires in 15 minutes.
        </p>
      </div>
    );
  }

  if (customers.length > 1) {
    return (
      <div className="space-y-4 rounded-lg border border-border bg-white p-6">
        <p className="text-sm text-muted-foreground">Multiple accounts match this email. Choose yours:</p>
        {customers.map((c) => (
          <Button
            key={c.id}
            variant="outline"
            className="w-full justify-start"
            disabled={loading}
            onClick={() => void submit(c.id)}
          >
            {c.name}
          </Button>
        ))}
      </div>
    );
  }

  return (
    <form
      className="portal-card space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {error ? (
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error === "expired" ? "That link expired. Request a new one." : "Invalid sign-in link."}
        </p>
      ) : null}
      <div>
        <label className="text-sm font-medium text-storm-navy">Email address</label>
        <Input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="mt-1"
        />
      </div>
      <Button type="submit" className="w-full bg-storm-coral hover:bg-storm-coral/90" disabled={loading}>
        {loading ? "Sending..." : "Email me a sign-in link"}
      </Button>
    </form>
  );
}
