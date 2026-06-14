import { TopNav } from "@/components/layout/TopNav";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-page">
      <TopNav />
      <main className="flex-1">{children}</main>
    </div>
  );
}
