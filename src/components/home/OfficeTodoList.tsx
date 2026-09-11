"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { format } from "date-fns";
import { ListTodo, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Input } from "@/components/ui/input";
import {
  OFFICE_TODO_RECURRENCE_LABELS,
  canUseOfficeTodos,
  type OfficeTodoDTO,
  type OfficeTodoRecurrence,
} from "@/lib/home/todo-types";
import { cn } from "@/lib/utils";

const selectClassName =
  "flex h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

function firstName(name: string) {
  return name.split(/\s+/)[0] ?? name;
}

export function OfficeTodoList() {
  const { data: session } = useSession();
  const allowed = canUseOfficeTodos(session?.user?.role ?? "");
  const [todos, setTodos] = useState<OfficeTodoDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [recurrence, setRecurrence] = useState<OfficeTodoRecurrence>("NONE");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/home/todos");
    if (!res.ok) throw new Error("Failed to load");
    const data = await res.json();
    setTodos(data.todos ?? []);
  }, []);

  useEffect(() => {
    if (!allowed) return;
    setLoading(true);
    load()
      .catch(() => toast.error("Failed to load to-do list"))
      .finally(() => setLoading(false));
  }, [allowed, load]);

  const openTodos = useMemo(() => todos.filter((todo) => !todo.completedAt), [todos]);
  const doneTodos = useMemo(() => todos.filter((todo) => todo.completedAt), [todos]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Enter a task");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/home/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          notes: notes.trim() || undefined,
          recurrence,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to add task");
      setTodos((current) => [...current, data]);
      setTitle("");
      setNotes("");
      setRecurrence("NONE");
      setAdding(false);
      toast.success("Task added for the whole CSR team");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add task");
    } finally {
      setSaving(false);
    }
  }

  async function toggleTodo(todo: OfficeTodoDTO, completed: boolean) {
    setBusyId(todo.id);
    try {
      const res = await fetch(`/api/home/todos/${todo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to update");
      setTodos((current) => current.map((item) => (item.id === todo.id ? data : item)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update task");
    } finally {
      setBusyId(null);
    }
  }

  async function confirmDelete() {
    if (!deleteId) return;
    setBusyId(deleteId);
    try {
      const res = await fetch(`/api/home/todos/${deleteId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to delete");
      }
      setTodos((current) => current.filter((item) => item.id !== deleteId));
      setDeleteId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete task");
    } finally {
      setBusyId(null);
    }
  }

  if (!allowed) return null;

  return (
    <Card className="mb-6">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <ListTodo className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base font-semibold">CSR to-do list</CardTitle>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Shared across every CSR shift — check something off and the next person will see it.
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => setAdding((open) => !open)}>
          <Plus className="mr-1 h-4 w-4" />
          Add task
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {adding ? (
          <form
            onSubmit={(e) => void handleCreate(e)}
            className="space-y-2 rounded-md border border-dashed border-border p-3"
          >
            <Input
              autoFocus
              placeholder="What needs to get done?"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <Input
              placeholder="Notes (optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <div className="flex flex-wrap items-center gap-2">
              <select
                className={selectClassName}
                value={recurrence}
                onChange={(e) => setRecurrence(e.target.value as OfficeTodoRecurrence)}
              >
                <option value="NONE">One-time</option>
                <option value="DAILY">Repeats daily</option>
                <option value="WEEKLY">Repeats weekly</option>
              </select>
              <Button type="submit" size="sm" disabled={saving}>
                {saving ? "Adding..." : "Add"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setAdding(false);
                  setTitle("");
                  setNotes("");
                  setRecurrence("NONE");
                }}
              >
                Cancel
              </Button>
            </div>
            {recurrence !== "NONE" ? (
              <p className="text-xs text-muted-foreground">
                {recurrence === "DAILY"
                  ? "Comes back each morning after it is checked off."
                  : "Comes back at the start of next week after it is checked off."}
              </p>
            ) : null}
          </form>
        ) : null}

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading tasks...</p>
        ) : openTodos.length === 0 && doneTodos.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No tasks yet. Add something like “Check next week’s schedule.”
          </p>
        ) : (
          <>
            <ul className="space-y-2">
              {openTodos.map((todo) => (
                <TodoRow
                  key={todo.id}
                  todo={todo}
                  busy={busyId === todo.id}
                  onToggle={toggleTodo}
                  onDelete={() => setDeleteId(todo.id)}
                />
              ))}
            </ul>
            {doneTodos.length > 0 ? (
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Done this period ({doneTodos.length})
                </p>
                <ul className="space-y-2">
                  {doneTodos.map((todo) => (
                    <TodoRow
                      key={todo.id}
                      todo={todo}
                      busy={busyId === todo.id}
                      onToggle={toggleTodo}
                      onDelete={() => setDeleteId(todo.id)}
                    />
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        )}
      </CardContent>

      <ConfirmDialog
        open={Boolean(deleteId)}
        title="Delete this task?"
        description="It will be removed for every CSR, not just your shift."
        confirmLabel="Delete"
        confirmVariant="destructive"
        busy={Boolean(deleteId && busyId === deleteId)}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteId(null)}
      />
    </Card>
  );
}

function TodoRow({
  todo,
  busy,
  onToggle,
  onDelete,
}: {
  todo: OfficeTodoDTO;
  busy: boolean;
  onToggle: (todo: OfficeTodoDTO, completed: boolean) => void;
  onDelete: () => void;
}) {
  const done = Boolean(todo.completedAt);
  return (
    <li
      className={cn(
        "flex items-start gap-3 rounded-md border border-border/70 px-3 py-2",
        done && "bg-muted/30"
      )}
    >
      <Checkbox
        className="mt-1"
        checked={done}
        disabled={busy}
        onCheckedChange={(checked) => onToggle(todo, checked === true)}
        aria-label={todo.title}
      />
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm font-medium", done && "text-muted-foreground line-through")}>
          {todo.title}
        </p>
        {todo.notes ? <p className="text-xs text-muted-foreground">{todo.notes}</p> : null}
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {todo.recurrence !== "NONE" ? (
            <Badge variant="secondary">{OFFICE_TODO_RECURRENCE_LABELS[todo.recurrence]}</Badge>
          ) : null}
          {done && todo.completedByName && todo.completedAt ? (
            <span className="text-[11px] text-muted-foreground">
              {firstName(todo.completedByName)} · {format(new Date(todo.completedAt), "MMM d, h:mm a")}
            </span>
          ) : null}
        </div>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 text-muted-foreground"
        aria-label={`Delete ${todo.title}`}
        onClick={onDelete}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </li>
  );
}
