import { EmployeeList } from "@/components/settings/employees/EmployeeList";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";

export default function EmployeesSettingsPage() {
  return (
    <ContentArea className="max-w-5xl">
      <PageHeader
        title="Employees"
        subtitle="Manage team members, roles, photos, service area assignments, and crews."
      />
      <EmployeeList />
    </ContentArea>
  );
}
