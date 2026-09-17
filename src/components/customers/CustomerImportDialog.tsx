"use client";

import { useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { parseCustomerImportCsv } from "@/lib/customers/import-csv";
import { validCustomerName } from "@/lib/customers/import-matching";
import type { CustomerImportRow, CustomerImportResult } from "@/lib/customers/import-customers";

type Summary = { processed: number; created: number; merged: number; skipped: number; reasons: string[] };
const emptySummary = (): Summary => ({ processed: 0, created: 0, merged: 0, skipped: 0, reasons: [] });

export function CustomerImportDialog({ open, onClose, onImported }: { open: boolean; onClose: () => void; onImported: () => void }) {
  const [rows, setRows] = useState<CustomerImportRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [mode, setMode] = useState<"csv" | "hcp">("csv");
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState<Summary>(emptySummary);
  const [error, setError] = useState("");
  const cancelRef = useRef(false);
  if (!open) return null;

  const addResults = (results: CustomerImportResult[]) => {
    setSummary((previous) => ({
      processed: previous.processed + results.length,
      created: previous.created + results.filter((result) => result.action === "created").length,
      merged: previous.merged + results.filter((result) => result.action === "merged").length,
      skipped: previous.skipped + results.filter((result) => result.action === "skipped").length,
      reasons: [...previous.reasons, ...results.filter((result) => result.reason).map((result) => `${result.name || "Unnamed row"}: ${result.reason}`)].slice(0, 20),
    }));
  };

  async function selectCsv(file: File | null) {
    setError(""); setSummary(emptySummary()); setRows([]); setFileName(file?.name ?? "");
    if (!file) return;
    if (file.size > 5_000_000) { setError("CSV must be smaller than 5 MB. Split large exports into smaller files."); return; }
    try {
      const parsed = parseCustomerImportCsv(await file.text());
      if (!parsed.length) throw new Error("CSV has no customer rows.");
      setRows(parsed);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not read CSV");
    }
  }

  async function runImport() {
    setError(""); setSummary(emptySummary()); setRunning(true); cancelRef.current = false;
    try {
      if (mode === "csv") {
        for (let index = 0; index < rows.length && !cancelRef.current; index += 25) {
          const response: Response = await fetch("/api/customers/import", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ rows: rows.slice(index, index + 25) }),
          });
          const body: { results: CustomerImportResult[]; error?: string } = await response.json();
          if (!response.ok) throw new Error(body.error ?? "CSV import stopped");
          addResults(body.results);
        }
      } else {
        let cursor: string | null = null;
        const seenCursors = new Set<string>();
        do {
          const response: Response = await fetch("/api/customers/import/housecall-pro", {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cursor }),
          });
          const body: { results: CustomerImportResult[]; nextCursor: string | null; error?: string } = await response.json();
          if (!response.ok) throw new Error(body.error ?? "Housecall Pro import stopped");
          addResults(body.results);
          cursor = body.nextCursor;
          if (cursor && seenCursors.has(cursor)) throw new Error("Housecall Pro returned the same page twice. Import stopped to avoid a loop.");
          if (cursor) seenCursors.add(cursor);
        } while (cursor && !cancelRef.current);
      }
      onImported();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Import stopped");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Import customers">
      <div className="max-h-[90vh] w-full max-w-xl space-y-4 overflow-y-auto rounded-lg border bg-background p-6 shadow-lg">
        <div>
          <h2 className="text-lg font-semibold">Import customers</h2>
          <p className="mt-1 text-sm text-muted-foreground">Matches the same name and address or contact details, keeps extra emails and phones, and skips unknown or numeric-only names. Existing records and marketing opt-outs are preserved. Imported people without paid work appear in Contacts.</p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant={mode === "csv" ? "secondary" : "outline"} onClick={() => setMode("csv")} disabled={running}>CSV file</Button>
          <Button type="button" variant={mode === "hcp" ? "secondary" : "outline"} onClick={() => setMode("hcp")} disabled={running}>Housecall Pro</Button>
        </div>
        {mode === "csv" ? <div className="space-y-3 rounded-md border p-4">
          <a href="/templates/customer-import.csv" download className="inline-flex items-center gap-2 text-sm font-medium text-primary underline"><Download className="h-4 w-4" /> Download CSV template</a>
          <p className="text-xs text-muted-foreground">Fill one row per customer. Separate extra phones, emails, or tags with semicolons. “Yes” in an opt-out column prevents marketing to that channel.</p>
          <input type="file" accept=".csv,text/csv" onChange={(event) => void selectCsv(event.target.files?.[0] ?? null)} disabled={running} className="block w-full text-sm" />
          {rows.length ? <p className="text-sm">{fileName}: {rows.length} rows, {rows.filter((row) => !validCustomerName(row.name)).length} invalid names to skip.</p> : null}
        </div> : <div className="rounded-md border p-4 text-sm text-muted-foreground">Imports customers and contact details only. Jobs, visits, estimates, and invoices are not imported.</div>}
        {summary.processed > 0 ? <div className="rounded-md border p-3 text-sm" aria-live="polite">
          <strong>{summary.processed} processed</strong> · {summary.created} created · {summary.merged} matched · {summary.skipped} skipped
          {summary.reasons.length ? <ul className="mt-2 max-h-28 list-disc overflow-y-auto pl-5 text-xs text-muted-foreground">{summary.reasons.map((reason, index) => <li key={`${index}-${reason}`}>{reason}</li>)}</ul> : null}
        </div> : null}
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => { if (running) cancelRef.current = true; else onClose(); }}>{running ? "Stop after this batch" : "Close"}</Button>
          <Button type="button" onClick={() => void runImport()} disabled={running || (mode === "csv" && !rows.length)}><Upload className="h-4 w-4" /> {running ? "Importing…" : "Start import"}</Button>
        </div>
      </div>
    </div>
  );
}
