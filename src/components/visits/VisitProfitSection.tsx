"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

type VisitProfitData = {
  revenue: number;
  lineItemCost: number;
  actualLaborCost: number;
  estimatedCommission: number;
  grossProfit: number;
  netProfit: number;
  marginPercent: number;
  breakdown: { label: string; amount: number }[];
  notes: string[];
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

type Props = {
  visitId: string;
};

export function VisitProfitSection({ visitId }: Props) {
  const [profit, setProfit] = useState<VisitProfitData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/visits/${visitId}/profit`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          toast.error(data.error);
          return;
        }
        setProfit(data);
      })
      .catch(() => toast.error("Failed to load profit analysis"))
      .finally(() => setLoading(false));
  }, [visitId]);

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-white p-4">
        <h3 className="text-sm font-semibold">Job profit</h3>
        <p className="mt-2 text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!profit) return null;

  return (
    <div className="rounded-lg border border-border bg-white p-4">
      <h3 className="text-sm font-semibold">Job profit</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Revenue minus line-item costs, job labor, and estimated commission.
      </p>

      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Revenue</dt>
          <dd className="font-medium">{formatCurrency(profit.revenue)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Line item costs</dt>
          <dd>−{formatCurrency(profit.lineItemCost)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Gross profit</dt>
          <dd className="font-medium">{formatCurrency(profit.grossProfit)}</dd>
        </div>
        {profit.actualLaborCost > 0 ? (
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Actual job labor</dt>
            <dd>−{formatCurrency(profit.actualLaborCost)}</dd>
          </div>
        ) : null}
        {profit.estimatedCommission > 0 ? (
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Est. commission</dt>
            <dd>−{formatCurrency(profit.estimatedCommission)}</dd>
          </div>
        ) : null}
        <div className="flex justify-between border-t border-border pt-2">
          <dt className="font-semibold">Net profit</dt>
          <dd
            className={`font-semibold ${profit.netProfit >= 0 ? "text-green-700" : "text-red-600"}`}
          >
            {formatCurrency(profit.netProfit)}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Margin</dt>
          <dd>{profit.marginPercent.toFixed(1)}%</dd>
        </div>
      </dl>

      {profit.notes.length > 0 ? (
        <ul className="mt-3 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
          {profit.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
