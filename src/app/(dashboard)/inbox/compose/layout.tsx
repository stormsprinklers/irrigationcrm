import { redirectFieldInboxToSms } from "@/lib/inbox/field-guard";

export default async function InboxComposeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await redirectFieldInboxToSms();
  return children;
}
