import type { CompanyField } from "@/lib/mock/settings-company";
import Link from "next/link";

type CompanyProfileProps = {
  fields: CompanyField[];
  description: string;
};

export function CompanyProfile({ fields, description }: CompanyProfileProps) {
  return (
    <div className="space-y-8">
      <section className="rounded-lg border border-border bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Business Information</h3>
          <Link href="#" className="text-sm font-medium text-primary hover:underline">
            Edit
          </Link>
        </div>
        <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          {fields.map((field) => (
            <div key={field.label}>
              <dt className="text-sm text-muted-foreground">{field.label}</dt>
              <dd className="mt-1 text-sm font-medium">{field.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="rounded-lg border border-border bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Company Description</h3>
          <Link href="#" className="text-sm font-medium text-primary hover:underline">
            Edit
          </Link>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
      </section>
    </div>
  );
}
