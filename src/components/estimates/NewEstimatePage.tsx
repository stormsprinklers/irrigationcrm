"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { CustomerSearchPicker } from "@/components/customers/CustomerSearchPicker";
import { Button } from "@/components/ui/button";

export function NewEstimatePage() {
  const router = useRouter();
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [saving, setSaving] = useState(false);

  async function createEstimate() {
    if (!customerId) {
      toast.error("Select a customer");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/estimates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Failed to create estimate");
        return;
      }
      router.push(`/estimates/${data.id}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <Button variant="ghost" size="sm" className="-ml-2 mb-2" asChild>
          <Link href="/customers/estimates">
            <ArrowLeft className="h-4 w-4" />
            Estimates
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold">New estimate</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose a customer, then fill out the full estimate.
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Customer</label>
        <CustomerSearchPicker
          value={customerId}
          selectedName={customerName}
          onValueChange={(id, name) => {
            setCustomerId(id);
            setCustomerName(name);
          }}
        />
      </div>

      <Button onClick={() => void createEstimate()} disabled={saving || !customerId}>
        {saving ? "Creating…" : "Create estimate"}
      </Button>
    </div>
  );
}
