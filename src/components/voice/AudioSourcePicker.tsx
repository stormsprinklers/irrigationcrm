"use client";

import { useRef, useState } from "react";
import { Mic, Type, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { blobProxyUrl } from "@/lib/blob/urls";

export type VoiceClip = { id: string; name: string; blobUrl: string; mimeType: string };
export type AudioValue = { clipId?: string; text?: string };

type Props = {
  label?: string;
  value: AudioValue;
  onChange: (value: AudioValue) => void;
  clips: VoiceClip[];
  /** Called with the refreshed clip library after an inline upload. */
  onClipsChange: (clips: VoiceClip[]) => void;
  textPlaceholder?: string;
};

const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

export function AudioSourcePicker({
  label,
  value,
  onChange,
  clips,
  onClipsChange,
  textPlaceholder = "What the caller hears (text-to-speech)",
}: Props) {
  const [mode, setMode] = useState<"clip" | "text">(value.clipId ? "clip" : "text");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const selectedClip = clips.find((c) => c.id === value.clipId);

  async function uploadClip(file: File) {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const uploadRes = await fetch("/api/upload/voice-clip", {
        method: "POST",
        body: formData,
      });
      if (!uploadRes.ok) {
        const data = await uploadRes.json().catch(() => null);
        throw new Error(data?.error ?? "Upload failed");
      }
      const { url, mimeType } = await uploadRes.json();

      const createRes = await fetch("/api/settings/voice/clips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: file.name.replace(/\.[^.]+$/, "") || "New clip",
          blobUrl: url,
          mimeType,
        }),
      });
      if (!createRes.ok) throw new Error("Failed to save clip");
      const created = (await createRes.json()) as VoiceClip;

      const refreshed = await fetch("/api/settings/voice/clips").then((r) => r.json());
      onClipsChange(Array.isArray(refreshed) ? refreshed : [...clips, created]);
      onChange({ clipId: created.id });
      toast.success("Clip uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      {label ? <label className="block text-sm font-medium">{label}</label> : null}

      <div className="inline-flex rounded-md border border-border p-0.5">
        <button
          type="button"
          onClick={() => {
            setMode("text");
            onChange({ text: value.text });
          }}
          className={cn(
            "inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition-colors",
            mode === "text" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
          )}
        >
          <Type className="h-3.5 w-3.5" />
          Text-to-speech
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("clip");
            onChange({ clipId: value.clipId });
          }}
          className={cn(
            "inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition-colors",
            mode === "clip" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
          )}
        >
          <Mic className="h-3.5 w-3.5" />
          Audio clip
        </button>
      </div>

      {mode === "text" ? (
        <textarea
          value={value.text ?? ""}
          onChange={(e) => onChange({ text: e.target.value })}
          placeholder={textPlaceholder}
          rows={2}
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      ) : (
        <div className="space-y-2">
          <select
            className={selectClass}
            value={value.clipId ?? ""}
            onChange={(e) => onChange({ clipId: e.target.value || undefined })}
          >
            <option value="">Select an audio clip…</option>
            {clips.map((clip) => (
              <option key={clip.id} value={clip.id}>
                {clip.name}
              </option>
            ))}
          </select>

          {selectedClip ? (
            <audio
              controls
              src={blobProxyUrl(selectedClip.blobUrl) ?? undefined}
              className="h-8 w-full max-w-sm"
            />
          ) : null}

          <div>
            <input
              ref={fileRef}
              type="file"
              accept="audio/mpeg,audio/mp3,audio/wav"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadClip(file);
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="mr-1.5 h-3.5 w-3.5" />
              {uploading ? "Uploading…" : "Upload new clip"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
