import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isFieldRole } from "@/lib/employees";

export default async function InboxPage() {
  const session = await auth();
  if (isFieldRole(session?.user?.role ?? "")) {
    redirect("/inbox/sms/customers");
  }
  redirect("/inbox/voice/desk");
}
