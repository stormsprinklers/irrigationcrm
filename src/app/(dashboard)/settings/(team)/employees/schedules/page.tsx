import { TeamWorkHoursPanel } from "@/components/settings/employees/TeamWorkHoursPanel";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";

export default function EmployeeWorkHoursSettingsPage() {
  return (
    <ContentArea className="max-w-4xl">
      <PageHeader
        title="Work hours"
        subtitle="Set which days each technician works. Off hours show as OFF on the schedule and cannot be booked."
      />
      <TeamWorkHoursPanel />
    </ContentArea>
  );
}
