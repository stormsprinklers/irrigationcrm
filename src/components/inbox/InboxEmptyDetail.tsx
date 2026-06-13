import { MessageSquare } from "lucide-react";
import { EmptyState } from "@/components/layout/EmptyState";

export function InboxEmptyDetail() {
  return (
    <EmptyState
      icon={MessageSquare}
      title="No chat room selected"
      className="h-full bg-white"
    />
  );
}
