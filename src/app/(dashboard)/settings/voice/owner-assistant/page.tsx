import { redirect } from "next/navigation";

export default function LegacyOwnerAssistantSettingsPage() {
  redirect("/settings/agents/owner-assistant");
}
