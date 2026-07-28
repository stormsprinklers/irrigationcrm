"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { stormBrand } from "@/lib/branding";
import {
  type BrandPalette,
  DEFAULT_BRAND_PALETTE,
  contrastForeground,
  resolveBrandPalette,
} from "@/lib/brand-palette";
import { blobProxyUrl } from "@/lib/blob/urls";

export type CompanyBrand = {
  companyId: string;
  companyName: string;
  logoUrl: string;
  primaryColor: string;
  secondaryColor: string;
  palette: BrandPalette;
};

type CompanyBrandContextValue = {
  brand: CompanyBrand;
  loading: boolean;
  refresh: () => Promise<void>;
};

const CompanyBrandContext = createContext<CompanyBrandContextValue | null>(null);

function applyBrandCss(palette: BrandPalette) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const { primary, secondary, soft, panel, accent } = palette;

  root.style.setProperty("--primary", primary);
  root.style.setProperty("--primary-foreground", contrastForeground(primary));
  root.style.setProperty("--ring", primary);

  root.style.setProperty("--secondary", soft);
  root.style.setProperty("--secondary-foreground", secondary);
  root.style.setProperty("--accent", soft);
  root.style.setProperty("--accent-foreground", secondary);
  root.style.setProperty("--highlight", soft);
  root.style.setProperty("--highlight-panel", panel);

  root.style.setProperty("--foreground", secondary);
  root.style.setProperty("--card-foreground", secondary);
  root.style.setProperty("--popover-foreground", secondary);

  if (accent) {
    root.style.setProperty("--brand-accent", accent);
  } else {
    root.style.removeProperty("--brand-accent");
  }
}

const fallbackBrand: CompanyBrand = {
  companyId: "",
  companyName: "Company",
  logoUrl: stormBrand.logoPath,
  primaryColor: DEFAULT_BRAND_PALETTE.primary,
  secondaryColor: DEFAULT_BRAND_PALETTE.secondary,
  palette: DEFAULT_BRAND_PALETTE,
};

export function CompanyBrandProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const companyId = session?.user?.companyId ?? "";
  const [brand, setBrand] = useState<CompanyBrand>(fallbackBrand);
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
      const palette = resolveBrandPalette(data);
      const logoUrl =
        blobProxyUrl(data.brandLogoUrl) ||
        blobProxyUrl(data.emailLogoUrl) ||
        stormBrand.logoPath;
      setBrand({
        companyId,
        companyName: data.name || "Company",
        logoUrl,
        primaryColor: palette.primary,
        secondaryColor: palette.secondary,
        palette,
      });
      applyBrandCss(palette);
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
      brand: fallbackBrand,
      loading: false,
      refresh: async () => {},
    };
  }
  return ctx;
}
