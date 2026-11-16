"use client";

import { useEffect, useMemo, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements } from "@stripe/react-stripe-js";
import { Copy, CreditCard, Link2, Loader2, Mail, MessageSquare, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CardSetupForm } from "@/components/customers/CardSetupForm";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

type PaymentMethod = {
  id: string;
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
};

type Props = {
  customerId: string;
  customerEmail: string | null;
  customerPhone: string | null;
  canManage: boolean;
};

export function CustomerPaymentMethodsSection({
  customerId,
  customerEmail,
  customerPhone,
  canManage,
}: Props) {
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [defaultPaymentMethodId, setDefaultPaymentMethodId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [linkLoading, setLinkLoading] = useState<"copy" | "email" | "sms" | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [publishableKey, setPublishableKey] = useState("");
  const [replacingMethod, setReplacingMethod] = useState<PaymentMethod | null>(null);
  const [removeMethod, setRemoveMethod] = useState<PaymentMethod | null>(null);
  const [removing, setRemoving] = useState(false);

  const stripePromise = useMemo(
    () => (publishableKey ? loadStripe(publishableKey) : null),
    [publishableKey]
  );

  useEffect(() => {
    fetch("/api/stripe/config")
      .then((r) => r.json())
      .then((data) => setPublishableKey(data.publishableKey ?? ""))
      .catch(() => setPublishableKey(""));
  }, []);

  const loadMethods = () => {
    setLoading(true);
    fetch(`/api/customers/${customerId}/payment-method`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? "Failed to load payment methods");
        setMethods(data.paymentMethods ?? []);
        setDefaultPaymentMethodId(data.defaultPaymentMethodId ?? null);
      })
      .catch(() => toast.error("Failed to load payment methods"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (canManage) loadMethods();
    else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, canManage]);

  async function sendSecureLink(channel: "email" | "sms") {
    if (channel === "email" && !customerEmail) {
      toast.error("Customer has no email on file");
      return;
    }
    if (channel === "sms" && !customerPhone) {
      toast.error("Customer has no phone number on file");
      return;
    }
    setLinkLoading(channel);
    try {
      const res = await fetch(`/api/customers/${customerId}/payment-method/send-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to send link");
      if (channel === "sms") {
        toast.success(`Secure link texted to ${data.textedTo}`);
      } else {
        toast.success(`Secure link emailed to ${data.emailedTo}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send link");
    } finally {
      setLinkLoading(null);
    }
  }

  async function copySecureLink() {
    setLinkLoading("copy");
    try {
      const res = await fetch(`/api/customers/${customerId}/payment-method/link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error ?? "Failed to create link");
      await navigator.clipboard.writeText(data.url);
      toast.success("Secure save-card link copied");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to copy link");
    } finally {
      setLinkLoading(null);
    }
  }

  async function startManualEntry(methodToReplace?: PaymentMethod) {
    if (!publishableKey) {
      toast.error("STRIPE_PUBLISHABLE_KEY is not configured");
      return;
    }
    setFormLoading(true);
    try {
      const res = await fetch(`/api/customers/${customerId}/payment-method`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.clientSecret) {
        throw new Error(data.error ?? "Failed to start card setup");
      }
      setClientSecret(data.clientSecret);
      setReplacingMethod(methodToReplace ?? null);
      setShowForm(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start card setup");
    } finally {
      setFormLoading(false);
    }
  }

  function closeForm() {
    setShowForm(false);
    setClientSecret(null);
    setReplacingMethod(null);
  }

  async function finishCardSetup(paymentMethodId: string) {
    const updateRes = await fetch(`/api/customers/${customerId}/payment-method`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentMethodId }),
    });
    const updateData = await updateRes.json().catch(() => ({}));
    if (!updateRes.ok) throw new Error(updateData.error ?? "Failed to activate card");

    if (replacingMethod && replacingMethod.id !== paymentMethodId) {
      const removeRes = await fetch(`/api/customers/${customerId}/payment-method`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentMethodId: replacingMethod.id }),
      });
      const removeData = await removeRes.json().catch(() => ({}));
      if (!removeRes.ok) throw new Error(removeData.error ?? "New card saved, but old card could not be removed");
    }

    toast.success(replacingMethod ? "Card updated" : "Card saved on file");
    closeForm();
    loadMethods();
  }

  async function removeSavedCard() {
    if (!removeMethod) return;
    setRemoving(true);
    try {
      const res = await fetch(`/api/customers/${customerId}/payment-method`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentMethodId: removeMethod.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to remove card");
      toast.success("Card removed from file");
      setRemoveMethod(null);
      loadMethods();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to remove card");
    } finally {
      setRemoving(false);
    }
  }

  if (!canManage) return null;

  return (
    <Card>
      <CardHeader className="flex flex-col items-start gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="text-base">Cards on file</CardTitle>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void startManualEntry()}
            disabled={Boolean(linkLoading) || formLoading || showForm}
          >
            {formLoading ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <CreditCard className="mr-1 h-4 w-4" />
            )}
            Add new card
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void copySecureLink()}
            disabled={Boolean(linkLoading)}
          >
            {linkLoading === "copy" ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Copy className="mr-1 h-4 w-4" />
            )}
            Copy save-card link
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void sendSecureLink("email")}
            disabled={Boolean(linkLoading) || !customerEmail}
          >
            {linkLoading === "email" ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Mail className="mr-1 h-4 w-4" />
            )}
            Email link
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void sendSecureLink("sms")}
            disabled={Boolean(linkLoading) || !customerPhone}
          >
            {linkLoading === "sms" ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <MessageSquare className="mr-1 h-4 w-4" />
            )}
            Text link
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Save a card for faster checkout. Send the customer a secure Stripe link by email or text,
          copy it to send another way, or add or update a card here.
        </p>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading cards...</p>
        ) : methods.length === 0 ? (
          <p className="text-sm text-muted-foreground">No cards on file.</p>
        ) : (
          <div className="space-y-2">
            {methods.map((pm) => (
              <div
                key={pm.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Link2 className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium capitalize">{pm.brand ?? "Card"}</span>
                  <span>•••• {pm.last4}</span>
                  {pm.expMonth && pm.expYear ? (
                    <Badge variant="secondary">
                      {pm.expMonth}/{String(pm.expYear).slice(-2)}
                    </Badge>
                  ) : null}
                  {pm.id === defaultPaymentMethodId ? <Badge>Default</Badge> : null}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => void startManualEntry(pm)}
                    disabled={showForm || formLoading || removing}
                  >
                    <Pencil className="mr-1 h-3.5 w-3.5" />
                    Update
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setRemoveMethod(pm)}
                    disabled={showForm || formLoading || removing}
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5" />
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {showForm && clientSecret && stripePromise ? (
          <Elements
            stripe={stripePromise}
            options={{ clientSecret, appearance: { theme: "stripe" } }}
          >
            <CardSetupForm
              onSaved={finishCardSetup}
              onCancel={closeForm}
              submitLabel={replacingMethod ? "Save updated card" : "Save card on file"}
            />
          </Elements>
        ) : null}
      </CardContent>
      <ConfirmDialog
        open={Boolean(removeMethod)}
        title="Remove card on file?"
        description={`This will remove the ${removeMethod?.brand ?? "card"} ending in ${removeMethod?.last4 ?? ""} from Stripe and future CRM payments. This does not refund previous payments.`}
        confirmLabel="Remove card"
        confirmVariant="destructive"
        busy={removing}
        onConfirm={() => void removeSavedCard()}
        onCancel={() => setRemoveMethod(null)}
      />
    </Card>
  );
}
