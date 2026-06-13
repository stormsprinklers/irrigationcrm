export type InboxChannel = "voice" | "sms" | "email";
export type InboxScope = "customers" | "team";

export function parseInboxRoute(channel: string, scope: string) {
  const validChannels: InboxChannel[] = ["voice", "sms", "email"];
  const validScopes: InboxScope[] = ["customers", "team"];

  if (!validChannels.includes(channel as InboxChannel)) return null;
  if (!validScopes.includes(scope as InboxScope)) return null;

  return {
    channel: channel as InboxChannel,
    scope: scope as InboxScope,
  };
}

export function scopeToEnum(scope: InboxScope) {
  return scope === "customers" ? "EXTERNAL" : "INTERNAL";
}

export function channelLabel(channel: InboxChannel) {
  return { voice: "Voice", sms: "SMS", email: "Email" }[channel];
}

export function scopeLabel(scope: InboxScope) {
  return scope === "customers" ? "Customers" : "Team";
}
