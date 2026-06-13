import { ScheduleToolbar } from "@/components/schedule/ScheduleToolbar";
import { WeekGrid } from "@/components/schedule/WeekGrid";

export default function SchedulePage() {
  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col overflow-hidden">
      <ScheduleToolbar />
      <div className="flex-1 overflow-auto">
        <WeekGrid />
      </div>
    </div>
  );
}
