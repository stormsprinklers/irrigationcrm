import { Badge } from "@/components/ui/badge";

type Props = {
  zoneCount?: number | null;
  shutoffValveLocation?: string | null;
  controllerLocation?: string | null;
  irrigationMapStatus?: string | null;
};

export function PropertyIrrigationSummary({
  zoneCount,
  shutoffValveLocation,
  controllerLocation,
  irrigationMapStatus,
}: Props) {
  const hasInfo =
    zoneCount != null || shutoffValveLocation?.trim() || controllerLocation?.trim();

  if (!hasInfo) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
      {zoneCount != null && zoneCount > 0 ? (
        <Badge variant="secondary">{zoneCount} zone{zoneCount === 1 ? "" : "s"}</Badge>
      ) : null}
      {shutoffValveLocation?.trim() ? (
        <span className="text-muted-foreground">
          <span className="font-medium text-foreground">Shutoff:</span>{" "}
          {shutoffValveLocation.trim()}
        </span>
      ) : null}
      {controllerLocation?.trim() ? (
        <span className="text-muted-foreground">
          <span className="font-medium text-foreground">Controller:</span>{" "}
          {controllerLocation.trim()}
        </span>
      ) : null}
      {irrigationMapStatus === "PUBLISHED" ? (
        <Badge variant="outline" className="ml-auto text-[10px]">
          Map published
        </Badge>
      ) : null}
    </div>
  );
}
