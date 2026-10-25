"use client";

import Link from "next/link";
import { Mail, MessageSquare, Phone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useVoiceDevice } from "@/contexts/VoiceDeviceProvider";
import { buildInboxCustomerUrl } from "@/lib/inbox/links";
import { formatPhoneDisplay } from "@/lib/inbox/phone";

type Props = {
  customerId: string;
  name?: string;
  phone?: string | null;
  email?: string | null;
  size?: "sm" | "icon";
  showCallLabel?: boolean;
};

export function CustomerPhoneActions({
  customerId,
  name,
  phone,
  size = "icon",
  showCallLabel = false,
}: Pick<Props, "customerId" | "name" | "phone" | "size" | "showCallLabel">) {
  const { ready, connect, activeCall } = useVoiceDevice();

  if (!phone) return null;

  const displayPhone = formatPhoneDisplay(phone);
  const linkParams = { customerId, phone, name };

  async function handleCall() {
    if (!ready) {
      toast.error("Softphone not ready — check Twilio Voice settings");
      return;
    }
    if (activeCall) {
      toast.error("Already on a call");
      return;
    }
    try {
      await connect(phone!, customerId);
      toast.success("Calling…");
    } catch {
      toast.error("Failed to place call");
    }
  }

  const buttonSize = size === "sm" ? "sm" : "icon";
  const iconClass = size === "sm" ? "h-4 w-4" : "h-4 w-4";

  return (
    <span className="inline-flex items-center gap-1">
      <Button
        type="button"
        variant={showCallLabel ? "outline" : "ghost"}
        size={buttonSize}
        className={showCallLabel ? "h-8 shrink-0 gap-2 px-3 text-primary" : "h-8 w-8 shrink-0 text-primary"}
        aria-label={`Call ${displayPhone}`}
        onClick={() => void handleCall()}
      >
        <Phone className={iconClass} />
        {showCallLabel ? "Call" : null}
      </Button>
      <Button variant="ghost" size={buttonSize} className="h-8 w-8 shrink-0 text-primary" asChild>
        <Link href={buildInboxCustomerUrl("sms", linkParams)} aria-label={`Text ${displayPhone}`}>
          <MessageSquare className={iconClass} />
        </Link>
      </Button>
    </span>
  );
}

export function CustomerEmailAction({
  customerId,
  name,
  email,
  size = "icon",
}: Pick<Props, "customerId" | "name" | "email" | "size">) {
  if (!email) return null;

  const buttonSize = size === "sm" ? "sm" : "icon";
  const iconClass = size === "sm" ? "h-4 w-4" : "h-4 w-4";

  return (
    <Button variant="ghost" size={buttonSize} className="h-8 w-8 shrink-0 text-primary" asChild>
      <Link
        href={buildInboxCustomerUrl("email", { customerId, email, name })}
        aria-label={`Email ${email}`}
      >
        <Mail className={iconClass} />
      </Link>
    </Button>
  );
}
