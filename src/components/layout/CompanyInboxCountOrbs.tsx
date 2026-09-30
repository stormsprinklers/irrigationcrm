import { InboxCountOrb } from "@/components/layout/InboxCountOrb";
import type { CompanyInboxBadgeCounts } from "@/lib/inbox/badge-types";
import { cn } from "@/lib/utils";

export function CompanyInboxCountOrbs({
  companies,
  className,
}: {
  companies: CompanyInboxBadgeCounts[];
  className?: string;
}) {
  const withNotifications = companies.filter((company) => company.counts.total > 0);
  if (withNotifications.length === 0) return null;

  return (
    <span
      className={cn("pointer-events-none inline-flex items-center gap-1", className)}
      aria-label={withNotifications
        .map(
          (company) =>
            `${company.companyName}: ${company.counts.total} inbox notification${company.counts.total === 1 ? "" : "s"}`
        )
        .join(", ")}
    >
      {withNotifications.map((company) => (
        <InboxCountOrb
          key={company.companyId}
          count={company.counts.total}
          color={company.brandPrimary}
          label={`${company.companyName}: ${company.counts.total} inbox notification${company.counts.total === 1 ? "" : "s"}`}
        />
      ))}
    </span>
  );
}
