import { parseCsv } from "@/lib/price-book/csv-parse";
import type { CustomerImportRow } from "@/lib/customers/import-customers";

const headerKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
const splitList = (value: string) => value.split(/[;|]/).map((part) => part.trim()).filter(Boolean);
const yes = (value: string) => /^(true|yes|y|1)$/i.test(value.trim());

export function parseCustomerImportCsv(text: string): CustomerImportRow[] {
  const parsed = parseCsv(text.replace(/^\uFEFF/, ""));
  const headers = parsed.headers.map(headerKey);
  const at = (row: string[], ...names: string[]) => {
    for (const name of names) {
      const index = headers.indexOf(headerKey(name));
      if (index >= 0 && row[index]?.trim()) return row[index].trim();
    }
    return "";
  };
  if (!headers.some((header) => ["name", "customername", "fullname", "firstname"].includes(header))) {
    throw new Error("CSV needs a Name column, or First Name and Last Name columns. Download the template for the expected layout.");
  }
  if (parsed.rows.length > 10_000) throw new Error("CSV is too large. Split it into files of 10,000 rows or fewer.");
  return parsed.rows.map((row) => ({
    name: at(row, "Name", "Customer Name", "Full Name") ||
      [at(row, "First Name"), at(row, "Last Name")].filter(Boolean).join(" "),
    address: at(row, "Address", "Street Address", "Service Address"),
    city: at(row, "City"), state: at(row, "State"), zip: at(row, "ZIP", "Zip Code", "Postal Code"),
    phone: at(row, "Phone", "Mobile", "Phone Number"),
    phones: splitList(at(row, "Secondary Phones", "Additional Phones")),
    email: at(row, "Email", "Email Address"),
    emails: splitList(at(row, "Secondary Emails", "Additional Emails")),
    companyName: at(row, "Company Name", "Business Name"),
    tags: splitList(at(row, "Tags")),
    marketingEmailOptOut: yes(at(row, "Marketing Email Opt Out")),
    marketingSmsOptOut: yes(at(row, "Marketing SMS Opt Out")),
  }));
}
