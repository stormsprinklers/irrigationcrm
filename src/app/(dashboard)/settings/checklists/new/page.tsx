import { ChecklistTemplateEditor } from "@/components/settings/checklists/ChecklistTemplateEditor";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";

export default function NewChecklistPage() {
  return (
    <ContentArea className="max-w-4xl">
      <PageHeader title="New checklist" subtitle="Define items and rules for when this checklist applies." />
      <ChecklistTemplateEditor />
    </ContentArea>
  );
}
