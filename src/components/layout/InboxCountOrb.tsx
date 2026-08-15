import { cn } from "@/lib/utils";
import { formatInboxBadgeCount } from "@/contexts/InboxBadgesProvider";

export function InboxCountOrb({
  count,
  className,
  tone = "alert",
}: {
  count: number;
  className?: string;
  /** alert = sidebar/attention red; unread = SMS thread blue */
  tone?: "alert" | "unread";
}) {
  const label = formatInboxBadgeCount(count);
  if (!label) return null;

  return (
    <span
      className={cn(
        "pointer-events-none inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[11px] font-semibold leading-none text-white shadow-[0_1px_2px_rgba(0,0,0,0.28)]",
        tone === "unread" ? "bg-primary" : "bg-[#FF3B30]",
        className
      )}
      aria-label={`${count} unread`}
    >
      {label}
    </span>
  );
}
