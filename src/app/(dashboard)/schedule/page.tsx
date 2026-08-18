import { Suspense } from "react";
import { ScheduleView } from "@/components/schedule/ScheduleView";

export default function SchedulePage() {
  return (
    <div className="h-full w-full">
      <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Loading schedule...</div>}>
        <ScheduleView />
      </Suspense>
    </div>
  );
}
