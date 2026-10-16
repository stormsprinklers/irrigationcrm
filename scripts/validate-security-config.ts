const deployment = (process.env.VERCEL_ENV || process.env.APP_ENV || "local").toLowerCase();
const isDeployed = deployment === "production" || deployment === "preview" || deployment === "staging";
const strictSecurityConfig = process.env.STRICT_SECURITY_CONFIG?.trim().toLowerCase() === "true";

const errors: string[] = [];
const warnings: string[] = [];

function value(name: string): string {
  return process.env[name]?.trim() || "";
}

function requireValue(name: string, minimumLength = 1) {
  const configured = value(name);
  if (!configured) errors.push(`${name} is required`);
  else if (configured.length < minimumLength) {
    errors.push(`${name} must be at least ${minimumLength} characters`);
  }
}

function recommendValue(name: string, minimumLength = 1) {
  const configured = value(name);
  const message = !configured
    ? `${name} is not configured`
    : configured.length < minimumLength
      ? `${name} should be at least ${minimumLength} characters`
      : "";

  if (!message) return;
  if (strictSecurityConfig) errors.push(message);
  else warnings.push(`${message}; set STRICT_SECURITY_CONFIG=true after provisioning deployment secrets to enforce this at build time`);
}

if (isDeployed) {
  requireValue("DATABASE_URL");
  if (!value("AUTH_SECRET") && !value("NEXTAUTH_SECRET")) {
    errors.push("AUTH_SECRET or NEXTAUTH_SECRET is required");
  } else if ((value("AUTH_SECRET") || value("NEXTAUTH_SECRET")).length < 32) {
    const message = "AUTH_SECRET/NEXTAUTH_SECRET should be at least 32 characters";
    if (strictSecurityConfig) errors.push(message);
    else warnings.push(`${message}; rotate it before enabling STRICT_SECURITY_CONFIG`);
  }
  // These controls already fail closed or use AUTH_SECRET as a server-only
  // fallback at runtime. Roll their deployment requirements out as warnings
  // until the environment has been provisioned, then enable strict mode.
  recommendValue("CRON_SECRET", 32);
  recommendValue("RATE_LIMIT_PEPPER", 32);
  recommendValue("MARKETING_TRACKING_SECRET", 32);

  const malwareScanMode = value("MALWARE_SCAN_MODE");
  if (!malwareScanMode) {
    recommendValue("MALWARE_SCAN_MODE");
    warnings.push("Malware scanning defaults to disabled until a scanner is configured");
  } else if (malwareScanMode !== "disabled" && malwareScanMode !== "required") {
    errors.push("MALWARE_SCAN_MODE must be explicitly set to disabled or required");
  }
  if (malwareScanMode === "required") {
    requireValue("MALWARE_SCAN_URL");
    requireValue("MALWARE_SCAN_TOKEN", 16);
    try {
      if (new URL(value("MALWARE_SCAN_URL")).protocol !== "https:") {
        errors.push("MALWARE_SCAN_URL must use HTTPS");
      }
    } catch {
      errors.push("MALWARE_SCAN_URL must be a valid HTTPS URL");
    }
  } else if (malwareScanMode === "disabled") {
    warnings.push("Malware scanning is disabled; document this deployment risk acceptance");
  }

  const outboundMode = value("OUTBOUND_COMMS_MODE") || "normal";
  if (deployment !== "production" && outboundMode === "normal") {
    errors.push("Preview/staging deployments must use OUTBOUND_COMMS_MODE=allowlist or disabled");
  }
  if (outboundMode === "allowlist" && !value("OUTBOUND_EMAIL_ALLOWLIST") && !value("OUTBOUND_PHONE_ALLOWLIST")) {
    errors.push("Allowlist mode requires at least one designated email or phone recipient");
  }

  if (value("TWILIO_ACCOUNT_SID")) requireValue("TWILIO_AUTH_TOKEN", 16);
  if (value("TWILIO_EMAIL_DOMAIN")) requireValue("TWILIO_EMAIL_INBOUND_VERIFY_TOKEN", 32);
  if (value("STRIPE_SECRET_KEY")) requireValue("STRIPE_WEBHOOK_SECRET", 16);
  if (value("SIDEBAND_PUBLIC_WSS_URL") && !value("AI_RECEPTIONIST_SECRET")) {
    warnings.push("AI_RECEPTIONIST_SECRET is unset; the sideband will share the general auth secret");
  }
  if (value("LMS_INTEGRATION_URL")) {
    try {
      if (new URL(value("LMS_INTEGRATION_URL")).protocol !== "https:") {
        errors.push("LMS_INTEGRATION_URL must use HTTPS in deployed environments");
      }
    } catch {
      errors.push("LMS_INTEGRATION_URL must be a valid HTTPS URL");
    }
  }
}

for (const warning of warnings) console.warn(`[security-config] warning: ${warning}`);

if (errors.length) {
  for (const error of errors) console.error(`[security-config] ${error}`);
  process.exit(1);
}

console.log(`[security-config] ${isDeployed ? deployment : "local"} configuration accepted`);
