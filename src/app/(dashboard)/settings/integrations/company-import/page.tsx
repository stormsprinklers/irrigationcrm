import { redirect } from "next/navigation";

/** Import-from-Storm tooling removed from Settings; keep URL from 404ing. */
export default function CompanyImportRedirectPage() {
  redirect("/settings/integrations");
}
