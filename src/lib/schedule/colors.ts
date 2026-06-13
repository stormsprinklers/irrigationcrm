import type { ColorByMode, ScheduleJobDTO } from "@/lib/visits/types";

const DIVISION_COLORS: Record<string, string> = {
  INSTALL: "#059669",
  SERVICE: "#2563EB",
};

export function getJobColor(job: ScheduleJobDTO, colorBy: ColorByMode): string {
  switch (colorBy) {
    case "technician":
      return job.assignedUser?.color ?? "#64748B";
    case "crew":
      return job.crew?.color ?? job.assignedUser?.color ?? "#64748B";
    case "division":
      return DIVISION_COLORS[job.division] ?? "#64748B";
    case "area":
    default:
      return job.serviceArea.color;
  }
}

export function hexToRgba(hex: string, alpha: number) {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) return `rgba(100, 116, 139, ${alpha})`;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function jobCardStyle(job: ScheduleJobDTO, colorBy: ColorByMode) {
  const color = getJobColor(job, colorBy);
  return {
    backgroundColor: hexToRgba(color, 0.15),
    borderColor: color,
  };
}
