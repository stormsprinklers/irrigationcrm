import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { ThemeToaster } from "@/components/providers/ThemeToaster";
import { PwaProvider } from "@/components/pwa/PwaProvider";

export default function Providers({ children, nativeShell = false }: { children: React.ReactNode; nativeShell?: boolean }) {
  return (
    <SessionProvider>
      <ThemeProvider>
        {children}
        <ThemeToaster />
        <PwaProvider nativeShell={nativeShell} />
      </ThemeProvider>
    </SessionProvider>
  );
}
