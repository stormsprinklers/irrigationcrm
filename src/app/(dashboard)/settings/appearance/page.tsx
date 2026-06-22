"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { cn } from "@/lib/utils";

const themeOptions = [
  { value: "light", label: "Light", description: "Always use light mode", icon: Sun },
  { value: "dark", label: "Dark", description: "Always use dark mode", icon: Moon },
  { value: "system", label: "System", description: "Match your device setting", icon: Monitor },
] as const;

export default function SettingsAppearancePage() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const activeTheme = theme ?? "system";

  return (
    <ContentArea className="max-w-2xl">
      <PageHeader
        breadcrumb={["Settings", "Appearance"]}
        title="Appearance"
        subtitle="Choose how Irrigation CRM looks on this device"
      />

      <section className="rounded-lg border border-border bg-card p-6">
        <h3 className="text-lg font-semibold">Color theme</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Your preference is saved in this browser and does not affect other team members.
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {themeOptions.map((option) => {
            const Icon = option.icon;
            const selected = mounted && activeTheme === option.value;

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setTheme(option.value)}
                className={cn(
                  "rounded-lg border p-4 text-left transition-colors",
                  selected
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "border-border bg-background hover:bg-muted/50"
                )}
              >
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-primary" />
                  <span className="font-medium">{option.label}</span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{option.description}</p>
              </button>
            );
          })}
        </div>

        {mounted ? (
          <p className="mt-4 text-xs text-muted-foreground">
            Currently showing{" "}
            <span className="font-medium text-foreground">
              {resolvedTheme === "dark" ? "dark" : "light"}
            </span>{" "}
            mode
            {activeTheme === "system" ? " (from your system preference)" : ""}.
          </p>
        ) : null}
      </section>
    </ContentArea>
  );
}
