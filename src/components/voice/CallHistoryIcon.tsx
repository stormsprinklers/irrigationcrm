import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  Phone,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  direction: "INBOUND" | "OUTBOUND";
  answered: boolean;
  className?: string;
};

export function CallHistoryIcon({ direction, answered, className }: Props) {
  const DirectionIcon = direction === "INBOUND" ? ArrowDownLeft : ArrowUpRight;

  return (
    <div
      className={cn(
        "relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border",
        answered ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50",
        className
      )}
      aria-hidden
    >
      <Phone
        className={cn("h-4 w-4", answered ? "text-green-700" : "text-red-600")}
        strokeWidth={2.25}
      />
      <DirectionIcon
        className={cn(
          "absolute bottom-0 left-0 h-3.5 w-3.5 rounded-full bg-white p-0.5",
          direction === "INBOUND" ? "text-storm-sky" : "text-storm-navy"
        )}
        strokeWidth={2.5}
      />
      {answered ? (
        <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-green-600">
          <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />
        </span>
      ) : (
        <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-600">
          <X className="h-2.5 w-2.5 text-white" strokeWidth={3} />
        </span>
      )}
    </div>
  );
}
