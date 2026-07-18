import { AlertTriangle } from "lucide-react";
import { formatCurrency } from "@/lib/maintenance-plans/format";
import { cn } from "@/lib/utils";

type Props = {
  /** Short headline shown in bold. */
  title?: string;
  /** Supporting detail under the title. */
  description?: string;
  /** Optional amount overdue to highlight. */
  amount?: number | null;
  className?: string;
};

export function LatePaymentAlert({
  title = "Late on payment",
  description,
  amount,
  className,
}: Props) {
  return (
    <div
      role="alert"
      className={cn(
        "rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-100",
        className
      )}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-300" />
        <div className="min-w-0 space-y-0.5">
          <p className="font-semibold">
            {title}
            {amount != null && amount > 0 ? (
              <span className="font-normal"> — {formatCurrency(amount)} overdue</span>
            ) : null}
          </p>
          {description ? <p className="text-red-800/90 dark:text-red-200/90">{description}</p> : null}
        </div>
      </div>
    </div>
  );
}
