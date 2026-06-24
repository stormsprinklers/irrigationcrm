import type { IntegrationType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type IntegrationStatusState =
  | "connected"
  | "configured"
  | "not_configured"
  | "error"
  | "disabled";

export type IntegrationStatus = {
  type: IntegrationType;
  label: string;
  status: IntegrationStatusState;
  message: string;
  lastUsedAt: string | null;
  spokeUrl: string | null;
  envHints: string[];
};

const TYPE_LABELS: Record<IntegrationType, string> = {
  WEBSITE: "Website",
  LMS: "LMS",
  DESIGN: "Design",
  MAPS: "Maps",
};

const SPOKE_URL_ENV: Partial<Record<IntegrationType, string>> = {
  WEBSITE: "NEXT_PUBLIC_WEBSITE_URL",
  DESIGN: "NEXT_PUBLIC_DESIGN_URL",
  LMS: "NEXT_PUBLIC_LMS_URL",
};

function spokeUrlFor(type: IntegrationType): string | null {
  if (type === "WEBSITE") return process.env.NEXT_PUBLIC_WEBSITE_URL?.trim() || null;
  if (type === "DESIGN") return process.env.NEXT_PUBLIC_DESIGN_URL?.trim() || null;
  if (type === "LMS") return process.env.NEXT_PUBLIC_LMS_URL?.trim() || null;
  return null;
}

function inboundCredentialStatus(
  type: IntegrationType,
  credentials: Array<{ enabled: boolean; lastUsedAt: Date | null }>
): Pick<IntegrationStatus, "status" | "message" | "lastUsedAt"> {
  const ofType = credentials.filter((c) => c.enabled);
  const disabled = credentials.filter((c) => !c.enabled);

  if (ofType.length === 0) {
    if (disabled.length > 0) {
      return {
        status: "disabled",
        message: "All API keys for this integration are disabled or revoked.",
        lastUsedAt: null,
      };
    }
    return {
      status: "not_configured",
      message: "Generate an API key below and add it to the spoke app's environment.",
      lastUsedAt: null,
    };
  }

  const latestUsed = ofType
    .filter((c) => c.lastUsedAt)
    .sort((a, b) => b.lastUsedAt!.getTime() - a.lastUsedAt!.getTime())[0];

  if (latestUsed?.lastUsedAt) {
    const when = latestUsed.lastUsedAt.toLocaleString();
    return {
      status: "connected",
      message: `Receiving traffic — last successful request ${when}.`,
      lastUsedAt: latestUsed.lastUsedAt.toISOString(),
    };
  }

  return {
    status: "configured",
    message: "API key is active. Waiting for the spoke app to send its first request.",
    lastUsedAt: null,
  };
}

async function testLmsOutboundConnection(): Promise<Pick<IntegrationStatus, "status" | "message">> {
  const base = process.env.LMS_INTEGRATION_URL?.replace(/\/$/, "") ?? "";
  const key = process.env.LMS_INTEGRATION_KEY ?? "";

  if (!base || !key) {
    return {
      status: "not_configured",
      message:
        "Set LMS_INTEGRATION_URL and LMS_INTEGRATION_KEY on CRM, and INTEGRATION_API_KEY (same value) on LMS.",
    };
  }

  try {
    const res = await fetch(
      `${base}/api/integrations/crm/users/__connection_test__/progress`,
      {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
      }
    );

    if (res.status === 401) {
      return {
        status: "error",
        message: "LMS rejected the API key. Ensure INTEGRATION_API_KEY on LMS matches LMS_INTEGRATION_KEY on CRM.",
      };
    }
    if (res.status === 503) {
      return {
        status: "error",
        message: "LMS integration is not configured. Set INTEGRATION_API_KEY on the LMS deployment.",
      };
    }
    if (res.status === 404) {
      return {
        status: "connected",
        message: "LMS is reachable and accepted the API key.",
      };
    }
    if (res.ok) {
      return { status: "connected", message: "LMS is reachable and responded successfully." };
    }
    return {
      status: "error",
      message: `LMS returned unexpected status ${res.status}. Check LMS_INTEGRATION_URL.`,
    };
  } catch {
    return {
      status: "error",
      message: `Could not reach LMS at ${base}. Check the URL and redeploy LMS.`,
    };
  }
}

export async function getIntegrationStatuses(companyId: string): Promise<IntegrationStatus[]> {
  const credentials = await prisma.integrationCredential.findMany({
    where: { companyId },
    select: {
      type: true,
      enabled: true,
      lastUsedAt: true,
    },
  });

  const types: IntegrationType[] = ["WEBSITE", "LMS", "DESIGN", "MAPS"];

  return Promise.all(
    types.map(async (type) => {
      const ofType = credentials.filter((c) => c.type === type);
      const url = spokeUrlFor(type);
      const envKey = SPOKE_URL_ENV[type];

      if (type === "LMS") {
        const lmsTest = await testLmsOutboundConnection();
        const employeeSync = await prisma.user.count({
          where: { companyId, lmsSyncStatus: "synced" },
        });
        const syncErrors = await prisma.user.count({
          where: { companyId, lmsSyncStatus: "error" },
        });

        let message = lmsTest.message;
        if (lmsTest.status === "connected" && employeeSync > 0) {
          message += ` ${employeeSync} employee(s) synced.`;
        }
        if (syncErrors > 0 && lmsTest.status !== "error") {
          message += ` ${syncErrors} employee(s) had sync errors.`;
        }

        return {
          type,
          label: TYPE_LABELS[type],
          status: lmsTest.status,
          message,
          lastUsedAt: null,
          spokeUrl: url,
          envHints: [
            "CRM: LMS_INTEGRATION_URL, LMS_INTEGRATION_KEY",
            "LMS: INTEGRATION_API_KEY (same secret as LMS_INTEGRATION_KEY)",
            envKey ? `CRM: ${envKey} (optional UI link)` : "",
          ].filter(Boolean),
        };
      }

      const credStatus = inboundCredentialStatus(type, ofType);
      const hints = [
        "Spoke: CRM_INTEGRATION_URL, CRM_INTEGRATION_KEY",
        envKey ? `CRM: ${envKey}` : "",
      ].filter(Boolean);

      if (credStatus.status === "configured" && !url && envKey) {
        return {
          type,
          label: TYPE_LABELS[type],
          status: "configured",
          message: `${credStatus.message} Also set ${envKey} on CRM for deep links.`,
          lastUsedAt: credStatus.lastUsedAt,
          spokeUrl: url,
          envHints: hints,
        };
      }

      return {
        type,
        label: TYPE_LABELS[type],
        status: credStatus.status,
        message: credStatus.message,
        lastUsedAt: credStatus.lastUsedAt,
        spokeUrl: url,
        envHints: hints,
      };
    })
  );
}
