import { inboxSidebar } from "@/config/navigation";
import { ModuleLayout } from "@/components/layout/ModuleLayout";

export default function InboxLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ModuleLayout title="Inbox" sections={inboxSidebar} scrollable={false}>
      {children}
    </ModuleLayout>
  );
}
