import { inboxSidebar } from "@/config/navigation";
import { ModuleSidebar } from "@/components/layout/ModuleSidebar";

export default function InboxLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden">
      <ModuleSidebar title="Inbox" sections={inboxSidebar} />
      <div className="flex min-w-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
