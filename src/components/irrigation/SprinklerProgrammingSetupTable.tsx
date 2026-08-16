"use client";

import type { ControllerProgram, ControllerProgramGuide } from "@/lib/irrigation/runtime-engine";
import { cn } from "@/lib/utils";

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

function formatGallons(value: number) {
  const rounded = Math.round(value);
  return `${rounded.toLocaleString()} gal`;
}

function zoneStartRuntimes(
  zone: ControllerProgram["zones"][number],
  startTimes: string[]
): Array<{ time: string; minutes: number }> {
  const cycleCount = zone.cycleSoak.enabled ? Math.max(zone.cycleSoak.cycleCount, 1) : 1;
  const perStart = zone.cycleSoak.enabled
    ? zone.cycleSoak.minutesPerCycle
    : zone.runtimePerEventMinutes;
  const times = startTimes.length ? startTimes : ["Start"];
  return times.map((time, index) => ({
    time,
    minutes: index < cycleCount ? Math.round(perStart) : 0,
  }));
}

function ZoneRuntimeBreakdown({
  zone,
  startTimes,
  compact = false,
}: {
  zone: ControllerProgram["zones"][number];
  startTimes: string[];
  compact?: boolean;
}) {
  const starts = zoneStartRuntimes(zone, startTimes);
  const total = Math.round(zone.runtimePerEventMinutes);
  return (
    <div className={compact ? "text-right" : "text-center"}>
      <ul className="space-y-0.5 text-xs tabular-nums text-slate-700">
        {starts.map((start) => (
          <li key={start.time} className={start.minutes > 0 ? "" : "text-muted-foreground"}>
            {start.time}: {start.minutes} min
          </li>
        ))}
      </ul>
      <div className="mt-1 text-sm font-semibold tabular-nums text-slate-900">
        Total {total} min
      </div>
    </div>
  );
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
    <div className={cn("min-w-0 max-w-full", className)}>
      <div className="mb-3">
        <h3 className="text-base font-semibold tracking-tight text-slate-900">
          Sprinkler Programming Setup
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Program each zone for the minutes shown at every start time. Total is all starts
          combined on a watering day.
        </p>
      </div>

      {/* Mobile: stacked cards — never forces horizontal page scroll */}
      <div className="space-y-3 md:hidden">
        {programs.map((program) => {
          const tint = PROGRAM_ROW_TINT[program.id] ?? "bg-white";
          return (
            <div
              key={program.id}
              className={cn("overflow-hidden rounded-md border border-slate-200 shadow-sm", tint)}
            >
              <div className="border-b border-slate-200 bg-slate-800 px-3 py-2 text-white">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="text-xl font-bold tracking-tight">Program {program.id}</span>
                  <span className="text-sm text-slate-200">{program.daysLabel}</span>
                </div>
                {program.startTimes.length > 0 ? (
                  <p className="mt-1 text-xs text-slate-300">
                    Starts: {program.startTimes.join(" · ")}
                  </p>
                ) : null}
              </div>
              <ul className="divide-y divide-slate-200">
                {program.zones.map((zone) => (
                  <li key={`${program.id}-${zone.zoneId}`} className="px-3 py-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900">
                          <span className="tabular-nums text-slate-500">#{zone.stationNumber}</span>{" "}
                          {zone.name}
                        </p>
                        {zone.establishmentNote ? (
                          <p className="mt-0.5 text-xs text-amber-700">{zone.establishmentNote}</p>
                        ) : null}
                      </div>
                      <div className="shrink-0">
                        <ZoneRuntimeBreakdown
                          zone={zone}
                          startTimes={program.startTimes}
                          compact
                        />
                        <div className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                          {formatGallons(zone.gallonsPerEvent)} / watering day
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {/* Desktop: full table, contained so it cannot widen the page */}
      <div className="hidden max-w-full overflow-x-auto rounded-md border border-slate-200 shadow-sm md:block">
        <table className="w-full min-w-[40rem] border-collapse text-sm">
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
              <th className="px-3 py-2.5 text-center font-semibold whitespace-nowrap">
                Runtime
              </th>
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
                  <td className="border-r border-slate-200 px-3 py-2.5 align-top">
                    <ZoneRuntimeBreakdown zone={zone} startTimes={program.startTimes} />
                  </td>
                  <td className="px-3 py-2.5 text-center align-top tabular-nums text-slate-800">
                    {formatGallons(zone.gallonsPerEvent)}
                    <div className="text-xs text-muted-foreground">/ watering day</div>
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
