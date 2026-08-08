"use client";

import { useEffect, useMemo, useState } from "react";
import { Mail, MessageSquare, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PortalShell } from "./PortalShell";

type MeResponse = {
  customer: { name: string; email: string | null; phone: string | null };
  company: {
    name: string;
    phone: string | null;
    supportEmail: string | null;
    emailLogoUrl: string | null;
    features: Record<string, boolean>;
  };
};

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

function telHref(phone: string) {
  const digits = digitsOnly(phone);
  return digits ? `tel:+${digits.length === 10 ? `1${digits}` : digits}` : `tel:${phone}`;
}

function smsHref(phone: string) {
  const digits = digitsOnly(phone);
  const e164 = digits.length === 10 ? `+1${digits}` : digits.startsWith("+") ? digits : `+${digits}`;
  return `sms:${e164}`;
}

export function PortalContactView({ slug }: { slug: string }) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    fetch("/api/portal/me")
      .then((r) => r.json())
      .then((data: MeResponse) => {
        setMe(data);
        setPhone(data.customer.phone ?? "");
      })
      .catch(() => setError("Failed to load contact info"));
  }, []);

  const companyPhone = me?.company.phone?.trim() || "";
  const companyEmail = me?.company.supportEmail?.trim() || "";

  const smsLink = useMemo(() => (companyPhone ? smsHref(companyPhone) : null), [companyPhone]);
  const telLink = useMemo(() => (companyPhone ? telHref(companyPhone) : null), [companyPhone]);
  const mailLink = useMemo(
    () => (companyEmail ? `mailto:${companyEmail}` : null),
    [companyEmail]
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, message, phone }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not send message");
        return;
      }
      setSent(true);
      setSubject("");
      setMessage("");
    } catch {
      setError("Could not send message");
    } finally {
      setBusy(false);
    }
  }

  if (!me) {
    return <p className="text-sm text-[#1e293b]">Loading...</p>;
  }

  return (
    <PortalShell
      slug={slug}
      companyName={me.company.name}
      emailLogoUrl={me.company.emailLogoUrl}
      features={me.company.features as never}
    >
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl uppercase tracking-wide text-[#102341]">Contact us</h1>
          <p className="mt-1 text-sm text-[#1e293b]">
            Reach {me.company.name} by phone, text, email, or send a message to our office team.
          </p>
        </div>

        {(companyPhone || companyEmail) && (
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Quick contact
            </h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {telLink ? (
                <a
                  href={telLink}
                  className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-200 px-3 py-3 text-[#102341] hover:border-storm-sky hover:bg-slate-50"
                >
                  <Phone className="h-5 w-5 text-storm-sky" />
                  <span>
                    <span className="block text-xs font-medium uppercase text-slate-500">Call</span>
                    <span className="font-semibold">{companyPhone}</span>
                  </span>
                </a>
              ) : null}
              {smsLink ? (
                <a
                  href={smsLink}
                  className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-200 px-3 py-3 text-[#102341] hover:border-storm-sky hover:bg-slate-50"
                >
                  <MessageSquare className="h-5 w-5 text-storm-sky" />
                  <span>
                    <span className="block text-xs font-medium uppercase text-slate-500">Text</span>
                    <span className="font-semibold">{companyPhone}</span>
                  </span>
                </a>
              ) : null}
              {mailLink ? (
                <a
                  href={mailLink}
                  className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-200 px-3 py-3 text-[#102341] hover:border-storm-sky hover:bg-slate-50"
                >
                  <Mail className="h-5 w-5 text-storm-sky" />
                  <span>
                    <span className="block text-xs font-medium uppercase text-slate-500">Email</span>
                    <span className="break-all font-semibold">{companyEmail}</span>
                  </span>
                </a>
              ) : null}
            </div>
          </section>
        )}

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Send a message
          </h2>
          <p className="mt-1 text-sm text-[#1e293b]">
            Your message is sent to our admins, managers, and customer service team in the CRM.
          </p>

          {sent ? (
            <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              Message sent — we’ll get back to you soon.
              <Button
                type="button"
                variant="outline"
                className="mt-3"
                onClick={() => setSent(false)}
              >
                Send another message
              </Button>
            </div>
          ) : (
            <form className="mt-4 space-y-3" onSubmit={(e) => void submit(e)}>
              <div>
                <label className="mb-1 block text-sm font-medium text-[#102341]">Subject</label>
                <Input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="How can we help?"
                  maxLength={200}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[#102341]">
                  Best phone number
                </label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Optional callback number"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[#102341]">Message</label>
                <textarea
                  className="min-h-[140px] w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-[#102341]"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Tell us what you need…"
                  required
                  maxLength={4000}
                />
              </div>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              <Button
                type="submit"
                className="bg-storm-coral hover:bg-storm-coral/90"
                disabled={busy || message.trim().length < 5}
              >
                {busy ? "Sending…" : "Send message"}
              </Button>
            </form>
          )}
        </section>
      </div>
    </PortalShell>
  );
}
