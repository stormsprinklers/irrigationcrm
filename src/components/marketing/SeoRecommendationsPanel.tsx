"use client";

import { format } from "date-fns";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Circle, Loader2, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import type { SeoTaskDto } from "@/lib/marketing/seo-task-types";

const CATEGORY_LABELS: Record<string, string> = {
  content: "Content",
  backlinks: "Backlinks",
  technical: "Technical",
  local: "Local SEO",
  "on-page": "On-page",
  other: "Other",
};

export function SeoRecommendationsPanel() {
  const [tasks, setTasks] = useState<SeoTaskDto[]>([]);
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/marketing/seo/tasks");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load tasks");
      setTasks(data.tasks ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load SEO tasks");
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  async function generateRecommendations() {
    setGenerating(true);
    setSummary(null);
    try {
      const res = await fetch("/api/marketing/seo/recommendations", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to generate recommendations");

      setSummary(data.summary ?? null);
      const newTasks = (data.tasks ?? []) as SeoTaskDto[];
      setTasks((current) => {
        const ids = new Set(newTasks.map((task) => task.id));
        const rest = current.filter((task) => !ids.has(task.id));
        return [...newTasks, ...rest].sort((a, b) => {
          if (a.completed !== b.completed) return a.completed ? 1 : -1;
          if (a.priority !== b.priority) return a.priority - b.priority;
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });
      });
      toast.success("Added 3 AI SEO recommendations to your task list");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate recommendations");
    } finally {
      setGenerating(false);
    }
  }

  async function toggleTask(task: SeoTaskDto, completed: boolean) {
    setTogglingId(task.id);
    try {
      const res = await fetch(`/api/marketing/seo/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update task");

      setTasks((current) =>
        current
          .map((row) => (row.id === task.id ? (data as SeoTaskDto) : row))
          .sort((a, b) => {
            if (a.completed !== b.completed) return a.completed ? 1 : -1;
            if (a.priority !== b.priority) return a.priority - b.priority;
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          })
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update task");
    } finally {
      setTogglingId(null);
    }
  }

  async function deleteTask(taskId: string) {
    try {
      const res = await fetch(`/api/marketing/seo/tasks/${taskId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete task");
      setTasks((current) => current.filter((task) => task.id !== taskId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete task");
    }
  }

  const openTasks = tasks.filter((task) => !task.completed);
  const completedTasks = tasks.filter((task) => task.completed);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-5 w-5 text-amber-500" />
            AI SEO recommendations
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Analyzes your organic rankings, Search Console, and site analytics to suggest three
            specific, high-value SEO actions for your team.
          </p>
        </div>
        <Button
          size="sm"
          disabled={generating}
          onClick={() => void generateRecommendations()}
        >
          {generating ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-1 h-4 w-4" />
          )}
          {generating ? "Analyzing…" : "Get recommendations"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {summary ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            {summary}
          </p>
        ) : null}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading SEO tasks…
          </div>
        ) : tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No SEO tasks yet. Click <strong>Get recommendations</strong> to generate three
            actionable tips based on your current SEO reach.
          </p>
        ) : (
          <div className="space-y-6">
            {openTasks.length > 0 ? (
              <TaskGroup
                title="To do"
                tasks={openTasks}
                togglingId={togglingId}
                onToggle={toggleTask}
                onDelete={deleteTask}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                All tasks complete — generate a fresh set when you&apos;re ready for the next sprint.
              </p>
            )}

            {completedTasks.length > 0 ? (
              <TaskGroup
                title="Completed"
                tasks={completedTasks}
                togglingId={togglingId}
                onToggle={toggleTask}
                onDelete={deleteTask}
                muted
              />
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TaskGroup({
  title,
  tasks,
  togglingId,
  onToggle,
  onDelete,
  muted = false,
}: {
  title: string;
  tasks: SeoTaskDto[];
  togglingId: string | null;
  onToggle: (task: SeoTaskDto, completed: boolean) => void;
  onDelete: (taskId: string) => void;
  muted?: boolean;
}) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground">{title}</h3>
      <ul className="space-y-3">
        {tasks.map((task) => (
          <li
            key={task.id}
            className={`rounded-lg border p-4 ${muted ? "opacity-70" : "bg-card"}`}
          >
            <div className="flex items-start gap-3">
              <Checkbox
                checked={task.completed}
                disabled={togglingId === task.id}
                onCheckedChange={(checked) => onToggle(task, checked === true)}
                className="mt-1"
                aria-label={task.completed ? "Mark incomplete" : "Mark complete"}
              />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    {task.completed ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                    ) : (
                      <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <div>
                      <p
                        className={`font-medium ${task.completed ? "line-through text-muted-foreground" : ""}`}
                      >
                        {task.title}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {task.category ? (
                          <span className="rounded-full bg-muted px-2 py-0.5">
                            {CATEGORY_LABELS[task.category] ?? task.category}
                          </span>
                        ) : null}
                        <span>Priority {task.priority}</span>
                        <span>
                          Added {format(new Date(task.createdAt), "MMM d, yyyy")}
                        </span>
                        {task.completedAt ? (
                          <span>
                            · Done {format(new Date(task.completedAt), "MMM d, yyyy")}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 shrink-0 text-muted-foreground"
                    onClick={() => onDelete(task.id)}
                    aria-label="Delete task"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-sm leading-relaxed text-foreground/90">{task.description}</p>
                {task.rationale ? (
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium">Why: </span>
                    {task.rationale}
                  </p>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
