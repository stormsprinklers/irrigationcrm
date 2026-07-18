"use client";

import type { ControllerProgram, ControllerProgramGuide } from "@/lib/irrigation/runtime-engine";

const PROGRAM_ROW_TINT: Record<string, string> = {
  A: "bg-white",
  B: "bg-emerald-50/90",
  C: "bg-amber-50/90",
};

type Props = {
  guide: ControllerProgramGuide;
  className?: string;
  /** Compact footer note; omit when live data. */
  footerNote?: string | null;
};

function formatRuntime(zone: ControllerProgram["zones"][number]) {
  if (zone.cycleSoak.enabled && zone.cycleSoak.cycleCount > 1) {
    return `${zone.cycleSoak.minutesPerCycle} min × ${zone.cycleSoak.cycleCount}`;
  }
  return `${zone.runtimePerEventMinutes} min`;
}

function formatGallons(value: number) {
  const rounded = Math.round(value);
  return `${rounded.toLocaleString()} gal`;
}

export function SprinklerProgrammingSetupTable({ guide, className, footerNote }: Props) {
  const programs = guide.programs.filter((p) => p.zones.length > 0);
  const maxStartTimes = programs.reduce(
    (max, program) => Math.max(max, program.startTimes.length),
    0
  );

  if (!programs.length) {
    return (
      <p className="text-sm text-muted-foreground">
        Add zones with vegetation and irrigation types to generate a programming guide.
      </p>
    );
  }

  const startTimeHeaders = Array.from({ length: maxStartTimes }, (_, i) => `Start Time ${i + 1}`);

  return (
    <div className={className}>
      <div className="mb-3">
        <h3 className="text-base font-semibold tracking-tight text-slate-900">
          Sprinkler Programming Setup
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Each runtime occurs on every watering day for each start time listed in that program.
        </p>
      </div>

      <div className="overflow-x-auto rounded-md border border-slate-200 shadow-sm">
        <table className="w-full min-w-[44rem] border-collapse text-sm">
          <thead>
            <tr className="bg-slate-800 text-white">
              <th className="px-3 py-2.5 text-center font-semibold">Program</th>
              <th className="px-3 py-2.5 text-center font-semibold">Watering Days</th>
              {startTimeHeaders.map((label) => (
                <th key={label} className="px-3 py-2.5 text-center font-semibold whitespace-nowrap">
                  {label}
                </th>
              ))}
              <th className="px-3 py-2.5 text-center font-semibold whitespace-nowrap">Zone #</th>
              <th className="px-3 py-2.5 text-left font-semibold">Zone Description</th>
              <th className="px-3 py-2.5 text-center font-semibold">Runtime</th>
              <th className="px-3 py-2.5 text-center font-semibold whitespace-nowrap">
                Est. Water Use
              </th>
            </tr>
          </thead>
          <tbody>
            {programs.map((program) => {
              const tint = PROGRAM_ROW_TINT[program.id] ?? "bg-white";
              const rowCount = program.zones.length;
              return program.zones.map((zone, zoneIndex) => (
                <tr key={`${program.id}-${zone.zoneId}`} className={`${tint} border-t border-slate-200`}>
                  {zoneIndex === 0 ? (
                    <>
                      <td
                        rowSpan={rowCount}
                        className="border-r border-slate-200 px-3 py-3 text-center align-middle"
                      >
                        <span className="text-2xl font-bold tracking-tight text-slate-900">
                          {program.id}
                        </span>
                      </td>
                      <td
                        rowSpan={rowCount}
                        className="border-r border-slate-200 px-3 py-3 text-center align-middle font-medium text-slate-800"
                      >
                        {program.daysLabel}
                      </td>
                      {Array.from({ length: maxStartTimes }, (_, i) => (
                        <td
                          key={`${program.id}-start-${i}`}
                          rowSpan={rowCount}
                          className="border-r border-slate-200 px-3 py-3 text-center align-middle tabular-nums text-slate-800"
                        >
                          {program.startTimes[i] ?? "—"}
                        </td>
                      ))}
                    </>
                  ) : null}
                  <td className="border-r border-slate-200 px-3 py-2.5 text-center tabular-nums text-slate-800">
                    {zone.stationNumber}
                  </td>
                  <td className="border-r border-slate-200 px-3 py-2.5 text-slate-800">
                    <div>{zone.name}</div>
                    {zone.establishmentNote ? (
                      <div className="mt-0.5 text-xs text-amber-700">{zone.establishmentNote}</div>
                    ) : null}
                  </td>
                  <td className="border-r border-slate-200 px-3 py-2.5 text-center tabular-nums text-slate-800">
                    {formatRuntime(zone)}
                  </td>
                  <td className="px-3 py-2.5 text-center tabular-nums text-slate-800">
                    {formatGallons(zone.gallonsPerEvent)}
                  </td>
                </tr>
              ));
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <p>
          ~{Math.round(guide.totalGallonsPerWeek).toLocaleString()} gal/week total · ET₀{" "}
          {guide.weeklyEToInches}&quot;/wk
          {guide.droughtMode ? " · Drought schedule" : ""}
        </p>
        {footerNote ? <p className="italic">{footerNote}</p> : null}
      </div>

      {guide.notes.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {guide.notes.map((note) => (
            <li key={note} className="text-xs text-amber-800">
              {note}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
