import { redirect } from "next/navigation";

export default function HousecallProMigrationRedirectPage() {
  redirect("/settings/integrations/migrations/housecall-pro");
}
