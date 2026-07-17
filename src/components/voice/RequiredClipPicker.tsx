"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { blobProxyUrl } from "@/lib/blob/urls";
import type { VoiceClip } from "@/components/voice/AudioSourcePicker";

type Props = {
  label: string;
  description?: string;
  clipId: string | null;
  clips: VoiceClip[];
  onChange: (clipId: string | null) => void;
  onClipsChange: (clips: VoiceClip[]) => void;
  required?: boolean;
};

const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

/** Clip-only picker (no TTS) for required company audio like queue wait / hold music. */
export function RequiredClipPicker({
  label,
  description,
  clipId,
  clips,
  onChange,
  onClipsChange,
  required = true,
}: Props) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const selected = clips.find((c) => c.id === clipId);

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
          name: file.name.replace(/\.[^.]+$/, "") || label,
          blobUrl: url,
          mimeType,
        }),
      });
      if (!createRes.ok) throw new Error("Failed to save clip");
      const created = (await createRes.json()) as VoiceClip;

      const refreshed = await fetch("/api/settings/voice/clips").then((r) => r.json());
      onClipsChange(Array.isArray(refreshed) ? refreshed : [...clips, created]);
      onChange(created.id);
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
      <div>
        <label className="block text-sm font-medium">
          {label}
          {required ? <span className="text-destructive"> *</span> : null}
        </label>
        {description ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>

      <select
        className={selectClass}
        value={clipId ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        required={required}
      >
        <option value="">Select an uploaded audio clip…</option>
        {clips.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,.mp3,.wav"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void uploadClip(file);
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
        >
          <Upload className="mr-1.5 h-3.5 w-3.5" />
          {uploading ? "Uploading…" : "Upload new clip"}
        </Button>
        {selected ? (
          <audio controls src={blobProxyUrl(selected.blobUrl) ?? undefined} className="h-8 max-w-full" />
        ) : (
          <span className="text-xs text-amber-700">Required — upload or select a clip</span>
        )}
      </div>
    </div>
  );
}
