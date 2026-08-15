import type { StormAiPageContext } from "@/lib/storm-ai/types";

const SKIP_CUSTOMER = new Set(["leads", "jobs", "invoices", "estimates"]);

export function pageContextFromLocation(pathname: string, search = ""): StormAiPageContext {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const ctx: StormAiPageContext = { pathname };

  const customer = pathname.match(/^\/customers\/([^/]+)/);
  if (customer && !SKIP_CUSTOMER.has(customer[1])) {
    ctx.customerId = customer[1];
  }

  const visit = pathname.match(/^\/visits\/([^/]+)/);
  if (visit) ctx.visitId = visit[1];

  const invoice = pathname.match(/\/invoices\/([^/]+)/);
  if (invoice && invoice[1] !== "page") ctx.invoiceId = invoice[1];

  const employee = pathname.match(/^\/settings\/employees\/([^/]+)/);
  if (employee) ctx.employeeId = employee[1];
  const employeeQuery = params.get("employeeId") || params.get("userId");
  if (employeeQuery) ctx.employeeId = employeeQuery;

  return ctx;
}
