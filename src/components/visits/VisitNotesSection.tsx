"use client";

import { useState } from "react";
import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CallRecordingPlayer } from "@/components/voice/CallRecordingPlayer";
import { blobProxyUrl } from "@/lib/blob/urls";
import { formatCallDateTime, formatCallDuration } from "@/lib/voice/call-history";

export type VisitNoteCall = {
  id: string;
  startedAt: string;
  durationSec: number | null;
  transcript: string | null;
  aiSummary: string | null;
  hasRecording: boolean;
  recordingPlaybackUrl: string | null;
  employee: { id: string; name: string } | null;
};

export type VisitNoteItem = {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; name: string; photoUrl: string | null; color: string | null };
  callLog?: VisitNoteCall | null;
};

type CallOption = {
  id: string;
  startedAt: string;
  aiSummary: string | null;
  employee: { id: string; name: string } | null;
  fromNumber: string;
  toNumber: string;
  direction: string;
};

type Props = {
  visitId: string;
  customerId?: string | null;
  notes: VisitNoteItem[];
  onUpdated: () => Promise<void>;
};

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function VisitNotesSection({ visitId, customerId, notes, onUpdated }: Props) {
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [linking, setLinking] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [callOptions, setCallOptions] = useState<CallOption[]>([]);
  const [selectedCallId, setSelectedCallId] = useState("");
  const [loadingCalls, setLoadingCalls] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editNoteBody, setEditNoteBody] = useState("");
  const [noteActionId, setNoteActionId] = useState<string | null>(null);

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/visits/${visitId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: body.trim() }),
      });
      if (!res.ok) {
        toast.error("Failed to add note");
        return;
      }
      setBody("");
      await onUpdated();
    } finally {
      setSaving(false);
    }
  }

  async function openCallPicker() {
    if (!customerId) {
      toast.error("This visit has no customer to match calls against");
      return;
    }
    setPickerOpen(true);
    setLoadingCalls(true);
    try {
      const res = await fetch(`/api/customers/${customerId}/calls`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to load calls");
      setCallOptions(data.calls ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load calls");
      setPickerOpen(false);
    } finally {
      setLoadingCalls(false);
    }
  }

  async function attachCall() {
    if (!selectedCallId) {
      toast.error("Select a call");
      return;
    }
    setLinking(true);
    try {
      const res = await fetch(`/api/visits/${visitId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callLogId: selectedCallId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to link call");
      toast.success("Call linked to visit notes");
      setPickerOpen(false);
      setSelectedCallId("");
      await onUpdated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to link call");
    } finally {
      setLinking(false);
    }
  }

  async function updateNote(noteId: string) {
    const trimmed = editNoteBody.trim();
    if (!trimmed) return;
    setNoteActionId(noteId);
    try {
      const res = await fetch(`/api/visits/${visitId}/notes`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noteId, body: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to update note");
      setEditingNoteId(null);
      setEditNoteBody("");
      await onUpdated();
      toast.success("Note updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update note");
    } finally {
      setNoteActionId(null);
    }
  }

  async function removeNote(noteId: string) {
    if (!window.confirm("Delete this note?")) return;
    setNoteActionId(noteId);
    try {
      const res = await fetch(
        `/api/visits/${visitId}/notes?noteId=${encodeURIComponent(noteId)}`,
        { method: "DELETE" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to delete note");
      if (editingNoteId === noteId) {
        setEditingNoteId(null);
        setEditNoteBody("");
      }
      await onUpdated();
      toast.success("Note deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete note");
    } finally {
      setNoteActionId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Notes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={addNote} className="flex gap-2">
          <Input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Add a note..."
          />
          <Button type="submit" disabled={saving || !body.trim()}>
            Add
          </Button>
        </form>

        {customerId ? (
          <div className="space-y-2 rounded-md border border-dashed p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => void openCallPicker()}>
                Link call to notes
              </Button>
              {pickerOpen ? (
                <Button type="button" size="sm" variant="ghost" onClick={() => setPickerOpen(false)}>
                  Cancel
                </Button>
              ) : null}
            </div>
            {pickerOpen ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={selectedCallId}
                  onChange={(e) => setSelectedCallId(e.target.value)}
                  disabled={loadingCalls}
                >
                  <option value="">
                    {loadingCalls ? "Loading calls…" : "Select a call…"}
                  </option>
                  {callOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {formatCallDateTime(c.startedAt)}
                      {c.employee?.name ? ` · ${c.employee.name}` : ""}
                      {c.aiSummary ? ` · ${c.aiSummary.slice(0, 40)}…` : ""}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  size="sm"
                  disabled={linking || !selectedCallId}
                  onClick={() => void attachCall()}
                >
                  {linking ? "Linking…" : "Attach"}
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

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
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{note.author.name}</span>
                      <span>{new Date(note.createdAt).toLocaleString()}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        aria-label="Edit note"
                        disabled={noteActionId === note.id}
                        onClick={() => {
                          setEditingNoteId(note.id);
                          setEditNoteBody(note.body);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        aria-label="Delete note"
                        disabled={noteActionId === note.id}
                        onClick={() => void removeNote(note.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  {editingNoteId === note.id ? (
                    <div className="space-y-2">
                      <textarea
                        value={editNoteBody}
                        onChange={(event) => setEditNoteBody(event.target.value)}
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
                            setEditNoteBody("");
                          }}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          disabled={!editNoteBody.trim() || noteActionId === note.id}
                          onClick={() => void updateNote(note.id)}
                        >
                          Save
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm whitespace-pre-wrap">{note.body}</p>
                  )}
                  {note.callLog ? (
                    <div className="space-y-2 rounded-md border bg-muted/20 p-3 text-sm">
                      <p className="font-medium">
                        Linked call · {formatCallDateTime(note.callLog.startedAt)}
                        {note.callLog.employee?.name
                          ? ` · ${note.callLog.employee.name}`
                          : ""}
                        {note.callLog.durationSec
                          ? ` · ${formatCallDuration(note.callLog.durationSec)}`
                          : ""}
                      </p>
                      {note.callLog.aiSummary ? (
                        <p className="leading-relaxed text-foreground">{note.callLog.aiSummary}</p>
                      ) : null}
                      {note.callLog.hasRecording ? (
                        <CallRecordingPlayer
                          callId={note.callLog.id}
                          playbackUrl={note.callLog.recordingPlaybackUrl}
                        />
                      ) : null}
                      {note.callLog.transcript?.trim() ? (
                        <details>
                          <summary className="cursor-pointer text-xs text-muted-foreground">
                            Transcript
                          </summary>
                          <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed">
                            {note.callLog.transcript}
                          </p>
                        </details>
                      ) : null}
                      {customerId ? (
                        <Link
                          href={`/customers/${customerId}?tab=calls`}
                          className="text-xs text-primary hover:underline"
                        >
                          View on customer profile
                        </Link>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
