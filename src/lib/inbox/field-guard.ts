import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isFieldRole } from "@/lib/employees";

/** Field roles only use customer SMS — send office inbox pages home to that view. */
export async function redirectFieldInboxToSms() {
  const session = await auth();
  if (isFieldRole(session?.user?.role ?? "")) {
    redirect("/inbox/sms/customers");
  }
}
