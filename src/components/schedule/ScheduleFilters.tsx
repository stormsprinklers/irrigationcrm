"use client";

import { Button } from "@/components/ui/button";
import type { ScheduleFilters as Filters } from "@/lib/schedule/types";

type FilterOptions = {
  serviceAreas: { id: string; name: string; color: string }[];
  employees: { id: string; name: string }[];
  crews: { id: string; name: string; color: string }[];
};

type Props = {
  open: boolean;
  onClose: () => void;
  filters: Filters;
  options: FilterOptions;
  onChange: (filters: Filters) => void;
};

function toggleItem(list: string[], id: string) {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

export function ScheduleFiltersPanel({ open, onClose, filters, options, onChange }: Props) {
  if (!open) return null;

  return (
    <div className="absolute right-4 top-full z-30 mt-1 w-80 rounded-lg border border-border bg-white p-4 shadow-lg">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold">Filters</h3>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>

      <div className="space-y-4 text-sm">
        <div>
          <p className="mb-2 font-medium">Service areas</p>
          <div className="flex flex-wrap gap-1">
            {options.serviceAreas.map((area) => (
              <button
                key={area.id}
                type="button"
                onClick={() =>
                  onChange({
                    ...filters,
                    serviceAreaIds: toggleItem(filters.serviceAreaIds, area.id),
                  })
                }
                className={`rounded-full border px-2 py-0.5 text-xs ${
                  filters.serviceAreaIds.includes(area.id)
                    ? "border-primary bg-primary/10"
                    : "border-border"
                }`}
              >
                {area.name}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 font-medium">Employees</p>
          <div className="flex flex-wrap gap-1">
            {options.employees.map((emp) => (
              <button
                key={emp.id}
                type="button"
                onClick={() =>
                  onChange({
                    ...filters,
                    userIds: toggleItem(filters.userIds, emp.id),
                  })
                }
                className={`rounded-full border px-2 py-0.5 text-xs ${
                  filters.userIds.includes(emp.id) ? "border-primary bg-primary/10" : "border-border"
                }`}
              >
                {emp.name}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 font-medium">Crews</p>
          <div className="flex flex-wrap gap-1">
            {options.crews.map((crew) => (
              <button
                key={crew.id}
                type="button"
                onClick={() =>
                  onChange({
                    ...filters,
                    crewIds: toggleItem(filters.crewIds, crew.id),
                  })
                }
                className={`rounded-full border px-2 py-0.5 text-xs ${
                  filters.crewIds.includes(crew.id) ? "border-primary bg-primary/10" : "border-border"
                }`}
              >
                {crew.name}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 font-medium">Division</p>
          <div className="flex gap-2">
            {(["INSTALL", "SERVICE"] as const).map((division) => (
              <button
                key={division}
                type="button"
                onClick={() =>
                  onChange({
                    ...filters,
                    divisions: toggleItem(filters.divisions, division) as ("INSTALL" | "SERVICE")[],
                  })
                }
                className={`rounded-full border px-3 py-1 text-xs ${
                  filters.divisions.includes(division)
                    ? "border-primary bg-primary/10"
                    : "border-border"
                }`}
              >
                {division === "INSTALL" ? "Install" : "Service"}
              </button>
            ))}
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() =>
            onChange({ serviceAreaIds: [], userIds: [], crewIds: [], divisions: [] })
          }
        >
          Clear filters
        </Button>
      </div>
    </div>
  );
}
