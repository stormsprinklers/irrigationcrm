import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Props = {
  name: string;
  doNotService?: boolean;
  className?: string;
  nameClassName?: string;
};

export function CustomerNameWithBadge({
  name,
  doNotService,
  className,
  nameClassName,
}: Props) {
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-2", className)}>
      <span className={nameClassName}>{name}</span>
      {doNotService ? (
        <Badge
          variant="destructive"
          className="text-[10px] font-semibold uppercase tracking-wide"
        >
          Do not service
        </Badge>
      ) : null}
    </span>
  );
}
