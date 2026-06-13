"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Props = {
  visitId: string;
  tags: string[];
  onUpdated: () => Promise<void>;
};

export function VisitTagsSection({ visitId, tags, onUpdated }: Props) {
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);

  async function saveTags(nextTags: string[]) {
    setSaving(true);
    try {
      const res = await fetch(`/api/visits/${visitId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: nextTags }),
      });
      if (!res.ok) {
        toast.error("Failed to update tags");
        return;
      }
      await onUpdated();
    } finally {
      setSaving(false);
    }
  }

  function addTag(e: React.FormEvent) {
    e.preventDefault();
    const tag = input.trim();
    if (!tag || tags.includes(tag)) {
      setInput("");
      return;
    }
    saveTags([...tags, tag]);
    setInput("");
  }

  function removeTag(tag: string) {
    saveTags(tags.filter((t) => t !== tag));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Tags</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <form onSubmit={addTag} className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Add tag..."
            disabled={saving}
          />
          <Button type="submit" disabled={saving || !input.trim()}>
            Add
          </Button>
        </form>
        <div className="flex flex-wrap gap-2">
          {tags.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tags.</p>
          ) : (
            tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="gap-1 pr-1">
                {tag}
                <button
                  type="button"
                  className="rounded-full p-0.5 hover:bg-muted"
                  onClick={() => removeTag(tag)}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
