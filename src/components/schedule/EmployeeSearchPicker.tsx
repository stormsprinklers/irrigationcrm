"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  placeholder = "Search technicians by name…",
}: Props) {
  const [query, setQuery] = useState("");
  const [displayName, setDisplayName] = useState(selectedName ?? "");

  useEffect(() => {
    if (selectedName) setDisplayName(selectedName);
  }, [selectedName]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((employee) => employee.name.toLowerCase().includes(q));
  }, [employees, query]);

  function selectEmployee(employee: EmployeeOption) {
    onValueChange(employee.id, employee.name);
    setDisplayName(employee.name);
    setQuery("");
  }

  function clearSelection() {
    onValueChange("", "");
    setDisplayName("");
    setQuery("");
  }

  return (
    <div className="space-y-2">
      {value && displayName ? (
        <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
          <span className="font-medium">{displayName}</span>
          <Button type="button" variant="ghost" size="sm" onClick={clearSelection}>
            Clear
          </Button>
        </div>
      ) : null}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      <ScrollArea className="h-40 rounded-md border border-border">
        {employees.length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground">No technicians available.</p>
        ) : results.length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground">No technicians found.</p>
        ) : (
          <ul>
            {results.map((employee) => (
              <li key={employee.id}>
                <button
                  type="button"
                  onClick={() => selectEmployee(employee)}
                  className={cn(
                    "flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-muted/50",
                    value === employee.id && "bg-highlight-panel"
                  )}
                >
                  <span className="font-medium">{employee.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </ScrollArea>
    </div>
  );
}
