import { TemplateWizard } from "@/components/maintenance-plans/TemplateWizard";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";

export default function NewMaintenancePlanTemplatePage() {
  return (
    <ContentArea className="max-w-3xl">
      <PageHeader breadcrumb={["Maintenance Plans", "Templates", "New"]} title="New plan template" />
      <TemplateWizard />
    </ContentArea>
  );
}
