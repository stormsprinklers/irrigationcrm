import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const dir = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(dir, "crm-pre-launch-test-plan.html");
const pdfPath = path.join(dir, "crm-pre-launch-test-plan.pdf");

if (!existsSync(htmlPath)) {
  console.error("Run generate-crm-test-plan.mjs first.");
  process.exit(1);
}

const browsers = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];

const browser = browsers.find(existsSync);
if (!browser) {
  console.error("Chrome or Edge not found. Open crm-pre-launch-test-plan.html and print to PDF.");
  process.exit(1);
}

const fileUrl = `file:///${htmlPath.replace(/\\/g, "/")}`;
execFileSync(browser, [
  "--headless",
  "--disable-gpu",
  "--no-pdf-header-footer",
  `--print-to-pdf=${pdfPath}`,
  fileUrl,
]);

console.log("Wrote", pdfPath);
