import { redirect } from "next/navigation";
import { reportingSidebar } from "@/config/navigation";
import { ModuleLayout } from "@/components/layout/ModuleLayout";
import { auth } from "@/lib/auth";
import { canViewReporting } from "@/lib/settings/access";

export default async function ReportingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!canViewReporting(session?.user?.role)) {
    redirect("/home");
  }

  return (
    <ModuleLayout title="Reporting" sections={reportingSidebar}>
      {children}
    </ModuleLayout>
  );
}
