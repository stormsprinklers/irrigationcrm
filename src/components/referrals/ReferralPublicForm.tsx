"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { resolvePortalLogoUrl } from "@/lib/portal/branding";

type FormMeta = {
  companyName: string;
  logoUrl: string | null;
  referrerName: string;
  headline: string | null;
  terms: string | null;
};

export function ReferralPublicForm({ slug, token }: { slug: string; token: string }) {
  const [meta, setMeta] = useState<FormMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");

  useEffect(() => {
    fetch(`/api/refer/${slug}/${token}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Invalid referral link");
        return res.json() as Promise<FormMeta>;
      })
      .then(setMeta)
      .catch(() => toast.error("This referral link is not valid"))
      .finally(() => setLoading(false));
  }, [slug, token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/refer/${slug}/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, email, address, city, state, zip }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Submit failed");
      setSubmitted(true);
      toast.success("Referral submitted — we'll be in touch soon!");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!meta) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-center">
        <p className="text-muted-foreground">This referral link is not valid or the program is inactive.</p>
      </div>
    );
  }

  const logoUrl = resolvePortalLogoUrl(meta.logoUrl);

  return (
    <div className="min-h-screen bg-[#f8fafc] px-4 py-10">
      <div className="mx-auto max-w-lg rounded-xl border border-border bg-white p-6 shadow-sm">
        <div className="mb-6 text-center">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={meta.companyName} className="mx-auto mb-4 h-16 w-auto object-contain" />
          ) : (
            <p className="text-lg font-semibold">{meta.companyName}</p>
          )}
          <h1 className="text-xl font-semibold">
            {meta.headline ?? `${meta.referrerName} referred you`}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tell us about yourself and {meta.companyName} will reach out.
          </p>
        </div>

        {submitted ? (
          <div className="rounded-lg bg-green-50 p-4 text-center text-sm text-green-800">
            Thanks! Your referral was received. {meta.companyName} will contact you shortly.
          </div>
        ) : (
          <form onSubmit={(e) => void submit(e)} className="space-y-4">
            <div>
              <label htmlFor="name" className="mb-1 block text-sm font-medium">
                Your name *
              </label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <label htmlFor="phone" className="mb-1 block text-sm font-medium">
                Phone
              </label>
              <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div>
              <label htmlFor="email" className="mb-1 block text-sm font-medium">
                Email
              </label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label htmlFor="address" className="mb-1 block text-sm font-medium">
                Address
              </label>
              <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label htmlFor="city" className="mb-1 block text-sm font-medium">
                  City
                </label>
                <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} />
              </div>
              <div>
                <label htmlFor="state" className="mb-1 block text-sm font-medium">
                  State
                </label>
                <Input id="state" value={state} onChange={(e) => setState(e.target.value)} />
              </div>
            </div>
            <div>
              <label htmlFor="zip" className="mb-1 block text-sm font-medium">
                ZIP
              </label>
              <Input id="zip" value={zip} onChange={(e) => setZip(e.target.value)} />
            </div>
            {meta.terms ? (
              <p className="text-xs text-muted-foreground">{meta.terms}</p>
            ) : null}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              Submit referral
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
