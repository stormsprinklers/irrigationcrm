"use client";

import { useEffect, useState } from "react";
import { Loader2, MapPin, Phone, Wrench, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { requestCurrentPosition } from "@/lib/maps/geolocation";
import { todayHoursLabel } from "@/lib/parts-suppliers/hours";
import type { PartsRunOption } from "@/lib/parts-suppliers/types";

type Props = {
  visitId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPaused: () => void;
};

export function PartsRunDialog({ visitId, open, onOpenChange, onPaused }: Props) {
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<PartsRunOption[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [usedLiveLocation, setUsedLiveLocation] = useState(false);

  useEffect(() => {
    if (!open) return;

    async function loadOptions() {
      setLoading(true);
      setMessage(null);
      setUsedLiveLocation(false);
      try {
        const position = await requestCurrentPosition();
        const params = new URLSearchParams();
        if (position.ok) {
          params.set("originLat", String(position.lat));
          params.set("originLng", String(position.lng));
          setUsedLiveLocation(true);
        } else if (position.reason === "denied") {
          toast.message("Location access denied — ranking suppliers from the job site instead.");
        }

        const query = params.toString();
        const res = await fetch(
          `/api/visits/${visitId}/parts-run${query ? `?${query}` : ""}`
        );
        const data = await res.json();
        if (!res.ok) {
          toast.error(data.error ?? "Could not load parts suppliers");
          return;
        }
        setOptions(data.options ?? []);
        setMessage(data.message ?? null);
      } finally {
        setLoading(false);
      }
    }

    void loadOptions();
  }, [open, visitId]);

  async function startPartsRun(supplierId: string) {
    setStartingId(supplierId);
    try {
      const res = await fetch(`/api/visits/${visitId}/parts-run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supplierId }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Could not start parts run");
        return;
      }

      if (data.paused) {
        toast.success("Job timer paused");
        onPaused();
      }

      window.open(data.mapsUrl, "_blank", "noopener,noreferrer");
      onOpenChange(false);
    } finally {
      setStartingId(null);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close"
        onClick={() => onOpenChange(false)}
      />
      <div className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border bg-background shadow-lg">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">Parts Run</h2>
          </div>
          <button
            type="button"
            className="rounded-md p-1 hover:bg-muted"
            onClick={() => onOpenChange(false)}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 p-4">
          <p className="text-sm text-muted-foreground">
            {usedLiveLocation
              ? "Pick the closest open supplier to your current location. If the visit is in progress, your job timer will pause and Google Maps will open for directions."
              : "Pick the closest open supplier to this job site. If the visit is in progress, your job timer will pause and Google Maps will open for directions."}
          </p>

          {loading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {usedLiveLocation
                ? "Finding open suppliers near you..."
                : "Requesting location and finding open suppliers..."}
            </div>
          ) : options.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">
              {message ?? "No open suppliers available right now."}
            </p>
          ) : (
            options.map((option, index) => (
              <div key={option.supplierId} className="rounded-lg border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      Option {index + 1}: {option.name}
                    </p>
                    <p className="text-sm text-muted-foreground">{option.address}</p>
                    {option.driveMinutes != null ? (
                      <p className="text-sm text-muted-foreground">
                        ~{option.driveMinutes} min drive
                        {option.driveDistanceMiles != null
                          ? ` · ${option.driveDistanceMiles} mi`
                          : ""}
                      </p>
                    ) : null}
                    {option.weekdayHours.length > 0 ? (
                      <p className="text-xs text-muted-foreground">
                        {todayHoursLabel(option.weekdayHours) ?? option.weekdayHours[0]}
                      </p>
                    ) : null}
                  </div>
                  <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                    Open
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {option.phone ? (
                    <Button type="button" variant="outline" size="sm" asChild>
                      <a href={`tel:${option.phone.replace(/\D/g, "")}`}>
                        <Phone className="h-4 w-4" />
                        Call
                      </a>
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void startPartsRun(option.supplierId)}
                    disabled={startingId === option.supplierId}
                  >
                    <MapPin className="h-4 w-4" />
                    {startingId === option.supplierId ? "Starting..." : "Navigate"}
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
