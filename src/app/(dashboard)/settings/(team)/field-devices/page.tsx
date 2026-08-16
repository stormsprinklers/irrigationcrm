import { FieldDeviceMap } from "@/components/settings/field-devices/FieldDeviceMap";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";

export default function FieldDevicesSettingsPage() {
  return (
    <ContentArea className="max-w-6xl">
      <PageHeader
        title="Field devices"
        subtitle="Live location of signed-in iPads. Use this to find a lost device, or to confirm a technician is on the way."
      />
      <FieldDeviceMap />
    </ContentArea>
  );
}
