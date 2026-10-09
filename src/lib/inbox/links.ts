export type InboxCustomerLinkParams = {
  customerId?: string;
  phone?: string | null;
  email?: string | null;
  name?: string;
  autoCall?: boolean;
};

export function buildInboxCustomerUrl(
  channel: "voice" | "sms" | "email",
  params: InboxCustomerLinkParams
) {
  const search = new URLSearchParams();
  if (params.customerId) search.set("customerId", params.customerId);
  if (params.phone) search.set("phone", params.phone);
  if (params.email) search.set("email", params.email);
  if (params.name) search.set("name", params.name);
  if (params.autoCall) search.set("autoCall", "1");
  const qs = search.toString();

  if (channel === "email") {
    return `/inbox/compose${qs ? `?${qs}` : ""}`;
  }

  if (channel === "voice") {
    return `/inbox/voice/desk${qs ? `?${qs}` : ""}`;
  }

  return `/inbox/${channel}/customers${qs ? `?${qs}` : ""}`;
}
