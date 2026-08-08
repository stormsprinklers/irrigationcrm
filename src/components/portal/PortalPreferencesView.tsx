"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { resolvePortalLogoUrl } from "@/lib/portal/branding";

type Prefs = {
  marketingEmail: boolean;
  marketingSms: boolean;
  appointmentReminderEmail: boolean;
  appointmentReminderSms: boolean;
};

export function PortalPreferencesView({ slug }: { slug: string }) {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [companyName, setCompanyName] = useState("");
  const [emailLogoUrl, setEmailLogoUrl] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [doNotService, setDoNotService] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [confirmDns, setConfirmDns] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("Missing preferences link. Open the link from your email.");
      return;
    }
    fetch(`/api/portal/preferences?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load");
        setCompanyName(data.companyName);
        setEmailLogoUrl(data.emailLogoUrl);
        setPrefs(data.preferences);
        setDoNotService(Boolean(data.doNotService));
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }, [token]);

  function allOff(next: Prefs) {
    return (
      !next.marketingEmail &&
      !next.marketingSms &&
      !next.appointmentReminderEmail &&
      !next.appointmentReminderSms
    );
  }

  async function save(next: Prefs, confirmDoNotService = false) {
    if (!token) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/portal/preferences?token=${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...next, confirmDoNotService }),
      });
      const data = await res.json();
      if (res.status === 409 && data.error === "confirm_do_not_service") {
        setConfirmDns(true);
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setPrefs(data.preferences);
      setDoNotService(Boolean(data.doNotService));
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function toggle(key: keyof Prefs, value: boolean) {
    if (!prefs) return;
    const next = { ...prefs, [key]: value };
    setPrefs(next);
  }

  const logoUrl = resolvePortalLogoUrl(emailLogoUrl);

  return (
    <div className="portal-shell light min-h-screen bg-[#f1f5f9] text-[#102341]">
      <div className="mx-auto max-w-lg px-4 py-10">
        <div className="mb-6 text-center">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={companyName} className="mx-auto h-14 w-auto object-contain" />
          ) : (
            <h1 className="font-display text-xl uppercase tracking-wide">{companyName || "Messaging preferences"}</h1>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Messaging preferences</h2>
          <p className="mt-1 text-sm text-[#1e293b]">
            Choose which messages you want from {companyName || "us"}. Invoice and billing emails are
            not controlled here.
          </p>

          {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}

          {!prefs && !error ? (
            <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
          ) : null}

          {prefs ? (
            <div className="mt-5 space-y-4">
              <div className="overflow-hidden rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-2 font-medium">Type</th>
                      <th className="px-3 py-2 font-medium">Email</th>
                      <th className="px-3 py-2 font-medium">SMS</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b">
                      <td className="px-3 py-3">
                        <div className="font-medium">Marketing</div>
                        <div className="text-xs text-slate-500">Offers, deals, and promotions</div>
                      </td>
                      <td className="px-3 py-3">
                        <Checkbox
                          checked={prefs.marketingEmail}
                          onCheckedChange={(v) => toggle("marketingEmail", v === true)}
                        />
                      </td>
                      <td className="px-3 py-3">
                        <Checkbox
                          checked={prefs.marketingSms}
                          onCheckedChange={(v) => toggle("marketingSms", v === true)}
                        />
                      </td>
                    </tr>
                    <tr>
                      <td className="px-3 py-3">
                        <div className="font-medium">Appointment reminders</div>
                        <div className="text-xs text-slate-500">
                          Visit scheduled, updates, and on-the-way messages
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <Checkbox
                          checked={prefs.appointmentReminderEmail}
                          onCheckedChange={(v) => toggle("appointmentReminderEmail", v === true)}
                        />
                      </td>
                      <td className="px-3 py-3">
                        <Checkbox
                          checked={prefs.appointmentReminderSms}
                          onCheckedChange={(v) => toggle("appointmentReminderSms", v === true)}
                        />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {doNotService ? (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                  Your account is currently marked Do Not Service. Re-enabling any message type
                  below will clear that flag so we can serve your property again.
                </p>
              ) : null}

              {allOff(prefs) ? (
                <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-950">
                  Turning off all options will mark you as Do Not Service — we will not return to
                  your property.
                </p>
              ) : null}

              {saved ? (
                <p className="text-sm text-emerald-700">Preferences saved.</p>
              ) : null}

              <Button
                type="button"
                className="bg-storm-coral hover:bg-storm-coral/90"
                disabled={saving}
                onClick={() => void save(prefs)}
              >
                {saving ? "Saving…" : "Save preferences"}
              </Button>
            </div>
          ) : null}
        </div>

        <p className="mt-4 text-center text-xs text-slate-500">
          Portal: /portal/{slug}
        </p>
      </div>

      <ConfirmDialog
        open={confirmDns}
        title="Unsubscribe from all communications?"
        description="This will mark your account as Do Not Service. We will not return to your property and will stop marketing and appointment reminder messages. Invoice emails may still be sent for open balances."
        confirmLabel="Yes, unsubscribe from all"
        confirmVariant="destructive"
        busy={saving}
        onCancel={() => setConfirmDns(false)}
        onConfirm={() => {
          setConfirmDns(false);
          if (prefs) void save(prefs, true);
        }}
      />
    </div>
  );
}
