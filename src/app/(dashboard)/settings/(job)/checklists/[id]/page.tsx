import { ChecklistTemplateEditor } from "@/components/settings/checklists/ChecklistTemplateEditor";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";

type Props = { params: Promise<{ id: string }> };

export default async function EditChecklistPage({ params }: Props) {
  const { id } = await params;
  return (
    <ContentArea className="max-w-4xl">
      <PageHeader title="Edit checklist" subtitle="Update items and application rules." />
      <ChecklistTemplateEditor templateId={id} />
    </ContentArea>
  );
}
