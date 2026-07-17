"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Loader2, Maximize2, Minimize2, Monitor, Smartphone, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

type GrapesEditor = {
  getHtml: () => string;
  getCss: () => string;
  setComponents: (html: string) => void;
  destroy: () => void;
  runCommand: (cmd: string) => unknown;
  on: (event: string, cb: () => void) => void;
  AssetManager: { add: (asset: { src: string }) => void };
};

function exportInlinedHtml(editor: GrapesEditor): string {
  try {
    const inlined = editor.runCommand("gjs-get-inlined-html");
    if (typeof inlined === "string" && inlined.trim()) return inlined;
  } catch {
    // fall through
  }
  const html = editor.getHtml();
  const css = editor.getCss()?.trim();
  if (!css) return html;
  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `<style>${css}</style></head>`);
  }
  return `<div>${html}<style>${css}</style></div>`;
}

function wrapPreviewShell(html: string): string {
  if (!html.trim()) {
    return `<div style="padding:24px;color:#6b7280;font-family:Arial,sans-serif">Start designing your email…</div>`;
  }
  if (html.includes("<html") || html.includes("<body")) return html;
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
  const editorRef = useRef<HTMLDivElement>(null);
  const grapesRef = useRef<GrapesEditor | null>(null);
  const [generating, setGenerating] = useState(false);
  const [mobilePreview, setMobilePreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState(bodyHtml);
  const [expanded, setExpanded] = useState(defaultExpanded);

  const syncFromEditor = useCallback(() => {
    const editor = grapesRef.current;
    if (!editor) return;
    const html = exportInlinedHtml(editor);
    setPreviewHtml(html);
    onBodyChange(html, htmlToPlainText(html));
  }, [onBodyChange]);

  useEffect(() => {
    let destroyed = false;

    async function init() {
      const grapesjs = (await import("grapesjs")).default;
      const preset = (await import("grapesjs-preset-newsletter")).default;

      if (!editorRef.current || destroyed) return;

      const editor = grapesjs.init({
        container: editorRef.current,
        height: expanded ? "70vh" : "560px",
        width: "auto",
        storageManager: false,
        fromElement: false,
        plugins: [preset],
        pluginsOpts: {
          "grapesjs-preset-newsletter": {
            modalTitleImport: "Import template",
          },
        },
        assetManager: {
          upload: false,
          autoAdd: true,
        },
        colorPicker: {
          appendTo: "parent",
          offset: { top: 26, left: -166 },
        },
        // Brand palette available via style manager color inputs
        canvas: {
          styles: [],
        },
      }) as unknown as GrapesEditor & {
        StyleManager?: { getProperties?: () => unknown };
        getConfig?: () => { styleManager?: unknown };
      };

      // Inject Storm brand colors into the editor color picker swatches when supported.
      try {
        const style = document.createElement("style");
        style.setAttribute("data-storm-brand-colors", "1");
        style.textContent = `
          .gjs-clm-color-picker, .sp-container { --storm-navy: ${stormBrand.navy}; }
        `;
        document.head.appendChild(style);
        const picker = (editor as unknown as { ColorPicker?: { set?: (c: string) => void } }).ColorPicker;
        void picker;
        // Add swatches via grapesjs config if present
        const config = (editor as unknown as { getConfig: () => { colorPicker?: { palette?: string[][] } } }).getConfig?.();
        if (config?.colorPicker) {
          config.colorPicker.palette = [
            [stormBrand.navy, stormBrand.sky, stormBrand.coral, stormBrand.ice, "#FFFFFF", "#111827"],
          ];
        }
      } catch {
        // non-fatal
      }

      grapesRef.current = editor;

      if (bodyHtml) {
        editor.setComponents(bodyHtml);
        setPreviewHtml(bodyHtml);
      }

      editor.on("update", () => syncFromEditor());
      editor.on("asset:add", () => syncFromEditor());

      const container = editorRef.current;
      container.addEventListener("dragover", (e) => e.preventDefault());
      container.addEventListener("drop", async (e) => {
        const file = e.dataTransfer?.files?.[0];
        if (!file || !file.type.startsWith("image/")) return;
        e.preventDefault();
        const formData = new FormData();
        formData.append("file", file);
        try {
          const res = await fetch("/api/marketing/assets/upload", {
            method: "POST",
            body: formData,
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? "Upload failed");
          editor.AssetManager.add({ src: data.url });
          syncFromEditor();
          toast.success("Image added — drag it onto the canvas");
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Image upload failed");
        }
      });

      // Initial sync so preview matches canvas
      syncFromEditor();
    }

    init();

    return () => {
      destroyed = true;
      grapesRef.current?.destroy();
      grapesRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const editor = grapesRef.current;
    if (!editor || !bodyHtml) return;
    const current = exportInlinedHtml(editor);
    if (current !== bodyHtml && !bodyHtml.includes(current.slice(0, 40))) {
      editor.setComponents(bodyHtml);
      setPreviewHtml(bodyHtml);
    }
  }, [bodyHtml]);

  async function generateEmail() {
    if (!aiPrompt.trim()) {
      toast.error("Enter a prompt first");
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch("/api/marketing/campaigns/generate-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: aiPrompt, subject }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Generation failed");
      onSubjectChange(data.subject ?? subject);
      grapesRef.current?.setComponents(data.bodyHtml ?? "");
      setPreviewHtml(data.bodyHtml ?? "");
      onBodyChange(data.bodyHtml ?? "", data.bodyText ?? htmlToPlainText(data.bodyHtml ?? ""));
      toast.success("Email generated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div
      className={cn(
        "space-y-4",
        expanded && "fixed inset-0 z-50 overflow-y-auto bg-background p-4 sm:p-6"
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Email designer</h3>
          <p className="text-xs text-muted-foreground">
            Drag blocks from the left panel. Brand colors: navy {stormBrand.navy}, sky{" "}
            {stormBrand.sky}, coral {stormBrand.coral}. Drop images onto the canvas.
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
          expanded ? "lg:grid-cols-[240px_1fr_360px]" : "lg:grid-cols-[220px_1fr_300px]"
        )}
      >
        <div className="space-y-3 rounded-lg border bg-white p-4">
          <h3 className="text-sm font-semibold">AI assistant</h3>
          <textarea
            className="min-h-[120px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
            value={aiPrompt}
            onChange={(e) => onAiPromptChange(e.target.value)}
            placeholder="Describe your campaign: offer, tone, CTA..."
          />
          <Button type="button" className="w-full" onClick={generateEmail} disabled={generating}>
            {generating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Generate email
              </>
            )}
          </Button>
          <div>
            <label className="text-xs text-muted-foreground">Subject</label>
            <Input className="mt-1" value={subject} onChange={(e) => onSubjectChange(e.target.value)} />
          </div>
          <div className="rounded-md border bg-muted/40 p-2 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Brand palette</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[stormBrand.navy, stormBrand.sky, stormBrand.coral, stormBrand.ice, "#FFFFFF"].map(
                (c) => (
                  <button
                    key={c}
                    type="button"
                    title={c}
                    className="h-6 w-6 rounded border border-border"
                    style={{ backgroundColor: c }}
                    onClick={() => {
                      void navigator.clipboard?.writeText(c);
                      toast.success(`Copied ${c}`);
                    }}
                  />
                )
              )}
            </div>
            <p className="mt-1">Click to copy hex into the color picker.</p>
          </div>
        </div>

        <div className="min-h-[520px] rounded-lg border bg-white p-1">
          <div ref={editorRef} />
        </div>

        <div className="space-y-3 rounded-lg border bg-white p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Send preview</h3>
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
            Matches the HTML that will be sent (styles inlined).
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
              srcDoc={wrapPreviewShell(previewHtml)}
            />
          </div>
        </div>
      </div>
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
