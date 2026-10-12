"use client";
import { useCompanyBrand } from "./CompanyBrandProvider";
import { companyAIName } from "@/lib/company/industry";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  resolveBreadcrumbs,
  type BreadcrumbInput,
} from "@/lib/layout/breadcrumbs";

export type PageHeaderProps = {
  breadcrumb?: BreadcrumbInput[];
  title: React.ReactNode;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
};

export function PageHeader({
  breadcrumb,
  title,
  subtitle,
  actions,
  className,
}: PageHeaderProps) {
  const { brand } = useCompanyBrand();
  const branded = (value: string) => value.replace(/Storm AI/g, companyAIName(brand.companyName));
  const crumbs = breadcrumb?.length ? resolveBreadcrumbs(breadcrumb) : [];

  return (
    <div className={cn("mb-6", className)}>
      {crumbs.length > 0 ? (
        <nav aria-label="Breadcrumb" className="mb-1 text-sm text-muted-foreground">
          <ol className="flex flex-wrap items-center gap-1">
            {crumbs.map((crumb, index) => {
              const isLast = index === crumbs.length - 1;
              return (
                <li key={`${branded(crumb.label)}-${index}`} className="flex items-center gap-1">
                  {index > 0 ? <span aria-hidden="true">&gt;</span> : null}
                  {crumb.href ? (
                    <Link
                      href={crumb.href}
                      className={cn(
                        "hover:text-foreground hover:underline",
                        isLast && "text-foreground/80"
                      )}
                    >
                      {branded(crumb.label)}
                    </Link>
                  ) : (
                    <span className={cn(isLast && "text-foreground/80")}>{branded(crumb.label)}</span>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-bold tracking-tight text-storm-navy sm:text-2xl">
            {typeof title === "string" ? branded(title) : title}
          </h1>
          {subtitle ? (
            <p className="mt-1 text-sm text-muted-foreground">{branded(subtitle)}</p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}
