"use client";

import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useCompanySettings } from "@/components/settings/useCompanySettings";

export default function SettingsBookingPage() {
  const { company, setCompany, loading, saving, save } = useCompanySettings();

  if (loading || !company) {
    return (
      <ContentArea className="max-w-2xl">
        <PageHeader breadcrumb={["Settings", "Booking"]} title="Booking" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </ContentArea>
    );
  }

  const publicUrl = company.bookingSlug
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/book/${company.bookingSlug}`
    : "Set a slug to generate URL";

  return (
    <ContentArea className="max-w-2xl">
      <PageHeader
        breadcrumb={["Settings", "Booking"]}
        title="Online booking"
        actions={<Button size="sm" onClick={() => save(company)} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>}
      />
      <div className="space-y-4 rounded-lg border border-border bg-white p-6">
        <label className="flex items-center gap-3 text-sm">
          <Checkbox
            checked={company.onlineBookingEnabled}
            onCheckedChange={(checked) => setCompany({ ...company, onlineBookingEnabled: Boolean(checked) })}
          />
          Enable online booking
        </label>
        <div>
          <label className="text-sm text-muted-foreground">Booking page slug</label>
          <Input
            className="mt-1"
            value={company.bookingSlug ?? ""}
            onChange={(e) => setCompany({ ...company, bookingSlug: e.target.value })}
            placeholder="storm-sprinklers"
          />
        </div>
        <div>
          <label className="text-sm text-muted-foreground">Lead time (hours)</label>
          <Input
            type="number"
            className="mt-1 max-w-[120px]"
            value={company.bookingLeadTimeHours}
            onChange={(e) => setCompany({ ...company, bookingLeadTimeHours: Number(e.target.value) })}
          />
        </div>
        <p className="text-sm text-muted-foreground">Public URL: {publicUrl}</p>
      </div>
    </ContentArea>
  );
}
