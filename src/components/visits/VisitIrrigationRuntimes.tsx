"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  customerId: string;
  propertyId: string;
};

export function VisitIrrigationRuntimes({ customerId, propertyId }: Props) {
  const [zones, setZones] = useState<
    Array<{ name: string; runMinutes: number | null; wateringGuide: string | null }>
  >([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetch(`/api/customers/${customerId}/properties/${propertyId}/irrigation`)
      .then((r) => r.json())
      .then((data) => setZones(data.zones ?? []))
      .catch(() => {});
  }, [open, customerId, propertyId]);

  if (!propertyId) return null;

  return (
    <Card>
      <CardHeader className="cursor-pointer" onClick={() => setOpen((v) => !v)}>
        <CardTitle className="text-base">Irrigation runtimes</CardTitle>
      </CardHeader>
      {open && (
        <CardContent>
          {zones.length === 0 ? (
            <p className="text-sm text-muted-foreground">No published irrigation guide.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {zones.map((z) => (
                <li key={z.name} className="flex justify-between gap-4">
                  <span>{z.name}</span>
                  <span className="text-muted-foreground">
                    {z.runMinutes != null ? `${z.runMinutes} min` : "—"}
                    {z.wateringGuide ? ` · ${z.wateringGuide}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      )}
    </Card>
  );
}
