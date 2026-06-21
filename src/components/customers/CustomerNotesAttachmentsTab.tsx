"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { blobProxyUrl } from "@/lib/blob/urls";

type Note = {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; name: string; photoUrl: string | null; color: string | null };
};

type Attachment = {
  id: string;
  blobUrl: string;
  fileName: string;
  mimeType: string;
  createdAt: string;
  uploadedBy: { id: string; name: string };
};

type Props = { customerId: string };

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function CustomerNotesAttachmentsTab({ customerId }: Props) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [noteBody, setNoteBody] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const [notesRes, attachmentsRes] = await Promise.all([
      fetch(`/api/customers/${customerId}/notes`),
      fetch(`/api/customers/${customerId}/attachments`),
    ]);
    if (notesRes.ok) setNotes(await notesRes.json());
    if (attachmentsRes.ok) setAttachments(await attachmentsRes.json());
  }, [customerId]);

  useEffect(() => {
    load().catch(() => toast.error("Failed to load notes and attachments"));
  }, [load]);

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    if (!noteBody.trim()) return;
    setSavingNote(true);
    try {
      const res = await fetch(`/api/customers/${customerId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: noteBody.trim() }),
      });
      if (!res.ok) {
        toast.error("Failed to add note");
        return;
      }
      setNoteBody("");
      await load();
    } finally {
      setSavingNote(false);
    }
  }

  async function uploadFile(file: File) {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/customers/${customerId}/attachments`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? "Upload failed");
        return;
      }
      await load();
      toast.success("Attachment uploaded");
    } finally {
      setUploading(false);
    }
  }

  async function removeAttachment(attachmentId: string) {
    const res = await fetch(
      `/api/customers/${customerId}/attachments?attachmentId=${encodeURIComponent(attachmentId)}`,
      { method: "DELETE" }
    );
    if (!res.ok) {
      toast.error("Failed to remove attachment");
      return;
    }
    await load();
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={addNote} className="flex gap-2">
            <Input
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              placeholder="Add a note..."
            />
            <Button type="submit" disabled={savingNote || !noteBody.trim()}>
              Add
            </Button>
          </form>
          {notes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No notes yet.</p>
          ) : (
            <div className="space-y-3">
              {notes.map((note) => (
                <div key={note.id} className="flex gap-3 rounded-md border p-3">
                  <Avatar className="h-8 w-8">
                    {note.author.photoUrl ? (
                      <AvatarImage src={blobProxyUrl(note.author.photoUrl)} alt={note.author.name} />
                    ) : null}
                    <AvatarFallback
                      style={{ backgroundColor: note.author.color ?? "#64748B", color: "#fff" }}
                    >
                      {getInitials(note.author.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{note.author.name}</span>
                      <span>{new Date(note.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm">{note.body}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

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
    </div>
  );
}
