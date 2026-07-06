import { cn } from "@/lib/utils";

export function ContentArea({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("px-4 py-4 sm:px-6", className)}>{children}</div>;
}
