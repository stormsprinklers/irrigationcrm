"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  Loader2,
  Maximize2,
  Minimize2,
  Monitor,
  Plus,
  Smartphone,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCompanyBrand } from "@/components/layout/CompanyBrandProvider";
import { stormBrand } from "@/lib/branding";
import { htmlToPlainText } from "@/lib/marketing/link-tracking";
import { cn } from "@/lib/utils";

type Props = {
  subject: string;
  bodyHtml: string;
  aiPrompt: string;
  onSubjectChange: (subject: string) => void;
  onBodyChange: (html: string, text: string) => void;
  onAiPromptChange: (prompt: string) => void;
  /** When true, start in expanded/fullscreen layout. */
  defaultExpanded?: boolean;
};

type PaletteState = {
  primary: string;
  secondary: string;
  extras: string[];
};

function normalizeHex(value: string, fallback: string) {
  const raw = value.trim();
  if (!raw) return fallback;
  const withHash = raw.startsWith("#") ? raw : `#${raw}`;
  if (!/^#[0-9a-fA-F]{6}$/i.test(withHash)) return fallback;
  return withHash.toUpperCase();
}

function wrapPreviewShell(html: string): string {
  if (!html.trim()) {
    return `<div style="padding:24px;color:#6b7280;font-family:Arial,sans-serif">Paste your email HTML to preview it here…</div>`;
  }
  if (/<html[\s>]/i.test(html) || /<body[\s>]/i.test(html)) return html;
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#111827;max-width:640px;margin:0 auto;padding:16px">${html}</div>`;
}

function EmailCampaignEditorInner({
  subject,
  bodyHtml,
  aiPrompt,
  onSubjectChange,
  onBodyChange,
  onAiPromptChange,
  defaultExpanded = true,
}: Props) {
  const { brand } = useCompanyBrand();
  const defaultPalette = useMemo<PaletteState>(
    () => ({
      primary: normalizeHex(brand.primaryColor, stormBrand.sky),
      secondary: normalizeHex(brand.secondaryColor, stormBrand.navy),
      extras: [stormBrand.coral, stormBrand.ice, "#FFFFFF"].map((c) =>
        normalizeHex(c, "#FFFFFF")
      ),
    }),
    [brand.primaryColor, brand.secondaryColor]
  );

  const [generating, setGenerating] = useState(false);
  const [mobilePreview, setMobilePreview] = useState(false);
  const [htmlDraft, setHtmlDraft] = useState(bodyHtml);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [palette, setPalette] = useState<PaletteState>(defaultPalette);
  const [paletteSeeded, setPaletteSeeded] = useState(false);

  useEffect(() => {
    setHtmlDraft(bodyHtml);
  }, [bodyHtml]);

  useEffect(() => {
    if (paletteSeeded) return;
    if (!brand.companyId && brand.primaryColor === stormBrand.sky) return;
    setPalette(defaultPalette);
    setPaletteSeeded(true);
  }, [brand.companyId, brand.primaryColor, defaultPalette, paletteSeeded]);

  function applyHtml(next: string) {
    setHtmlDraft(next);
    onBodyChange(next, htmlToPlainText(next));
  }

  async function runAi() {
    if (!aiPrompt.trim()) {
      toast.error("Enter a prompt first");
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch("/api/marketing/campaigns/generate-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: aiPrompt,
          subject,
          existingHtml: htmlDraft.trim() || undefined,
          brandPalette: {
            primary: palette.primary,
            secondary: palette.secondary,
            extras: palette.extras,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "AI request failed");
      onSubjectChange(data.subject ?? subject);
      applyHtml(data.bodyHtml ?? "");
      toast.success(htmlDraft.trim() ? "HTML updated" : "Email generated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "AI request failed");
    } finally {
      setGenerating(false);
    }
  }

  const hasExistingHtml = Boolean(htmlDraft.trim());

  return (
    <div
      className={cn(
        "space-y-4",
        expanded && "fixed inset-0 z-50 overflow-y-auto bg-background p-4 sm:p-6"
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Email HTML</h3>
          <p className="text-xs text-muted-foreground">
            Paste your email HTML on the left. Preview updates live. Use AI to generate a new
            email or edit the HTML you already have.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => setExpanded((v) => !v)}>
          {expanded ? (
            <>
              <Minimize2 className="mr-1.5 h-3.5 w-3.5" />
              Exit fullscreen
            </>
          ) : (
            <>
              <Maximize2 className="mr-1.5 h-3.5 w-3.5" />
              Expand editor
            </>
          )}
        </Button>
      </div>

      <div
        className={cn(
          "grid gap-4",
          expanded ? "lg:grid-cols-[260px_1fr_360px]" : "lg:grid-cols-[240px_1fr_300px]"
        )}
      >
        <div className="space-y-3 rounded-lg border bg-white p-4">
          <h3 className="text-sm font-semibold">AI assistant</h3>
          <textarea
            className="min-h-[120px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
            value={aiPrompt}
            onChange={(e) => onAiPromptChange(e.target.value)}
            placeholder={
              hasExistingHtml
                ? "Describe edits: make the CTA use primary, shorten the intro…"
                : "Describe your campaign: offer, tone, CTA…"
            }
          />
          <Button type="button" className="w-full" onClick={runAi} disabled={generating}>
            {generating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Working…
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                {hasExistingHtml ? "Edit with AI" : "Generate email"}
              </>
            )}
          </Button>
          <div>
            <label className="text-xs text-muted-foreground">Subject</label>
            <Input className="mt-1" value={subject} onChange={(e) => onSubjectChange(e.target.value)} />
          </div>

          <div className="rounded-md border bg-muted/40 p-2 text-xs text-muted-foreground">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium text-foreground">Brand palette</p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => {
                  setPalette(defaultPalette);
                  toast.success("Palette reset to company branding");
                }}
              >
                Reset
              </Button>
            </div>
            <p className="mt-1">
              Edit colors for AI generate/edit. Click a swatch to copy hex into your HTML.
            </p>

            <PaletteRow
              label="Primary"
              value={palette.primary}
              onChange={(hex) => setPalette((p) => ({ ...p, primary: hex }))}
            />
            <PaletteRow
              label="Secondary"
              value={palette.secondary}
              onChange={(hex) => setPalette((p) => ({ ...p, secondary: hex }))}
            />

            {palette.extras.map((extra, idx) => (
              <PaletteRow
                key={`extra-${idx}`}
                label={`Extra ${idx + 1}`}
                value={extra}
                onChange={(hex) =>
                  setPalette((p) => ({
                    ...p,
                    extras: p.extras.map((c, i) => (i === idx ? hex : c)),
                  }))
                }
                onRemove={() =>
                  setPalette((p) => ({
                    ...p,
                    extras: p.extras.filter((_, i) => i !== idx),
                  }))
                }
              />
            ))}

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2 w-full"
              onClick={() =>
                setPalette((p) => ({
                  ...p,
                  extras: [...p.extras, "#CCCCCC"],
                }))
              }
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add color
            </Button>
          </div>
        </div>

        <div className="flex min-h-[520px] flex-col rounded-lg border bg-white">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <h3 className="text-sm font-semibold">HTML source</h3>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!htmlDraft}
              onClick={() => applyHtml("")}
            >
              Clear
            </Button>
          </div>
          <textarea
            className="min-h-[480px] flex-1 resize-y rounded-b-lg bg-slate-950 px-3 py-3 font-mono text-xs leading-relaxed text-slate-100 outline-none"
            value={htmlDraft}
            onChange={(e) => applyHtml(e.target.value)}
            spellCheck={false}
            placeholder="Paste a full email HTML document here…"
          />
        </div>

        <div className="space-y-3 rounded-lg border bg-white p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Live preview</h3>
            <div className="flex gap-1">
              <Button
                type="button"
                size="icon"
                variant={mobilePreview ? "ghost" : "secondary"}
                onClick={() => setMobilePreview(false)}
              >
                <Monitor className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant={mobilePreview ? "secondary" : "ghost"}
                onClick={() => setMobilePreview(true)}
              >
                <Smartphone className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Shows the HTML that will be sent (desktop / mobile width).
          </p>
          <div className="overflow-hidden rounded border bg-slate-50">
            <iframe
              title="Email preview"
              className="h-[min(70vh,640px)] w-full bg-white"
              style={{
                maxWidth: mobilePreview ? 375 : "100%",
                margin: mobilePreview ? "0 auto" : undefined,
                display: "block",
              }}
              srcDoc={wrapPreviewShell(htmlDraft)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function PaletteRow({
  label,
  value,
  onChange,
  onRemove,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
  onRemove?: () => void;
}) {
  const hex = normalizeHex(value, "#000000");
  return (
    <div className="mt-2 flex items-center gap-2">
      <button
        type="button"
        title={`Copy ${hex}`}
        className="h-7 w-7 shrink-0 rounded border border-border"
        style={{ backgroundColor: hex }}
        onClick={() => {
          void navigator.clipboard?.writeText(hex);
          toast.success(`Copied ${hex}`);
        }}
      />
      <input
        type="color"
        aria-label={`${label} color picker`}
        className="h-7 w-8 cursor-pointer rounded border border-border bg-transparent p-0"
        value={hex}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
      />
      <Input
        className="h-7 flex-1 font-mono text-xs"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => onChange(normalizeHex(value, hex))}
        aria-label={`${label} hex`}
      />
      {onRemove ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={onRemove}
          aria-label={`Remove ${label}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      ) : (
        <span className="w-7 shrink-0 text-[10px] font-medium uppercase text-muted-foreground">
          {label === "Primary" ? "Pri" : label === "Secondary" ? "Sec" : ""}
        </span>
      )}
    </div>
  );
}

export const EmailCampaignEditor = dynamic(
  () => Promise.resolve({ default: EmailCampaignEditorInner }),
  {
    ssr: false,
    loading: () => <p className="text-sm text-muted-foreground">Loading editor...</p>,
  }
);
