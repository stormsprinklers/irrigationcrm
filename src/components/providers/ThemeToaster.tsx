"use client";

import { Toaster } from "sonner";
import { useTheme } from "next-themes";

export function ThemeToaster() {
  const { resolvedTheme } = useTheme();

  return (
    <Toaster
      position="bottom-center"
      theme={resolvedTheme === "dark" ? "dark" : "light"}
    />
  );
}
