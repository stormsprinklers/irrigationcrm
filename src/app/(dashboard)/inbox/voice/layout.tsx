import { redirectFieldInboxToSms } from "@/lib/inbox/field-guard";

export default async function InboxVoiceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await redirectFieldInboxToSms();
  return children;
}
