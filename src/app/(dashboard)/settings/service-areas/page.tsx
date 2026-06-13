import { ServiceAreaManager } from "@/components/settings/service-areas/ServiceAreaManager";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";

export default function ServiceAreasSettingsPage() {
  return (
    <ContentArea className="max-w-6xl">
      <PageHeader
        title="Service Areas"
        subtitle="Manage regional service areas and zip code assignments for scheduling and routing."
      />
      <ServiceAreaManager />
    </ContentArea>
  );
}
