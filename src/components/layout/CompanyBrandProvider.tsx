"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { stormBrand } from "@/lib/branding";
import { blobProxyUrl } from "@/lib/blob/urls";

export type CompanyBrand = {
  companyId: string;
  companyName: string;
  logoUrl: string;
  primaryColor: string;
  secondaryColor: string;
};

type CompanyBrandContextValue = {
  brand: CompanyBrand;
  loading: boolean;
  refresh: () => Promise<void>;
};

const DEFAULT_PRIMARY = stormBrand.sky;
const DEFAULT_SECONDARY = stormBrand.navy;

const CompanyBrandContext = createContext<CompanyBrandContextValue | null>(null);

function normalizeHex(value: string | null | undefined, fallback: string) {
  const raw = (value ?? "").trim();
  if (!raw) return fallback;
  const withHash = raw.startsWith("#") ? raw : `#${raw}`;
  if (!/^#[0-9a-fA-F]{6}$/.test(withHash)) return fallback;
  return withHash.toUpperCase();
}

function applyBrandCss(primary: string, secondary: string) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.style.setProperty("--primary", primary);
  root.style.setProperty("--ring", primary);
  root.style.setProperty("--foreground", secondary);
  root.style.setProperty("--card-foreground", secondary);
  root.style.setProperty("--popover-foreground", secondary);
  root.style.setProperty("--secondary-foreground", secondary);
  root.style.setProperty("--accent-foreground", secondary);
}

export function CompanyBrandProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const companyId = session?.user?.companyId ?? "";
  const [brand, setBrand] = useState<CompanyBrand>({
    companyId: "",
    companyName: "Company",
    logoUrl: stormBrand.logoPath,
    primaryColor: DEFAULT_PRIMARY,
    secondaryColor: DEFAULT_SECONDARY,
  });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!companyId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/settings/company/branding");
      if (!res.ok) return;
      const data = await res.json();
      const primary = normalizeHex(data.brandPrimaryColor, DEFAULT_PRIMARY);
      const secondary = normalizeHex(data.brandSecondaryColor, DEFAULT_SECONDARY);
      const logoUrl =
        blobProxyUrl(data.brandLogoUrl) ||
        blobProxyUrl(data.emailLogoUrl) ||
        stormBrand.logoPath;
      setBrand({
        companyId,
        companyName: data.name || "Company",
        logoUrl,
        primaryColor: primary,
        secondaryColor: secondary,
      });
      applyBrandCss(primary, secondary);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({ brand, loading, refresh }),
    [brand, loading, refresh]
  );

  return (
    <CompanyBrandContext.Provider value={value}>{children}</CompanyBrandContext.Provider>
  );
}

export function useCompanyBrand() {
  const ctx = useContext(CompanyBrandContext);
  if (!ctx) {
    return {
      brand: {
        companyId: "",
        companyName: "Company",
        logoUrl: stormBrand.logoPath,
        primaryColor: DEFAULT_PRIMARY,
        secondaryColor: DEFAULT_SECONDARY,
      } satisfies CompanyBrand,
      loading: false,
      refresh: async () => {},
    };
  }
  return ctx;
}
