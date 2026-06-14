"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";

type LaborRate = {
  id: string;
  name: string;
  hourlyCost: number;
  hourlyPrice: number;
  isDefault: boolean;
};

export default function LaborRatesSettingsPage() {
  const [rates, setRates] = useState<LaborRate[]>([]);
  const [name, setName] = useState("");
  const [hourlyCost, setHourlyCost] = useState("65");
  const [hourlyPrice, setHourlyPrice] = useState("120");
  const [isDefault, setIsDefault] = useState(false);

  function load() {
    fetch("/api/settings/price-book/labor-rates")
      .then((r) => r.json())
      .then(setRates)
      .catch(() => toast.error("Failed to load labor rates"));
  }

  useEffect(() => {
    load();
  }, []);

  async function createRate(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/settings/price-book/labor-rates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        hourlyCost: Number(hourlyCost),
        hourlyPrice: Number(hourlyPrice),
        isDefault,
      }),
    });
    if (!res.ok) {
      toast.error("Failed to create labor rate");
      return;
    }
    setName("");
    load();
    toast.success("Labor rate created");
  }

  async function setDefault(id: string) {
    const res = await fetch(`/api/settings/price-book/labor-rates/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isDefault: true }),
    });
    if (!res.ok) {
      toast.error("Failed to set default");
      return;
    }
    load();
  }

  return (
    <ContentArea className="max-w-3xl">
      <PageHeader breadcrumb={["Settings", "Price Book", "Labor rates"]} title="Labor rates" />

      <form onSubmit={createRate} className="mb-8 space-y-4 rounded-lg border border-border bg-white p-6">
        <h3 className="font-semibold">Add labor rate</h3>
        <Input placeholder="Journeyman" value={name} onChange={(e) => setName(e.target.value)} required />
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Hourly cost</label>
            <Input type="number" step="0.01" value={hourlyCost} onChange={(e) => setHourlyCost(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Hourly price</label>
            <Input type="number" step="0.01" value={hourlyPrice} onChange={(e) => setHourlyPrice(e.target.value)} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={isDefault} onCheckedChange={(c) => setIsDefault(Boolean(c))} />
          Set as default flat rate
        </label>
        <Button type="submit">Add rate</Button>
      </form>

      <ul className="divide-y divide-border rounded-lg border border-border bg-white">
        {rates.map((rate) => (
          <li key={rate.id} className="flex items-center justify-between p-4 text-sm">
            <div>
              <p className="font-medium">
                {rate.name}
                {rate.isDefault ? " · Default" : ""}
              </p>
              <p className="text-muted-foreground">
                Cost ${rate.hourlyCost.toFixed(2)}/hr · Price ${rate.hourlyPrice.toFixed(2)}/hr
              </p>
            </div>
            {!rate.isDefault && (
              <Button size="sm" variant="outline" onClick={() => void setDefault(rate.id)}>
                Set default
              </Button>
            )}
          </li>
        ))}
        {!rates.length && (
          <li className="p-4 text-muted-foreground">No labor rates yet.</li>
        )}
      </ul>
    </ContentArea>
  );
}
