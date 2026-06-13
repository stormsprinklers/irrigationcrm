"use client";

import { useRef, useState } from "react";
import { FileText, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { blobProxyUrl } from "@/lib/blob/urls";

type Attachment = {
  id: string;
  blobUrl: string;
  fileName: string;
  mimeType: string;
  createdAt: string;
  uploadedBy: { id: string; name: string };
};

type Props = {
  visitId: string;
  attachments: Attachment[];
  onUpdated: () => Promise<void>;
};

export function VisitAttachmentsSection({ visitId, attachments, onUpdated }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function uploadFile(file: File) {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/visits/${visitId}/attachments`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? "Upload failed");
        return;
      }
      await onUpdated();
      toast.success("Attachment uploaded");
    } finally {
      setUploading(false);
    }
  }

  async function removeAttachment(attachmentId: string) {
    const res = await fetch(
      `/api/visits/${visitId}/attachments?attachmentId=${encodeURIComponent(attachmentId)}`,
      { method: "DELETE" }
    );
    if (!res.ok) {
      toast.error("Failed to remove attachment");
      return;
    }
    await onUpdated();
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base">Attachments</CardTitle>
        <Button
          variant="outline"
          size="sm"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="h-4 w-4" />
          Upload
        </Button>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) uploadFile(file);
            e.target.value = "";
          }}
        />
      </CardHeader>
      <CardContent>
        {attachments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No attachments yet.</p>
        ) : (
          <div className="space-y-2">
            {attachments.map((attachment) => (
              <div
                key={attachment.id}
                className="flex items-center justify-between rounded-md border p-3"
              >
                <a
                  href={blobProxyUrl(attachment.blobUrl) ?? attachment.blobUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm hover:underline"
                >
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span>{attachment.fileName}</span>
                </a>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeAttachment(attachment.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
