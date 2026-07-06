import { reportingSidebar } from "@/config/navigation";
import { ModuleLayout } from "@/components/layout/ModuleLayout";

export default function ReportingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ModuleLayout title="Reporting" sections={reportingSidebar}>
      {children}
    </ModuleLayout>
  );
}
