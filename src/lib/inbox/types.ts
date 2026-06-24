export type InboxChannel = "voice" | "sms" | "email" | "social";
export type CustomerTeamScope = "customers" | "team";
export type SocialScope = "facebook" | "instagram";
export type InboxScope = CustomerTeamScope | SocialScope;

const CHANNEL_SCOPES: Record<InboxChannel, InboxScope[]> = {
  voice: ["customers", "team"],
  sms: ["customers", "team"],
  email: ["customers", "team"],
  social: ["facebook", "instagram"],
};

export function getInboxScopes(channel: InboxChannel): InboxScope[] {
  return CHANNEL_SCOPES[channel];
}

export function parseInboxRoute(channel: string, scope: string) {
  const validChannels: InboxChannel[] = ["voice", "sms", "email", "social"];
  if (!validChannels.includes(channel as InboxChannel)) return null;

  const ch = channel as InboxChannel;
  const scopes = CHANNEL_SCOPES[ch];
  if (!scopes.includes(scope as InboxScope)) return null;

  return {
    channel: ch,
    scope: scope as InboxScope,
  };
}

export function scopeToEnum(scope: InboxScope) {
  if (scope === "facebook" || scope === "instagram") return scope.toUpperCase();
  return scope === "customers" ? "EXTERNAL" : "INTERNAL";
}

export function channelLabel(channel: InboxChannel) {
  return { voice: "Voice", sms: "SMS", email: "Email", social: "Social" }[channel];
}

export function scopeLabel(channel: InboxChannel, scope: InboxScope) {
  if (channel === "social") {
    return scope === "facebook" ? "Facebook" : "Instagram";
  }
  return scope === "customers" ? "Customers" : "Team";
}

export function isCustomerTeamScope(scope: InboxScope): scope is CustomerTeamScope {
  return scope === "customers" || scope === "team";
}
