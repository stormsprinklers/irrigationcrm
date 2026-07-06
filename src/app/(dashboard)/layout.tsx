import { AppShell } from "@/components/layout/AppShell";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell><div className="h-full min-h-0">{children}</div></AppShell>;
}
