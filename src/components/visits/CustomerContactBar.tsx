import { Mail, MessageSquare, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";

type Customer = {
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

  const phoneDigits = customer.phone?.replace(/\D/g, "");

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
      <span className="mr-2 font-medium">{customer.name}</span>
      {customer.phone ? (
        <>
          <Button variant="outline" size="sm" asChild>
            <a href={`tel:${customer.phone}`}>
              <Phone className="h-4 w-4" />
              Call
            </a>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={`sms:${phoneDigits}`}>
              <MessageSquare className="h-4 w-4" />
              Text
            </a>
          </Button>
        </>
      ) : null}
      {customer.email ? (
        <Button variant="outline" size="sm" asChild>
          <a href={`mailto:${customer.email}`}>
            <Mail className="h-4 w-4" />
            Email
          </a>
        </Button>
      ) : null}
    </div>
  );
}
