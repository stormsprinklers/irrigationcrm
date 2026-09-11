"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronsUpDown, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type EmployeeOption = {
  id: string;
  name: string;
};

type Props = {
  value: string;
  selectedName?: string;
  employees: EmployeeOption[];
  onValueChange: (employeeId: string, employeeName: string) => void;
  placeholder?: string;
};

export function EmployeeSearchPicker({
  value,
  selectedName,
  employees,
  onValueChange,
  placeholder = "Select technician",
}: Props) {
  const [query, setQuery] = useState("");
  const [displayName, setDisplayName] = useState(selectedName ?? "");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});

  useEffect(() => {
    if (selectedName) setDisplayName(selectedName);
  }, [selectedName]);

  useEffect(() => {
    if (!open) return;

    function updatePosition() {
      const el = rootRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const menuHeight = 240;
      const gap = 4;
      const spaceBelow = window.innerHeight - rect.bottom - gap;
      const openUp = spaceBelow < menuHeight && rect.top > spaceBelow;
      setMenuStyle({
        position: "fixed",
        left: rect.left,
        width: rect.width,
        zIndex: 200,
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

  function selectEmployee(employee: EmployeeOption) {
    onValueChange(employee.id, employee.name);
    setDisplayName(employee.name);
    setQuery("");
    setOpen(false);
  }

  function clearSelection() {
    onValueChange("", "");
    setDisplayName("");
    setQuery("");
    setOpen(false);
  }

  const label = value && displayName ? displayName : placeholder;

  return (
    <div className="relative" ref={rootRef}>
      <div className="flex gap-1">
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
          className="flex h-9 min-w-0 flex-1 items-center justify-between rounded-md border border-input bg-background px-3 text-left text-sm shadow-sm hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <span className={cn("truncate", !(value && displayName) && "text-muted-foreground")}>
            {label}
          </span>
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>
        {value ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={clearSelection}
            aria-label="Clear technician"
          >
            <X className="h-4 w-4" />
          </Button>
        ) : null}
      </div>

      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default"
            aria-label="Close technician list"
            onClick={() => setOpen(false)}
          />
          <div
            className="rounded-md border border-border bg-popover text-popover-foreground shadow-md"
            style={menuStyle}
          >
            <div className="relative border-b border-border p-1.5">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                placeholder="Search by name…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-8 pl-8"
              />
            </div>
            <ul className="max-h-48 overflow-y-auto py-1" role="listbox">
              {employees.length === 0 ? (
                <li className="px-3 py-2 text-sm text-muted-foreground">No technicians available.</li>
              ) : results.length === 0 ? (
                <li className="px-3 py-2 text-sm text-muted-foreground">No technicians found.</li>
              ) : (
                results.map((employee) => (
                  <li key={employee.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={value === employee.id}
                      onClick={() => selectEmployee(employee)}
                      className={cn(
                        "flex w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground",
                        value === employee.id && "bg-highlight-panel"
                      )}
                    >
                      {employee.name}
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        </>
      ) : null}
    </div>
  );
}
