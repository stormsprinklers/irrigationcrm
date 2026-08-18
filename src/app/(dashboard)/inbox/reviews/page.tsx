import { redirectFieldInboxToSms } from "@/lib/inbox/field-guard";
import { GoogleReviewsInbox } from "@/components/inbox/GoogleReviewsInbox";

export default async function InboxGoogleReviewsPage() {
  await redirectFieldInboxToSms();
  return <GoogleReviewsInbox />;
}
