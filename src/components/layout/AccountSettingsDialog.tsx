"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useSession } from "next-auth/react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatPhoneDisplay } from "@/lib/inbox/phone";

type Profile = {
  email: string;
  phone: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved?: (profile: { email: string; phone: string | null }) => void;
};

export function AccountSettingsDialog({ open, onClose, onSaved }: Props) {
  const { update } = useSession();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [phoneMasked, setPhoneMasked] = useState("");
  const [sendingCode, setSendingCode] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPassword("");
    setConfirmPassword("");
    setMfaCode("");
    setChallengeId("");
    setPhoneMasked("");
    setLoading(true);
    void (async () => {
      try {
        const res = await fetch("/api/account/profile");
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error(data.error ?? "Failed to load account");
          return;
        }
        setEmail(String(data.email ?? ""));
        setPhone(formatPhoneDisplay(data.phone) || String(data.phone ?? ""));
      } catch {
        toast.error("Failed to load account");
      } finally {
        setLoading(false);
      }
    })();
  }, [open]);

  if (!open) return null;

  async function saveContact(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, phone }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(typeof data.error === "string" ? data.error : "Failed to save");
        return;
      }
      const next: Profile = {
        email: String(data.email ?? email),
        phone: data.phone ?? null,
      };
      setEmail(next.email);
      setPhone(formatPhoneDisplay(next.phone) || next.phone || "");
      await update({ user: { email: next.email } });
      onSaved?.(next);
      toast.success("Account updated");
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function sendCode() {
    setSendingCode(true);
    try {
      const res = await fetch("/api/account/profile/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(typeof data.error === "string" ? data.error : "Could not send code");
        return;
      }
      setChallengeId(String(data.challengeId ?? ""));
      setPhoneMasked(String(data.phoneMasked ?? ""));
      if (data.debugCode) setMfaCode(String(data.debugCode));
      toast.success(`Verification code sent to ${data.phoneMasked ?? "your phone"}`);
    } catch {
      toast.error("Could not send code");
    } finally {
      setSendingCode(false);
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!challengeId) {
      toast.error("Send a verification code first");
      return;
    }
    setChangingPassword(true);
    try {
      const res = await fetch("/api/account/profile/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "change",
          challengeId,
          code: mfaCode,
          password,
          confirmPassword,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(typeof data.error === "string" ? data.error : "Failed to change password");
        return;
      }
      setPassword("");
      setConfirmPassword("");
      setMfaCode("");
      setChallengeId("");
      setPhoneMasked("");
      toast.success("Password updated");
    } catch {
      toast.error("Failed to change password");
    } finally {
      setChangingPassword(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="relative z-10 flex max-h-[min(86dvh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-1.5rem))] w-full max-w-md flex-col overflow-hidden rounded-lg border bg-background shadow-lg">
        <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
          <h2 className="font-semibold">Edit account</h2>
          <Button variant="ghost" size="icon" type="button" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <div className="space-y-8">
              <form onSubmit={(e) => void saveContact(e)} className="space-y-3">
                <div>
                  <label className="text-sm font-medium" htmlFor="account-email">
                    Email
                  </label>
                  <Input
                    id="account-email"
                    type="email"
                    autoComplete="email"
                    className="mt-1"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-medium" htmlFor="account-phone">
                    Cell phone
                  </label>
                  <Input
                    id="account-phone"
                    type="tel"
                    autoComplete="tel"
                    className="mt-1"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(555) 123-4567"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Used for two-factor authentication and job notifications.
                  </p>
                </div>
                <Button type="submit" disabled={saving}>
                  {saving ? "Saving…" : "Save contact info"}
                </Button>
              </form>

              <form onSubmit={(e) => void changePassword(e)} className="space-y-3 border-t pt-6">
                <h3 className="text-sm font-semibold">Change password</h3>
                <p className="text-xs text-muted-foreground">
                  We text a verification code to your cell phone before the new password is saved.
                </p>
                <div>
                  <label className="text-sm font-medium" htmlFor="account-password">
                    New password
                  </label>
                  <Input
                    id="account-password"
                    type="password"
                    autoComplete="new-password"
                    className="mt-1"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={8}
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-medium" htmlFor="account-password-confirm">
                    Confirm password
                  </label>
                  <Input
                    id="account-password-confirm"
                    type="password"
                    autoComplete="new-password"
                    className="mt-1"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    minLength={8}
                    required
                  />
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-0 flex-1">
                    <label className="text-sm font-medium" htmlFor="account-mfa">
                      Verification code
                    </label>
                    <Input
                      id="account-mfa"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      className="mt-1"
                      value={mfaCode}
                      onChange={(e) => setMfaCode(e.target.value)}
                      placeholder={phoneMasked ? `Code sent to ${phoneMasked}` : "6-digit code"}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={sendingCode}
                    onClick={() => void sendCode()}
                  >
                    {sendingCode ? "Sending…" : challengeId ? "Resend code" : "Send code"}
                  </Button>
                </div>
                <Button type="submit" disabled={changingPassword || !challengeId}>
                  {changingPassword ? "Updating…" : "Change password"}
                </Button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
