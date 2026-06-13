import { ContentArea } from "@/components/layout/ContentArea";
import { EmptyState } from "@/components/layout/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { Construction } from "lucide-react";

type PlaceholderPageProps = {
  title: string;
  breadcrumb?: string[];
};

export function PlaceholderPage({ title, breadcrumb }: PlaceholderPageProps) {
  return (
    <ContentArea>
      <PageHeader breadcrumb={breadcrumb} title={title} />
      <EmptyState
        icon={Construction}
        title="Coming soon"
        description="This section will be built in a future phase."
      />
    </ContentArea>
  );
}
