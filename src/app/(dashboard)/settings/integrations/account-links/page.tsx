import { redirect } from "next/navigation";

export default function AccountLinksRedirectPage() {
  redirect("/settings/integrations/create-company");
}
