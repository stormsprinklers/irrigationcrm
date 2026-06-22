"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Loader2, Monitor, Smartphone, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { htmlToPlainText } from "@/lib/marketing/link-tracking";

type Props = {
  subject: string;
  bodyHtml: string;
  aiPrompt: string;
  onSubjectChange: (subject: string) => void;
  onBodyChange: (html: string, text: string) => void;
  onAiPromptChange: (prompt: string) => void;
};

function EmailCampaignEditorInner({
  subject,
  bodyHtml,
  aiPrompt,
  onSubjectChange,
  onBodyChange,
  onAiPromptChange,
}: Props) {
  const editorRef = useRef<HTMLDivElement>(null);
  const grapesRef = useRef<{ getHtml: () => string; setComponents: (html: string) => void; destroy: () => void; AssetManager: { add: (asset: { src: string }) => void } } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [mobilePreview, setMobilePreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState(bodyHtml);

  const syncFromEditor = useCallback(() => {
    const editor = grapesRef.current;
    if (!editor) return;
    const html = editor.getHtml();
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
        height: "520px",
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
      });

      grapesRef.current = editor as typeof grapesRef.current;

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
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Image upload failed");
        }
      });
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
    if (editor.getHtml() !== bodyHtml) {
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
    <div className="grid gap-4 lg:grid-cols-[280px_1fr_320px]">
      <div className="space-y-3 rounded-lg border bg-white p-4">
        <h3 className="text-sm font-semibold">AI assistant</h3>
        <textarea
          className="min-h-[140px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
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
      </div>

      <div className="rounded-lg border bg-white p-2">
        <div ref={editorRef} />
      </div>

      <div className="space-y-3 rounded-lg border bg-white p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Preview</h3>
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
        <div className="overflow-hidden rounded border bg-slate-50">
          <iframe
            title="Email preview"
            className="h-[480px] w-full bg-white"
            style={{ maxWidth: mobilePreview ? 375 : "100%", margin: mobilePreview ? "0 auto" : undefined, display: "block" }}
            srcDoc={previewHtml}
          />
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
