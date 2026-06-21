"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { blobProxyUrl } from "@/lib/blob/urls";

type VoiceClip = {
  id: string;
  name: string;
  blobUrl: string;
  mimeType: string;
  durationSec: number | null;
  createdAt: string;
};

export default function VoiceClipsPage() {
  const [clips, setClips] = useState<VoiceClip[]>([]);
  const [name, setName] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function load() {
    fetch("/api/settings/voice/clips")
      .then((r) => r.json())
      .then(setClips)
      .catch(() => toast.error("Failed to load clips"));
  }

  useEffect(() => {
    load();
  }, []);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file || !name.trim()) {
      toast.error("Name and audio file are required");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const uploadRes = await fetch("/api/upload/voice-clip", {
        method: "POST",
        body: formData,
      });
      if (!uploadRes.ok) {
        const data = await uploadRes.json();
        throw new Error(data.error ?? "Upload failed");
      }
      const { url, mimeType } = await uploadRes.json();

      const createRes = await fetch("/api/settings/voice/clips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), blobUrl: url, mimeType }),
      });
      if (!createRes.ok) throw new Error("Failed to save clip");

      setName("");
      if (fileRef.current) fileRef.current.value = "";
      load();
      toast.success("Clip uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <ContentArea className="max-w-3xl">
      <PageHeader breadcrumb={["Settings", "Voice", "Audio clips"]} title="Audio clips" />

      <form
        onSubmit={handleUpload}
        className="mb-8 space-y-4 rounded-lg border border-border bg-white p-6"
      >
        <h3 className="font-semibold">Upload clip</h3>
        <p className="text-sm text-muted-foreground">MP3 or WAV, max 10MB. Used in IVR greetings.</p>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Clip name (e.g. Main greeting)"
        />
        <Input ref={fileRef} type="file" accept="audio/mpeg,audio/mp3,audio/wav" />
        <Button type="submit" disabled={uploading}>
          {uploading ? "Uploading..." : "Upload clip"}
        </Button>
      </form>

      <ul className="divide-y divide-border rounded-lg border border-border bg-white">
        {clips.map((clip) => (
          <li key={clip.id} className="flex items-center justify-between gap-4 p-4">
            <div>
              <p className="font-medium">{clip.name}</p>
              <p className="text-xs text-muted-foreground">{clip.mimeType}</p>
            </div>
            <audio controls src={blobProxyUrl(clip.blobUrl)} className="h-8 max-w-xs" />
          </li>
        ))}
        {!clips.length && (
          <li className="p-4 text-sm text-muted-foreground">No audio clips yet.</li>
        )}
      </ul>
    </ContentArea>
  );
}
