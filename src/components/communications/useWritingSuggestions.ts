"use client";
import { useEffect, useState } from "react";
import type { WritingIssue } from "@/lib/communications/proofreading";

export function useWritingSuggestions(text: string, enabled: boolean) {
  const [result, setResult] = useState<{ text: string; issues: WritingIssue[] }>({ text: "", issues: [] });
  const [status, setStatus] = useState("");
  useEffect(() => {
    if (!enabled || !text.trim()) { setStatus(""); return; }
    if (text.length > 12000) { setStatus("Writing suggestions support drafts up to 12,000 characters."); return; }
    const controller = new AbortController();
    setStatus("Waiting to check English…");
    const timer = window.setTimeout(async () => {
      setStatus("Checking English…");
      try {
        const res = await fetch("/api/communications/proofread", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }), signal: controller.signal });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Writing suggestions unavailable");
        if (!controller.signal.aborted) { setResult({ text, issues: data.issues }); setStatus(data.issues.length ? `${data.issues.length} writing suggestion${data.issues.length === 1 ? "" : "s"}` : "No English issues found"); }
      } catch (err) { if (!controller.signal.aborted) setStatus(err instanceof Error ? err.message : "Writing suggestions unavailable"); }
    }, 1800);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [text, enabled]);
  return { issues: enabled && result.text === text ? result.issues : [], status, dismiss: (issue: WritingIssue) => setResult((prev) => ({ ...prev, issues: prev.issues.filter((i) => i !== issue) })) };
}
