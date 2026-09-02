export async function createDraftCustomer(fields?: {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
}) {
  const name = fields?.name?.trim() || "New customer";
  const res = await fetch("/api/customers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      phone: fields?.phone?.trim() || undefined,
      email: fields?.email?.trim() || undefined,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error ?? "Failed to create customer");
  }
  return data as { id: string };
}

export async function createCallDraftVisit(fields?: {
  customerId?: string | null;
  callSessionId?: string | null;
  callerName?: string | null;
  callerPhone?: string | null;
}) {
  let customerId = fields?.customerId ?? null;
  if (!customerId) {
    const customer = await createDraftCustomer({
      name: fields?.callerName,
      phone: fields?.callerPhone,
    });
    customerId = customer.id;
  }
  return createDraftVisit({
    customerId,
    callSessionId: fields?.callSessionId,
    title: "Service call",
  });
}

export async function createDraftVisit(fields?: {
  customerId?: string | null;
  callSessionId?: string | null;
  title?: string | null;
}) {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  const dateStr = date.toISOString().slice(0, 10);
  const startAt = new Date(`${dateStr}T09:00`);
  const endAt = new Date(`${dateStr}T11:00`);
  const res = await fetch("/api/schedule/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: fields?.title?.trim() || "New visit",
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      division: "SERVICE",
      status: "UNSCHEDULED",
      customerId: fields?.customerId || undefined,
      callSessionId: fields?.callSessionId || undefined,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error ?? "Failed to create visit");
  }
  return data as { id: string };
}
