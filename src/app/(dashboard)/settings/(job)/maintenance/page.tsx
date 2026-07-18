import { redirect } from "next/navigation";

/** Legacy path — Rachio settings live under Integrations. */
export default function SettingsMaintenanceRedirectPage() {
  redirect("/settings/integrations/rachio");
}
