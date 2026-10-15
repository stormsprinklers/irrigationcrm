import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

type RouteRow = {
  route: string;
  methods: string;
  audience: string;
  authentication: string;
  roles: string;
  tenantEvidence: string;
  rateLimit: string;
  sideEffects: string;
  auditEvidence: string;
  reviewPriority: string;
  source: string;
};

const projectRoot = process.cwd();
const apiRoot = join(projectRoot, "src", "app", "api");
const outputDir = join(projectRoot, "docs", "security");
const csvPath = join(outputDir, "route-security-manifest.csv");
const jsonPath = join(outputDir, "route-security-manifest.json");

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : entry.name === "route.ts" ? [path] : [];
  });
}

function routeFor(path: string) {
  const route = relative(apiRoot, path)
    .split(sep)
    .slice(0, -1)
    .map((segment) => segment.replace(/^\[(?:\.\.\.)?(.+)\]$/, ":$1"))
    .join("/");
  return `/api/${route}`;
}

function methodsFor(source: string) {
  const methods = new Set<string>();
  for (const match of source.matchAll(/export\s+(?:async\s+function|const)\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b/g)) {
    methods.add(match[1]!);
  }
  return [...methods].sort().join("|") || "UNKNOWN";
}

function classify(route: string, source: string): Pick<RouteRow, "audience" | "authentication" | "reviewPriority"> {
  if (route === "/api/auth/:nextauth") return { audience: "auth-framework", authentication: "nextauth", reviewPriority: "high" };
  if (/expenseCardsGoneResponse|deprecatedGa4JsonResponse/.test(source)) {
    return { audience: "public", authentication: "deprecated-no-operation", reviewPriority: "standard" };
  }
  if (route.startsWith("/api/cron/")) return { audience: "scheduler", authentication: "cron-bearer", reviewPriority: "high" };
  if (route === "/api/stripe/webhook" || route === "/api/stripe/issuing-authorization") {
    return { audience: "provider", authentication: "stripe-signature", reviewPriority: "high" };
  }
  if (route.startsWith("/api/twilio/")) return { audience: "provider", authentication: "twilio-signature", reviewPriority: "high" };
  if (route === "/api/sendgrid/events") return { audience: "provider", authentication: "email-signature", reviewPriority: "high" };
  if (route === "/api/sendgrid/inbound") return { audience: "provider", authentication: "inbound-token", reviewPriority: "high" };
  if (route === "/api/meta/webhook") return { audience: "provider", authentication: "meta-signature", reviewPriority: "high" };
  if (route.startsWith("/api/integrations/")) {
    return { audience: "integration", authentication: "integration-key", reviewPriority: "high" };
  }
  if (route.startsWith("/api/ai/receptionist/")) {
    return { audience: "ai-sideband", authentication: "signed-ai-token", reviewPriority: "high" };
  }
  if (route.startsWith("/api/mobile/auth/")) {
    return { audience: "mobile-anonymous", authentication: "credential-or-refresh-flow", reviewPriority: "high" };
  }
  if (/userFromBearerToken/.test(source)) {
    return { audience: "mobile", authentication: "mobile-bearer", reviewPriority: "high" };
  }
  if (route.startsWith("/api/auth/staff/")) {
    return { audience: "staff-anonymous", authentication: "credential-or-recovery-flow", reviewPriority: "high" };
  }
  if (route.startsWith("/api/portal/auth/")) {
    return { audience: "customer-anonymous", authentication: "portal-login-flow", reviewPriority: "high" };
  }
  if (route.startsWith("/api/portal/")) {
    const portalAuth = /requirePortalCustomer|getPortalSession|decodePortalSession/.test(source);
    return {
      audience: portalAuth ? "customer" : "customer-link",
      authentication: portalAuth ? "portal-session" : "public-token-review",
      reviewPriority: "high",
    };
  }
  if (
    route.startsWith("/api/public/") ||
    route.includes("/public/") ||
    route.startsWith("/api/book/") ||
    route.startsWith("/api/refer/") ||
    route.startsWith("/api/track/")
  ) {
    return { audience: "public", authentication: "public-or-capability-token", reviewPriority: "high" };
  }
  if (route.startsWith("/api/marketing/track/")) {
    return { audience: "public", authentication: "signed-expiring-capability", reviewPriority: "high" };
  }
  if (route === "/api/marketing/unsubscribe") {
    return { audience: "public", authentication: "signed-capability-token", reviewPriority: "high" };
  }
  if (route === "/api/meta/media") {
    return { audience: "provider", authentication: "signed-media-url", reviewPriority: "high" };
  }
  if (route === "/api/push/vapid-public-key") {
    return { audience: "public", authentication: "public-configuration", reviewPriority: "standard" };
  }
  if (/callback$/.test(route)) {
    return { audience: "oauth-provider", authentication: "oauth-state", reviewPriority: "high" };
  }
  if (/requireSessionUser|getSessionUser|\bauth\(/.test(source)) {
    return { audience: "staff", authentication: "staff-session-or-mobile-bearer", reviewPriority: "standard" };
  }
  return { audience: "staff", authentication: "middleware-only-review", reviewPriority: "high" };
}

function rolesFor(source: string) {
  const known = ["ADMIN", "MANAGER", "CSR", "TECH", "INSTALLER", "SALES", "SOCIAL_MEDIA_MANAGER"];
  const found = known.filter((role) => new RegExp(`[\"']${role}[\"']`).test(source));
  if (found.length) return found.join("|");
  if (/forbiddenForFieldRole|canManage|requireAdmin|trueRoleOf/.test(source)) return "permission-helper";
  return "not-explicit";
}

function csv(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function buildRows(): RouteRow[] {
  return walk(apiRoot)
    .sort()
    .map((path) => {
      const sourceText = readFileSync(path, "utf8");
      const route = routeFor(path);
      const policy = classify(route, sourceText);
      const methods = methodsFor(sourceText);
      const mutating = /(^|\|)(POST|PUT|PATCH|DELETE)(\||$)/.test(methods);
      return {
        route,
        methods,
        audience: policy.audience,
        authentication: policy.authentication,
        roles: rolesFor(sourceText),
        tenantEvidence: /companyId|company:\s*\{|companyId:/.test(sourceText) ? "present" : "not-local",
        rateLimit: /enforceAuthRateLimit|checkIntegrationRateLimit|rate.?limit/i.test(sourceText) ? "present" : "none-detected",
        sideEffects: mutating || /\.create\(|\.update\(|\.delete\(|\.upsert\(|\.createMany\(|\.updateMany\(|\.deleteMany\(/.test(sourceText)
          ? "yes"
          : "no",
        auditEvidence: /Audit|audit|writeStaffAuditLog|logIntegrationAudit/.test(sourceText) ? "present" : "none-detected",
        reviewPriority: policy.reviewPriority,
        source: relative(projectRoot, path).split(sep).join("/"),
      };
    });
}

const rows = buildRows();
const digest = createHash("sha256").update(JSON.stringify(rows)).digest("hex");
const report = {
  generatedAt: new Date().toISOString(),
  digest,
  totalRoutes: rows.length,
  highPriorityRoutes: rows.filter((row) => row.reviewPriority === "high").length,
  middlewareOnlyRoutes: rows.filter((row) => row.authentication === "middleware-only-review").length,
  mutatingRoutes: rows.filter((row) => row.sideEffects === "yes").length,
  rows,
};

const headers = Object.keys(rows[0] ?? {}) as Array<keyof RouteRow>;
const csvContent = [
  headers.map(csv).join(","),
  ...rows.map((row) => headers.map((key) => csv(String(row[key]))).join(",")),
].join("\n") + "\n";
const jsonContent = JSON.stringify(report, null, 2) + "\n";

const check = process.argv.includes("--check");
if (check) {
  if (!existsSync(csvPath) || !existsSync(jsonPath)) {
    console.error("Security route manifest is missing. Run npm run security:routes.");
    process.exit(1);
  }
  const previous = JSON.parse(readFileSync(jsonPath, "utf8")) as { digest?: string };
  if (previous.digest !== digest || readFileSync(csvPath, "utf8") !== csvContent) {
    console.error("Security route manifest is stale. Run npm run security:routes and review the diff.");
    process.exit(1);
  }
  console.log(`Security route manifest current: ${rows.length} routes (${digest.slice(0, 12)}).`);
} else {
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(csvPath, csvContent);
  writeFileSync(jsonPath, jsonContent);
  console.log(`Wrote security route manifest for ${rows.length} routes.`);
}
