import { Suspense } from "react";
import CustomersPageContent from "@/components/customers/CustomersPageContent";

export default function ContactsPage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-muted-foreground">Loading...</p>}>
      <CustomersPageContent segment="CONTACTS" />
    </Suspense>
  );
}
