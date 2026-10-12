"use client";
import { useCompanyBrand } from "./CompanyBrandProvider";
import { companyAIName } from "@/lib/company/industry";
export function CompanyAIText({text}: {text: string}) {
  const {brand} = useCompanyBrand();
  return <>{text.replace(/Storm AI/g, companyAIName(brand.companyName))}</>;
}
