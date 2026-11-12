"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";
import { useCompanyBrand } from "@/components/layout/CompanyBrandProvider";
import { Button } from "@/components/ui/button";
import { stormBrand } from "@/lib/branding";

export function BulbPrepNav({ name }: { name: string }) {
  const { brand } = useCompanyBrand();
  return (
    <header className="shrink-0 border-b bg-card">
      <div className="mx-auto flex h-16 max-w-5xl items-center gap-3 px-4 sm:px-6">
        <Link href="/home" className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- company logos may be blob proxy URLs */}
          <img
            src={brand.logoUrl || stormBrand.logoPath}
            alt={brand.companyName || "Company"}
            className="h-10 w-auto max-w-40 object-contain"
          />
          <span className="hidden text-sm font-semibold sm:inline">Bulb Prep</span>
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden text-sm text-muted-foreground sm:inline">{name}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void signOut({ callbackUrl: "/login" })}
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
