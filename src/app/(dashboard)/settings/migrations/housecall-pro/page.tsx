import { HousecallProMigrationPanel } from "@/components/migrations/housecall-pro/HousecallProMigrationPanel";

export default function HousecallProMigrationPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Housecall Pro migration</h1>
        <p className="text-sm text-muted-foreground">
          Import customers, jobs, estimates, invoices, price book, and attachments from Housecall
          Pro in controlled batches. This is read-only against Housecall Pro — nothing is deleted or
          modified in your HCP account.
        </p>
      </div>
      <HousecallProMigrationPanel />
    </div>
  );
}
