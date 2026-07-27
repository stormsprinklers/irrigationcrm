"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

type SearchUser = {
  id: string;
  name: string;
  email: string;
  companyName: string;
};

export default function AccountLinksPage() {
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [linked, setLinked] = useState<
    { userId: string; email: string; companyName: string }[]
  >([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/account/companies");
    if (!res.ok) return;
    const data = await res.json();
    setLinked(data.linked ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const linkByEmail = async () => {
    setBusy(true);
    setResult(null);
    try {
      const findRes = await fetch(
        `/api/account/companies/find?email=${encodeURIComponent(email.trim())}`
      );
      const found = (await findRes.json()) as SearchUser & { error?: string };
      if (!findRes.ok) {
        setResult(found.error ?? "User not found");
        return;
      }
      const res = await fetch("/api/account/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkedUserId: found.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult(data.error ?? "Link failed");
        return;
      }
      setResult(`Linked to ${found.companyName} (${found.email})`);
      setEmail("");
      await load();
    } catch {
      setResult("Network error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl space-y-6 p-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Add account</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Link your login to a staff user on another company (e.g. Storm ↔ Chestnut
          &amp; Cheer). After linking, use <strong>Switch accounts</strong> in the
          avatar menu to hop between brands.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Need a new brand in this CRM?{" "}
          <Link href="/settings/integrations/create-company" className="underline">
            Create a company
          </Link>
          .
        </p>
      </div>

      {result ? (
        <p className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">{result}</p>
      ) : null}

      <div className="space-y-3 rounded-xl border border-border bg-card p-4">
        <label className="block text-sm font-medium">
          Other company staff email
          <input
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@utah.christmas"
            type="email"
          />
        </label>
        <Button type="button" disabled={!email.trim() || busy} onClick={() => void linkByEmail()}>
          {busy ? "Linking…" : "Link accounts"}
        </Button>
      </div>

      <div>
        <h2 className="font-semibold">Linked companies</h2>
        <ul className="mt-2 space-y-2 text-sm">
          {linked.length === 0 ? (
            <li className="text-muted-foreground">No linked accounts yet.</li>
          ) : (
            linked.map((l) => (
              <li key={l.userId} className="rounded-md border border-border px-3 py-2">
                {l.companyName} · {l.email}
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
