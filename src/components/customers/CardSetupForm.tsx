"use client";

import { useState } from "react";
import { PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type Props = {
  onSaved: (paymentMethodId: string) => void | Promise<void>;
  onCancel: () => void;
  submitLabel?: string;
};

export function CardSetupForm({ onSaved, onCancel, submitLabel = "Save card" }: Props) {
  const stripe = useStripe();
  const elements = useElements();
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;

    setSaving(true);
    try {
      const result = await stripe.confirmSetup({
        elements,
        redirect: "if_required",
      });
      if (result.error) {
        toast.error(result.error.message ?? "Card setup failed");
        return;
      }
      const paymentMethod = result.setupIntent?.payment_method;
      const paymentMethodId =
        typeof paymentMethod === "string" ? paymentMethod : paymentMethod?.id;
      if (!paymentMethodId) throw new Error("Card was saved, but could not be activated");
      await onSaved(paymentMethodId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Card setup failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-md border bg-muted/20 p-4">
      <PaymentElement options={{ wallets: { link: "never" } }} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={!stripe || saving}>
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            submitLabel
          )}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
