"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  ImagePlus,
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
import {
  MediaLibraryPicker,
  type MediaLibraryItem,
} from "@/components/media/MediaLibraryPicker";
import { EditableEmailPreview } from "@/components/marketing/EditableEmailPreview";
import { useCompanyBrand } from "@/components/layout/CompanyBrandProvider";
import { absolutePublicBlobUrl } from "@/lib/blob/urls";
import { stormBrand } from "@/lib/branding";
import {
  EMAIL_TEMPLATES,
  renderEmailTemplatePreview,
  type EmailTemplateId,
} from "@/lib/marketing/email-templates";
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
  soft: string;
  panel: string;
  accent: string | null;
  extras: string[];
};

type CompanyContact = {
  phone: string | null;
  supportEmail: string | null;
  website: string | null;
  emailLogoUrl: string | null;
};

function normalizeHex(value: string, fallback: string) {
  const raw = value.trim();
  if (!raw) return fallback;
  const withHash = raw.startsWith("#") ? raw : `#${raw}`;
  if (!/^#[0-9a-fA-F]{6}$/i.test(withHash)) return fallback;
  return withHash.toUpperCase();
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
  const defaultPalette = useMemo<PaletteState>(() => {
    const p = brand.palette;
    return {
      primary: normalizeHex(p.primary, stormBrand.sky),
      secondary: normalizeHex(p.secondary, stormBrand.navy),
      soft: normalizeHex(p.soft, stormBrand.ice),
      panel: normalizeHex(p.panel, "#E8F4FA"),
      accent: p.accent ? normalizeHex(p.accent, stormBrand.coral) : null,
      extras: p.extras.map((c) => normalizeHex(c, "#FFFFFF")),
    };
  }, [brand.palette]);

  const [generating, setGenerating] = useState(false);
  const [mobilePreview, setMobilePreview] = useState(false);
  const [htmlDraft, setHtmlDraft] = useState(bodyHtml);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [palette, setPalette] = useState<PaletteState>(defaultPalette);
  const [paletteSeeded, setPaletteSeeded] = useState(false);
  const [templateId, setTemplateId] = useState<EmailTemplateId>("announcement");
  const [selectedImages, setSelectedImages] = useState<MediaLibraryItem[]>([]);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [companyContact, setCompanyContact] = useState<CompanyContact>({
    phone: null,
    supportEmail: null,
    website: null,
    emailLogoUrl: null,
  });
  const [templateSeeded, setTemplateSeeded] = useState(false);

  useEffect(() => {
    setHtmlDraft(bodyHtml);
  }, [bodyHtml]);

  useEffect(() => {
    if (paletteSeeded) return;
    if (!brand.companyId && brand.primaryColor === stormBrand.sky) return;
    setPalette(defaultPalette);
    setPaletteSeeded(true);
  }, [brand.companyId, brand.primaryColor, defaultPalette, paletteSeeded]);

  useEffect(() => {
    fetch("/api/settings/company/branding")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        setCompanyContact({
          phone: data.phone ?? null,
          supportEmail: data.supportEmail ?? null,
          website: data.website ?? null,
          emailLogoUrl: data.emailLogoUrl ?? null,
        });
      })
      .catch(() => {});
  }, []);

  function applyHtml(next: string) {
    setHtmlDraft(next);
    onBodyChange(next, htmlToPlainText(next));
  }

  const applyTemplate = useCallback(
    (id: EmailTemplateId, nextPalette?: PaletteState) => {
      const p = nextPalette ?? palette;
      const logoUrl =
        absolutePublicBlobUrl(companyContact.emailLogoUrl) ||
        brand.logoUrl ||
        null;
      const html = renderEmailTemplatePreview({
        templateId: id,
        company: {
          companyName: brand.companyName,
          logoUrl,
          phone: companyContact.phone,
          email: companyContact.supportEmail,
          website: companyContact.website,
        },
        palette: {
          primary: p.primary,
          secondary: p.secondary,
          soft: p.soft,
          panel: p.panel,
          accent: p.accent,
          extras: p.extras,
        },
        heroImageUrl: selectedImages[0]?.publicUrl ?? null,
      });
      setTemplateId(id);
      applyHtml(html);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- applyHtml is stable enough via setState
    [brand.companyName, brand.logoUrl, companyContact, palette, selectedImages]
  );

  // Seed announcement template into an empty editor once branding/contact is ready.
  useEffect(() => {
    if (templateSeeded) return;
    if (bodyHtml.trim()) {
      setTemplateSeeded(true);
      return;
    }
    if (!brand.companyId && brand.companyName === "Company") return;
    applyTemplate("announcement");
    setTemplateSeeded(true);
  }, [applyTemplate, bodyHtml, brand.companyId, brand.companyName, templateSeeded]);

  function insertImageIntoHtml(url: string, alt: string) {
    const img = `<img src="${url}" alt="${alt.replace(/"/g, "&quot;")}" width="600" style="width:100%;max-width:600px;height:auto;display:block;margin:16px auto;" />`;
    if (!htmlDraft.trim()) {
      applyHtml(img);
      return;
    }
    if (/<\/body>/i.test(htmlDraft)) {
      applyHtml(htmlDraft.replace(/<\/body>/i, `${img}</body>`));
      return;
    }
    applyHtml(`${htmlDraft}\n${img}`);
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
            soft: palette.soft,
            panel: palette.panel,
            accent: palette.accent,
            extras: palette.extras,
          },
          templateId,
          imageUrls: selectedImages.map((img) => img.publicUrl),
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
          <h3 className="text-sm font-semibold">Email builder</h3>
          <p className="text-xs text-muted-foreground">
            Pick a template, add photos, then let AI write the copy. CTA links come from{" "}
            <Link href="/settings/campaign-links" className="underline">
              Campaign links
            </Link>
            .
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
          expanded ? "lg:grid-cols-[280px_minmax(0,1fr)]" : "lg:grid-cols-[260px_minmax(0,1fr)]"
        )}
      >
        <div className="space-y-3 rounded-lg border bg-white p-4 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto">
          <h3 className="text-sm font-semibold">AI assistant</h3>

          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Template</p>
            <div className="space-y-2">
              {EMAIL_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => applyTemplate(tpl.id)}
                  className={cn(
                    "w-full rounded-md border px-3 py-2 text-left text-sm transition",
                    templateId === tpl.id
                      ? "border-storm-sky bg-sky-50"
                      : "hover:border-slate-300"
                  )}
                >
                  <span className="font-medium">{tpl.name}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {tpl.description}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-muted-foreground">Photos</p>
              <Button type="button" variant="outline" size="sm" onClick={() => setMediaOpen(true)}>
                <ImagePlus className="mr-1.5 h-3.5 w-3.5" />
                Library
              </Button>
            </div>
            {selectedImages.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Optional — AI can place selected library photos in the layout.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {selectedImages.map((img) => (
                  <div key={img.id} className="relative h-14 w-14 overflow-hidden rounded border">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.previewUrl} alt="" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      className="absolute right-0 top-0 bg-black/60 p-0.5 text-white"
                      onClick={() =>
                        setSelectedImages((prev) => prev.filter((x) => x.id !== img.id))
                      }
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <textarea
            className="min-h-[120px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
            value={aiPrompt}
            onChange={(e) => onAiPromptChange(e.target.value)}
            placeholder={
              hasExistingHtml
                ? "Describe edits: make the CTA use primary, shorten the intro…"
                : "Describe your campaign: offer, tone, what the CTA should say…"
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
                  {hasExistingHtml ? "Fill / edit with AI" : "Generate email"}
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
            <PaletteRow
              label="Soft"
              value={palette.soft}
              onChange={(hex) => setPalette((p) => ({ ...p, soft: hex }))}
            />
            <PaletteRow
              label="Panel"
              value={palette.panel}
              onChange={(hex) => setPalette((p) => ({ ...p, panel: hex }))}
            />
            {palette.accent ? (
              <PaletteRow
                label="Accent"
                value={palette.accent}
                onChange={(hex) => setPalette((p) => ({ ...p, accent: hex }))}
                onRemove={() => setPalette((p) => ({ ...p, accent: null }))}
              />
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2 w-full"
                onClick={() => setPalette((p) => ({ ...p, accent: stormBrand.coral }))}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add accent
              </Button>
            )}

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

        <div className="flex min-h-0 flex-col gap-4">
          <div className="flex min-h-[min(70vh,720px)] flex-1 flex-col overflow-hidden rounded-lg border bg-white">
            <div className="flex items-center justify-between border-b px-3 py-2">
              <div>
                <h3 className="text-sm font-semibold">Live preview</h3>
                <p className="text-xs text-muted-foreground">
                  {mobilePreview ? "Mobile · 375px wide" : "Desktop · up to 640px wide"}
                </p>
              </div>
              <div className="flex gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant={mobilePreview ? "ghost" : "secondary"}
                  onClick={() => setMobilePreview(false)}
                >
                  <Monitor className="mr-1.5 h-4 w-4" />
                  Desktop
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={mobilePreview ? "secondary" : "ghost"}
                  onClick={() => setMobilePreview(true)}
                >
                  <Smartphone className="mr-1.5 h-4 w-4" />
                  Mobile
                </Button>
              </div>
            </div>
            <EditableEmailPreview
              html={htmlDraft}
              mobilePreview={mobilePreview}
              onHtmlChange={applyHtml}
            />
          </div>

          <div className="flex flex-col rounded-lg border bg-white">
            <div className="flex items-center justify-between border-b px-3 py-2">
              <h3 className="text-sm font-semibold">HTML source</h3>
              <div className="flex gap-1">
                <Button type="button" variant="ghost" size="sm" onClick={() => setMediaOpen(true)}>
                  Insert image
                </Button>
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
            </div>
            <textarea
              className="min-h-[160px] max-h-[240px] resize-y bg-slate-950 px-3 py-3 font-mono text-xs leading-relaxed text-slate-100 outline-none"
              value={htmlDraft}
              onChange={(e) => applyHtml(e.target.value)}
              spellCheck={false}
              placeholder="Paste a full email HTML document here…"
            />
          </div>
        </div>
      </div>

      <MediaLibraryPicker
        open={mediaOpen}
        onOpenChange={setMediaOpen}
        onSelect={(asset) => {
          setSelectedImages((prev) =>
            prev.some((p) => p.id === asset.id) ? prev : [...prev, asset].slice(0, 4)
          );
          if (hasExistingHtml) {
            insertImageIntoHtml(asset.publicUrl, asset.alt ?? asset.fileName);
          }
        }}
      />
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
          {label.slice(0, 3)}
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
