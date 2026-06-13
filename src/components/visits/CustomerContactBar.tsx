"use client";

import Link from "next/link";
import { Mail, MessageSquare, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildInboxCustomerUrl } from "@/lib/inbox/links";

type Customer = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
};

type Props = {
  customer: Customer | null;
};

export function CustomerContactBar({ customer }: Props) {
  if (!customer) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        No customer linked to this visit.
      </div>
    );
  }

  const linkParams = {
    customerId: customer.id,
    phone: customer.phone,
    email: customer.email,
    name: customer.name,
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
      <span className="mr-2 font-medium">{customer.name}</span>
      {customer.phone ? (
        <>
          <Button variant="outline" size="sm" asChild>
            <Link href={buildInboxCustomerUrl("voice", linkParams)}>
              <Phone className="h-4 w-4" />
              Call
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href={buildInboxCustomerUrl("sms", linkParams)}>
              <MessageSquare className="h-4 w-4" />
              Text
            </Link>
          </Button>
        </>
      ) : null}
      {customer.email ? (
        <Button variant="outline" size="sm" asChild>
          <Link href={buildInboxCustomerUrl("email", linkParams)}>
            <Mail className="h-4 w-4" />
            Email
          </Link>
        </Button>
      ) : null}
    </div>
  );
}
