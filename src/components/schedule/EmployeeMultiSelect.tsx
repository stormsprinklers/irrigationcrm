"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type EmployeeOption = {
  id: string;
  name: string;
};

type Props = {
  values: string[];
  employees: EmployeeOption[];
  onValuesChange: (employeeIds: string[]) => void;
  placeholder?: string;
};

export function EmployeeMultiSelect({
  values,
  employees,
  onValuesChange,
  placeholder = "Select technicians",
}: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties | null>(null);

  useEffect(() => {
    if (!open) {
      setMenuStyle(null);
      setQuery("");
      return;
    }

    function updatePosition() {
      const el = triggerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const gap = 4;
      const spaceBelow = window.innerHeight - rect.bottom - gap;
      const spaceAbove = rect.top - gap;
      const openUp = spaceBelow < 220 && spaceAbove > spaceBelow;
      setMenuStyle({
        position: "fixed",
        left: rect.left,
        width: Math.max(rect.width, 280),
        zIndex: 300,
        maxHeight: Math.min(320, Math.max(openUp ? spaceAbove : spaceBelow, 180)),
        ...(openUp
          ? { bottom: window.innerHeight - rect.top + gap }
          : { top: rect.bottom + gap }),
      });
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((employee) => employee.name.toLowerCase().includes(q));
  }, [employees, query]);

  const selectedEmployees = values
    .map((id) => employees.find((employee) => employee.id === id))
    .filter((employee): employee is EmployeeOption => Boolean(employee));

  function toggleEmployee(employeeId: string) {
    onValuesChange(
      values.includes(employeeId)
        ? values.filter((id) => id !== employeeId)
        : [...values, employeeId]
    );
  }

  return (
    <div className="relative space-y-2">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex min-h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-1.5 text-left text-sm shadow-sm hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <span className={cn("truncate", !values.length && "text-muted-foreground")}>
          {values.length
            ? `${values.length} technician${values.length === 1 ? "" : "s"} selected`
            : placeholder}
        </span>
        <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </button>

      {selectedEmployees.length ? (
        <div className="flex flex-wrap gap-1.5">
          {selectedEmployees.map((employee, index) => (
            <span
              key={employee.id}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-1 text-xs text-foreground"
            >
              {employee.name}
              {index === 0 ? <span className="text-muted-foreground">(primary)</span> : null}
              <button
                type="button"
                onClick={() => toggleEmployee(employee.id)}
                className="rounded-full text-muted-foreground hover:text-foreground"
                aria-label={`Remove ${employee.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      {open && menuStyle && typeof document !== "undefined"
        ? createPortal(
            <>
              <button
                type="button"
                className="fixed inset-0 z-[290] cursor-default"
                aria-label="Close technician list"
                onClick={() => setOpen(false)}
              />
              <div
                className="flex flex-col overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md"
                style={menuStyle}
              >
                <div className="relative border-b border-border p-1.5">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    autoFocus
                    placeholder="Search by name…"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    className="h-8 pl-8"
                  />
                </div>
                <ul className="min-h-0 flex-1 overflow-y-auto py-1" role="listbox" aria-multiselectable>
                  {results.length ? (
                    results.map((employee) => {
                      const selected = values.includes(employee.id);
                      return (
                        <li key={employee.id}>
                          <button
                            type="button"
                            role="option"
                            aria-selected={selected}
                            onClick={() => toggleEmployee(employee.id)}
                            className={cn(
                              "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground",
                              selected && "bg-highlight-panel"
                            )}
                          >
                            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-input">
                              {selected ? <Check className="h-3 w-3" /> : null}
                            </span>
                            <span className="min-w-0 flex-1 truncate">{employee.name}</span>
                          </button>
                        </li>
                      );
                    })
                  ) : (
                    <li className="px-3 py-2 text-sm text-muted-foreground">No technicians found.</li>
                  )}
                </ul>
                <div className="flex justify-end border-t border-border p-2">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
                  >
                    Done
                  </button>
                </div>
              </div>
            </>,
            document.body
          )
        : null}
    </div>
  );
}
