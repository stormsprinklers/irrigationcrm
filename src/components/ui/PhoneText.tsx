"use client";

import { formatPhoneDisplay } from "@/lib/inbox/phone";

/** Renders a phone number in CRM display format: +1 (555) 111-1234 */
export function PhoneText({
  phone,
  empty = "—",
  className,
}: {
  phone: string | null | undefined;
  empty?: string;
  className?: string;
}) {
  const formatted = formatPhoneDisplay(phone);
  if (!formatted) {
    return <span className={className}>{empty}</span>;
  }
  return <span className={className}>{formatted}</span>;
}
