"use client";

import { useEffect, useMemo, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements } from "@stripe/react-stripe-js";
import { Copy, CreditCard, Link2, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CardSetupForm } from "@/components/customers/CardSetupForm";

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
  canManage: boolean;
};

export function CustomerPaymentMethodsSection({
  customerId,
  customerEmail,
  canManage,
}: Props) {
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [linkLoading, setLinkLoading] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [publishableKey, setPublishableKey] = useState("");

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
      .then((r) => r.json())
      .then((data) => setMethods(data.paymentMethods ?? []))
      .catch(() => toast.error("Failed to load payment methods"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (canManage) loadMethods();
    else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, canManage]);

  async function getSecureLink() {
    setLinkLoading(true);
    try {
      const res = await fetch(`/api/customers/${customerId}/payment-method/link`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create link");
      await navigator.clipboard.writeText(data.url);
      toast.success("Secure link copied to clipboard");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create link");
    } finally {
      setLinkLoading(false);
    }
  }

  async function sendSecureLink() {
    if (!customerEmail) {
      toast.error("Customer has no email on file");
      return;
    }
    setLinkLoading(true);
    try {
      const res = await fetch(`/api/customers/${customerId}/payment-method/send-link`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to send link");
      toast.success(`Secure link emailed to ${data.emailedTo}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send link");
    } finally {
      setLinkLoading(false);
    }
  }

  async function startManualEntry() {
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
  }

  if (!canManage) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Cards on file</CardTitle>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={startManualEntry}
            disabled={linkLoading || formLoading || showForm}
          >
            {formLoading ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <CreditCard className="mr-1 h-4 w-4" />
            )}
            Add manually
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={getSecureLink}
            disabled={linkLoading}
          >
            <Copy className="mr-1 h-4 w-4" />
            Copy link
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={sendSecureLink}
            disabled={linkLoading || !customerEmail}
          >
            <Mail className="mr-1 h-4 w-4" />
            Email link
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Save a card for faster checkout. Customers can also add their card through a secure Stripe
          link.
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
                className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
              >
                <div className="flex items-center gap-2">
                  <Link2 className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium capitalize">{pm.brand ?? "Card"}</span>
                  <span>•••• {pm.last4}</span>
                  {pm.expMonth && pm.expYear ? (
                    <Badge variant="secondary">
                      {pm.expMonth}/{String(pm.expYear).slice(-2)}
                    </Badge>
                  ) : null}
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
              onSaved={() => {
                closeForm();
                loadMethods();
              }}
              onCancel={closeForm}
            />
          </Elements>
        ) : null}
      </CardContent>
    </Card>
  );
}
