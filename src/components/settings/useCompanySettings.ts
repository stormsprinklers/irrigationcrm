"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { CompanySettingsDTO } from "@/lib/company/types";

export function useCompanySettings() {
  const [company, setCompany] = useState<CompanySettingsDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings/company")
      .then((r) => r.json())
      .then(setCompany)
      .catch(() => toast.error("Failed to load settings"))
      .finally(() => setLoading(false));
  }, []);

  async function save(patch: Partial<CompanySettingsDTO>) {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/company", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      setCompany(updated);
      toast.success("Settings saved");
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  return { company, setCompany, loading, saving, save };
}
