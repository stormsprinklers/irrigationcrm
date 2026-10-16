import { readFileSync } from "node:fs";

type AuditFinding = {
  source?: number | string;
  severity?: string;
  title?: string;
};

type AuditReport = {
  error?: unknown;
  vulnerabilities?: Record<string, { via?: Array<string | AuditFinding> }>;
};

// Findings present when the gate was introduced. These remain visible in the
// uploaded audit report, while any new high/critical advisory fails the build.
const knownHighOrCriticalAdvisories = new Set([
  "1121245", "1124066", "1124172", "1124185", "1124193", "1124252",
  "1138811", "1139357", "1139361", "1139363", "1139427", "1139510",
  "1139571", "1139572", "1153178", "1193677", "1193725", "1193733",
  "1240042", "1240603", "1240604", "1240605", "1240607", "1240608",
  "1240628", "1240634", "1241209", "1241331",
]);

const reportPath = process.argv[2];
if (!reportPath) throw new Error("Usage: check-npm-audit-baseline <audit.json>");

const report = JSON.parse(readFileSync(reportPath, "utf8")) as AuditReport;
if (report.error || !report.vulnerabilities) {
  throw new Error("npm audit did not return a valid vulnerability report");
}

const current = new Map<string, AuditFinding>();
for (const vulnerability of Object.values(report.vulnerabilities)) {
  for (const via of vulnerability.via ?? []) {
    if (typeof via === "string") continue;
    if (via.severity !== "high" && via.severity !== "critical") continue;
    if (via.source === undefined) continue;
    current.set(String(via.source), via);
  }
}

const unknown = [...current.entries()].filter(
  ([source]) => !knownHighOrCriticalAdvisories.has(source)
);

console.log(
  `npm audit baseline: ${current.size} known high/critical advisories; ${unknown.length} new.`
);
for (const [source, finding] of unknown) {
  console.error(`[new ${finding.severity}] ${source}: ${finding.title ?? "Untitled advisory"}`);
}

if (unknown.length) process.exit(1);
