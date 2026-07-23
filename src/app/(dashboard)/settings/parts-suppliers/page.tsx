import { PartsSuppliersManager } from "@/components/settings/parts-suppliers/PartsSuppliersManager";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";

export default function PartsSuppliersSettingsPage() {
  return (
    <ContentArea className="max-w-6xl">
      <PageHeader
        title="Suppliers"
        subtitle="Configure irrigation parts suppliers. Technicians can pause the visit timer and navigate to the nearest open store."
      />
      <PartsSuppliersManager />
    </ContentArea>
  );
}
