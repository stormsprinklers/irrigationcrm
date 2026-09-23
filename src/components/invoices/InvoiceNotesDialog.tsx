"use client";

import { useEffect, useState } from "react";
import { MessageSquareText, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type InvoiceNote = {
  id: string;
  body: string;
  automated: boolean;
  createdAt: string;
  author: { id: string; name: string } | null;
};

type Props = {
  invoiceId: string;
  invoiceNumber: string;
  open: boolean;
  onClose: () => void;
};

function formatNoteTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function InvoiceNotesDialog({ invoiceId, invoiceNumber, open, onClose }: Props) {
  const [notes, setNotes] = useState<InvoiceNote[]>([]);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [noteActionId, setNoteActionId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setBody("");
    setEditingNoteId(null);
    setEditBody("");
    setLoading(true);
    fetch(`/api/invoices/${invoiceId}/notes`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load private notes");
        setNotes(Array.isArray(data) ? data : []);
      })
      .catch((error) => toast.error(error instanceof Error ? error.message : "Failed to load private notes"))
      .finally(() => setLoading(false));
  }, [invoiceId, open]);

  async function addNote(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save private note");
      setNotes((current) => [data as InvoiceNote, ...current]);
      setBody("");
      toast.success("Private invoice note added");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save private note");
    } finally {
      setSaving(false);
    }
  }

  async function updateNote(noteId: string) {
    const trimmed = editBody.trim();
    if (!trimmed) return;
    setNoteActionId(noteId);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/notes`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noteId, body: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to update private note");
      setNotes((current) => current.map((note) => (note.id === noteId ? data : note)));
      setEditingNoteId(null);
      setEditBody("");
      toast.success("Private invoice note updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update private note");
    } finally {
      setNoteActionId(null);
    }
  }

  async function removeNote(noteId: string) {
    if (!window.confirm("Delete this private invoice note?")) return;
    setNoteActionId(noteId);
    try {
      const res = await fetch(
        `/api/invoices/${invoiceId}/notes?noteId=${encodeURIComponent(noteId)}`,
        { method: "DELETE" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to delete private note");
      setNotes((current) => current.filter((note) => note.id !== noteId));
      if (editingNoteId === noteId) {
        setEditingNoteId(null);
        setEditBody("");
      }
      toast.success("Private invoice note deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete private note");
    } finally {
      setNoteActionId(null);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="relative z-10 flex max-h-[min(42rem,calc(100dvh-2rem))] w-full max-w-lg flex-col rounded-lg border bg-background p-6 shadow-lg">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <MessageSquareText className="h-5 w-5" aria-hidden />
              Private follow-up notes
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Invoice {invoiceNumber} · Visible only to office staff.
            </p>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close notes">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <form onSubmit={addNote} className="space-y-2">
          <label htmlFor={`invoice-note-${invoiceId}`} className="text-sm font-medium">
            Add a private note
          </label>
          <textarea
            id={`invoice-note-${invoiceId}`}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            maxLength={4_000}
            rows={3}
            placeholder="e.g. Left voicemail; will follow up Friday morning."
            className="min-h-[84px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">Customer-facing invoices and the portal never show these notes.</p>
            <Button type="submit" size="sm" disabled={saving || !body.trim()}>
              {saving ? "Saving..." : "Add note"}
            </Button>
          </div>
        </form>

        <div className="mt-5 min-h-0 flex-1 overflow-y-auto border-t pt-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading notes...</p>
          ) : notes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No follow-up notes yet.</p>
          ) : (
            <div className="space-y-3">
              {notes.map((note) => (
                <article key={note.id} className="rounded-md border bg-muted/20 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                      {note.automated
                        ? "Automated follow-up"
                        : note.author?.name ?? "Office staff"}
                      {" · "}
                      {formatNoteTime(note.createdAt)}
                    </p>
                    {!note.automated ? (
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          aria-label="Edit private note"
                          disabled={noteActionId === note.id}
                          onClick={() => {
                            setEditingNoteId(note.id);
                            setEditBody(note.body);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          aria-label="Delete private note"
                          disabled={noteActionId === note.id}
                          onClick={() => void removeNote(note.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : null}
                  </div>
                  {editingNoteId === note.id ? (
                    <div className="mt-2 space-y-2">
                      <textarea
                        value={editBody}
                        onChange={(event) => setEditBody(event.target.value)}
                        maxLength={4_000}
                        rows={3}
                        className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                      />
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingNoteId(null);
                            setEditBody("");
                          }}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          disabled={!editBody.trim() || noteActionId === note.id}
                          onClick={() => void updateNote(note.id)}
                        >
                          Save
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-2 whitespace-pre-wrap text-sm">{note.body}</p>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
