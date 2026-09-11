"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { format } from "date-fns";
import { ListTodo, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Input } from "@/components/ui/input";
import {
  OFFICE_TODO_WEEKDAYS,
  canUseOfficeTodos,
  defaultRecurrenceEvery,
  officeTodoRecurrenceFormValues,
  officeTodoRecurrenceHint,
  officeTodoRecurrenceLabel,
  type OfficeTodoDTO,
  type OfficeTodoRecurrence,
} from "@/lib/home/todo-types";
import { cn } from "@/lib/utils";

const selectClassName =
  "flex h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const notesClassName =
  "flex min-h-[4.5rem] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

function firstName(name: string) {
  return name.split(/\s+/)[0] ?? name;
}

export function OfficeTodoList() {
  const { data: session } = useSession();
  const allowed = canUseOfficeTodos(session?.user?.role ?? "");
  const [todos, setTodos] = useState<OfficeTodoDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [recurrence, setRecurrence] = useState<OfficeTodoRecurrence>("NONE");
  const [recurrenceEvery, setRecurrenceEvery] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTodo, setDeleteTodo] = useState<OfficeTodoDTO | null>(null);

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
  const recurrenceHint = officeTodoRecurrenceHint(recurrence, recurrenceEvery);

  function startAdd() {
    setEditingId(null);
    setAdding((open) => !open);
  }

  function startEdit(todoId: string) {
    setAdding(false);
    setEditingId(todoId);
  }

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
          recurrenceEvery,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to add task");
      setTodos((current) => [...current, data]);
      setTitle("");
      setNotes("");
      setRecurrence("NONE");
      setRecurrenceEvery(null);
      setAdding(false);
      toast.success("Task added for the whole CSR team");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add task");
    } finally {
      setSaving(false);
    }
  }

  async function saveTodo(
    todo: OfficeTodoDTO,
    next: {
      title: string;
      notes: string;
      recurrence: OfficeTodoRecurrence;
      recurrenceEvery: number | null;
    }
  ) {
    if (!next.title.trim()) {
      toast.error("Enter a task");
      return;
    }
    setBusyId(todo.id);
    try {
      const res = await fetch(`/api/home/todos/${todo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: next.title.trim(),
          notes: next.notes.trim(),
          recurrence: next.recurrence,
          recurrenceEvery: next.recurrenceEvery,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setTodos((current) => current.map((item) => (item.id === todo.id ? data : item)));
      setEditingId(null);
      toast.success("Task updated for the whole CSR team");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save task");
    } finally {
      setBusyId(null);
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

  async function confirmDelete(scope: "occurrence" | "series") {
    if (!deleteTodo) return;
    setBusyId(deleteTodo.id);
    try {
      const query = scope === "occurrence" ? "?scope=occurrence" : "";
      const res = await fetch(`/api/home/todos/${deleteTodo.id}${query}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to delete");

      if (scope === "occurrence") {
        setTodos((current) => current.map((item) => (item.id === deleteTodo.id ? data : item)));
        toast.success("This time skipped — the task will come back next period");
      } else {
        setTodos((current) => current.filter((item) => item.id !== deleteTodo.id));
        toast.success("Task deleted for the whole CSR team");
      }
      if (editingId === deleteTodo.id) setEditingId(null);
      setDeleteTodo(null);
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
        <Button type="button" size="sm" variant="outline" onClick={startAdd}>
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
            <textarea
              className={notesClassName}
              placeholder="Notes (optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <div className="flex flex-wrap items-center gap-2">
              <RecurrenceFields
                recurrence={recurrence}
                recurrenceEvery={recurrenceEvery}
                onRecurrenceChange={(next) => {
                  setRecurrence(next);
                  setRecurrenceEvery(defaultRecurrenceEvery(next));
                }}
                onEveryChange={setRecurrenceEvery}
              />
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
                  setRecurrenceEvery(null);
                }}
              >
                Cancel
              </Button>
            </div>
            {recurrenceHint ? (
              <p className="text-xs text-muted-foreground">{recurrenceHint}</p>
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
                  editing={editingId === todo.id}
                  onToggle={toggleTodo}
                  onEdit={() => startEdit(todo.id)}
                  onCancelEdit={() => setEditingId(null)}
                  onSave={(next) => void saveTodo(todo, next)}
                  onDelete={() => setDeleteTodo(todo)}
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
                      editing={editingId === todo.id}
                      onToggle={toggleTodo}
                      onEdit={() => startEdit(todo.id)}
                      onCancelEdit={() => setEditingId(null)}
                      onSave={(next) => void saveTodo(todo, next)}
                      onDelete={() => setDeleteTodo(todo)}
                    />
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        )}
      </CardContent>

      {deleteTodo && deleteTodo.recurrence !== "NONE" ? (
        <RecurringTodoDeleteDialog
          open
          title={deleteTodo.title}
          busy={busyId === deleteTodo.id}
          onThisOnly={() => void confirmDelete("occurrence")}
          onAllFuture={() => void confirmDelete("series")}
          onCancel={() => setDeleteTodo(null)}
        />
      ) : (
        <ConfirmDialog
          open={Boolean(deleteTodo)}
          title="Delete this task?"
          description="It will be removed for every CSR, not just your shift."
          confirmLabel="Delete"
          confirmVariant="destructive"
          busy={Boolean(deleteTodo && busyId === deleteTodo.id)}
          onConfirm={() => void confirmDelete("series")}
          onCancel={() => setDeleteTodo(null)}
        />
      )}
    </Card>
  );
}

function RecurringTodoDeleteDialog({
  open,
  title,
  busy,
  onThisOnly,
  onAllFuture,
  onCancel,
}: {
  open: boolean;
  title: string;
  busy?: boolean;
  onThisOnly: () => void;
  onAllFuture: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="recurring-todo-delete-title"
        aria-describedby="recurring-todo-delete-desc"
        className="w-full max-w-md rounded-lg border border-border bg-white p-5 shadow-lg"
      >
        <h2 id="recurring-todo-delete-title" className="text-base font-semibold">
          Delete “{title}”?
        </h2>
        <p id="recurring-todo-delete-desc" className="mt-2 text-sm text-muted-foreground">
          This task repeats. Skip just this time, or remove it so it doesn’t come back.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={onThisOnly}>
            {busy ? "Working…" : "This task only"}
          </Button>
          <Button type="button" variant="destructive" disabled={busy} onClick={onAllFuture}>
            This and all future
          </Button>
          <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

function RecurrenceFields({
  recurrence,
  recurrenceEvery,
  onRecurrenceChange,
  onEveryChange,
}: {
  recurrence: OfficeTodoRecurrence;
  recurrenceEvery: number | null;
  onRecurrenceChange: (value: OfficeTodoRecurrence) => void;
  onEveryChange: (value: number | null) => void;
}) {
  return (
    <>
      <select
        className={selectClassName}
        value={recurrence}
        onChange={(e) => onRecurrenceChange(e.target.value as OfficeTodoRecurrence)}
      >
        <option value="NONE">Does not repeat</option>
        {recurrence === "WEEKLY" ? <option value="WEEKLY">Each week</option> : null}
        <option value="EVERY_N_DAYS">Every … days</option>
        <option value="WEEKLY_ON_DAY">Every week on …</option>
        <option value="MONTHLY_ON_DAY">Every … of the month</option>
      </select>
      {recurrence === "EVERY_N_DAYS" ? (
        <>
          <Input
            type="number"
            min={1}
            max={365}
            className="h-9 w-[4.5rem]"
            aria-label="Repeat every how many days"
            value={recurrenceEvery ?? 1}
            onChange={(e) => onEveryChange(Number(e.target.value) || 1)}
          />
          <span className="text-sm text-muted-foreground">days</span>
        </>
      ) : null}
      {recurrence === "WEEKLY_ON_DAY" ? (
        <select
          className={selectClassName}
          aria-label="Weekday"
          value={recurrenceEvery ?? 1}
          onChange={(e) => onEveryChange(Number(e.target.value))}
        >
          {OFFICE_TODO_WEEKDAYS.map((day) => (
            <option key={day.value} value={day.value}>
              {day.label}
            </option>
          ))}
        </select>
      ) : null}
      {recurrence === "MONTHLY_ON_DAY" ? (
        <>
          <Input
            type="number"
            min={1}
            max={31}
            className="h-9 w-[4.5rem]"
            aria-label="Day of the month"
            value={recurrenceEvery ?? 1}
            onChange={(e) => onEveryChange(Number(e.target.value) || 1)}
          />
          <span className="text-sm text-muted-foreground">of the month</span>
        </>
      ) : null}
    </>
  );
}

function TodoRow({
  todo,
  busy,
  editing,
  onToggle,
  onEdit,
  onCancelEdit,
  onSave,
  onDelete,
}: {
  todo: OfficeTodoDTO;
  busy: boolean;
  editing: boolean;
  onToggle: (todo: OfficeTodoDTO, completed: boolean) => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSave: (next: {
    title: string;
    notes: string;
    recurrence: OfficeTodoRecurrence;
    recurrenceEvery: number | null;
  }) => void;
  onDelete: () => void;
}) {
  const done = Boolean(todo.completedAt);
  const initial = officeTodoRecurrenceFormValues(todo);
  const [title, setTitle] = useState(todo.title);
  const [notes, setNotes] = useState(todo.notes ?? "");
  const [recurrence, setRecurrence] = useState(initial.recurrence);
  const [recurrenceEvery, setRecurrenceEvery] = useState(initial.recurrenceEvery);
  const recurrenceHint = officeTodoRecurrenceHint(recurrence, recurrenceEvery);

  useEffect(() => {
    if (!editing) return;
    const next = officeTodoRecurrenceFormValues(todo);
    setTitle(todo.title);
    setNotes(todo.notes ?? "");
    setRecurrence(next.recurrence);
    setRecurrenceEvery(next.recurrenceEvery);
  }, [editing, todo]);

  if (editing) {
    return (
      <li className="rounded-md border border-border px-3 py-2">
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            onSave({ title, notes, recurrence, recurrenceEvery });
          }}
        >
          <Input
            autoFocus
            placeholder="What needs to get done?"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={busy}
          />
          <textarea
            className={notesClassName}
            placeholder="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={busy}
          />
          <div className="flex flex-wrap items-center gap-2">
            <RecurrenceFields
              recurrence={recurrence}
              recurrenceEvery={recurrenceEvery}
              onRecurrenceChange={(next) => {
                setRecurrence(next);
                setRecurrenceEvery(defaultRecurrenceEvery(next));
              }}
              onEveryChange={setRecurrenceEvery}
            />
            <Button type="submit" size="sm" disabled={busy}>
              {busy ? "Saving..." : "Save"}
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onCancelEdit}>
              Cancel
            </Button>
          </div>
          {recurrenceHint ? (
            <p className="text-xs text-muted-foreground">{recurrenceHint}</p>
          ) : null}
        </form>
      </li>
    );
  }

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
        {todo.notes ? <p className="text-xs text-muted-foreground whitespace-pre-wrap">{todo.notes}</p> : null}
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {todo.recurrence !== "NONE" ? (
            <Badge variant="secondary">
              {officeTodoRecurrenceLabel(todo.recurrence, todo.recurrenceEvery)}
            </Badge>
          ) : null}
          {!todo.notes ? (
            <button
              type="button"
              className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
              onClick={onEdit}
            >
              Add note
            </button>
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
        aria-label={`Edit ${todo.title}`}
        disabled={busy}
        onClick={onEdit}
      >
        <Pencil className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 text-muted-foreground"
        aria-label={`Delete ${todo.title}`}
        disabled={busy}
        onClick={onDelete}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </li>
  );
}
