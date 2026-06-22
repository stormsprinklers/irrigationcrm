import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { ThemeToaster } from "@/components/providers/ThemeToaster";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider>
        {children}
        <ThemeToaster />
      </ThemeProvider>
    </SessionProvider>
  );
}
