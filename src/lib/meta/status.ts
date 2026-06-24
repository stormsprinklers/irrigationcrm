import { prisma } from "@/lib/prisma";
import { getMetaEnvConfig, META_CRM_SETTINGS, META_VERCEL_ENV_VARS } from "@/lib/meta/config";

export type MetaIntegrationStatus = {
  status: "connected" | "configured" | "not_configured" | "awaiting_verification";
  message: string;
  callbackUrl: string | null;
  webhookVerifiedAt: string | null;
  hasVerifyToken: boolean;
  hasAppSecret: boolean;
  hasPageId: boolean;
  hasAppId: boolean;
  lastWebhookEventAt: string | null;
  setupUrl: "/marketing/social";
  vercelEnv: typeof META_VERCEL_ENV_VARS;
  crmSettings: typeof META_CRM_SETTINGS;
  env: ReturnType<typeof getMetaEnvConfig>;
};

export async function getMetaIntegrationStatus(
  companyId: string
): Promise<MetaIntegrationStatus> {
  const env = getMetaEnvConfig();

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      metaAppId: true,
      metaAppSecret: true,
      metaPageId: true,
      metaWebhookVerifyToken: true,
      metaWebhookVerifiedAt: true,
    },
  });

  const lastEvent = await prisma.metaWebhookEvent.findFirst({
    where: { companyId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  const hasVerifyToken = Boolean(company?.metaWebhookVerifyToken);
  const hasAppSecret = Boolean(company?.metaAppSecret);
  const hasPageId = Boolean(company?.metaPageId);
  const hasAppId = Boolean(company?.metaAppId || env.appId);
  const verified = Boolean(company?.metaWebhookVerifiedAt);
  const hasAppUrl = Boolean(env.callbackUrl);

  let status: MetaIntegrationStatus["status"] = "not_configured";
  let message = "Complete Meta setup in Marketing → Social → Meta webhooks.";

  if (!hasAppUrl) {
    message = "Set NEXT_PUBLIC_APP_URL in Vercel so Meta can reach your webhook.";
  } else if (!hasVerifyToken) {
    message = "Generate and save a verify token in Marketing → Social.";
  } else if (!verified) {
    status = "awaiting_verification";
    message =
      "Paste the callback URL and verify token in Meta Developer Console, then click Verify and Save.";
  } else if (!hasPageId || !hasAppSecret) {
    status = "configured";
    message =
      "Webhook verified. Add your App Secret and Facebook Page ID so events are validated and routed.";
  } else if (lastEvent) {
    status = "connected";
    message = "Receiving webhook events from Meta.";
  } else {
    status = "configured";
    message =
      "Webhook verified. Subscribe to messaging fields in Meta and send a test message.";
  }

  return {
    status,
    message,
    callbackUrl: env.callbackUrl,
    webhookVerifiedAt: company?.metaWebhookVerifiedAt?.toISOString() ?? null,
    hasVerifyToken,
    hasAppSecret,
    hasPageId,
    hasAppId,
    lastWebhookEventAt: lastEvent?.createdAt.toISOString() ?? null,
    setupUrl: "/marketing/social",
    vercelEnv: META_VERCEL_ENV_VARS,
    crmSettings: META_CRM_SETTINGS,
    env,
  };
}
