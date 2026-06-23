import { ChecklistTemplateList } from "@/components/settings/checklists/ChecklistTemplateList";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";

export default function ChecklistsSettingsPage() {
  return (
    <ContentArea className="max-w-4xl">
      <PageHeader
        title="Checklists"
        subtitle="Create checklists technicians complete on jobs. Control when they apply and whether they are required to finish a visit."
      />
      <ChecklistTemplateList />
    </ContentArea>
  );
}
