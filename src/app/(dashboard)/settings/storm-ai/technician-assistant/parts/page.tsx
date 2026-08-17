"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Link2, Loader2, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { ContentArea } from "@/components/layout/ContentArea";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

type Section = { id: string; name: string; sortOrder: number; partCount: number };

type PartPhoto = {
  id: string;
  url: string;
  fileName: string;
  mimeType: string;
  alt: string | null;
};

type Part = {
  id: string;
  sectionId: string;
  sectionName: string | null;
  name: string;
  manufacturer: string | null;
  partNumber: string | null;
  visualDescription: string | null;
  technicalDescription: string | null;
  manualUrl: string | null;
  manualFileName: string | null;
  manualMimeType?: string | null;
  manualKind?: "pdf" | "link" | null;
  active: boolean;
  photos: PartPhoto[];
};

export default function TechAssistPartsPage() {
  const [sections, setSections] = useState<Section[]>([]);
  const [parts, setParts] = useState<Part[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const [sectionName, setSectionName] = useState("");
  const [partDraft, setPartDraft] = useState<Part | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [manualLinkInput, setManualLinkInput] = useState("");
  const [savingManualLink, setSavingManualLink] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const manualInputRef = useRef<HTMLInputElement>(null);

  const loadSections = useCallback(async () => {
    const res = await fetch("/api/settings/storm-ai/parts/sections");
    if (!res.ok) throw new Error("sections");
    const data = await res.json();
    const next = (data.sections ?? []) as Section[];
    setSections(next);
    setSelectedSectionId((current) => current ?? next[0]?.id ?? null);
  }, []);

  const loadParts = useCallback(async (sectionId: string | null) => {
    if (!sectionId) {
      setParts([]);
      return;
    }
    const res = await fetch(
      `/api/settings/storm-ai/parts?sectionId=${encodeURIComponent(sectionId)}`
    );
    if (!res.ok) throw new Error("parts");
    const data = await res.json();
    setParts(data.parts ?? []);
  }, []);

  useEffect(() => {
    void loadSections()
      .catch(() => toast.error("Could not load sections"))
      .finally(() => setLoading(false));
  }, [loadSections]);

  useEffect(() => {
    void loadParts(selectedSectionId).catch(() => toast.error("Could not load parts"));
    setSelectedPartId(null);
    setPartDraft(null);
  }, [selectedSectionId, loadParts]);

  useEffect(() => {
    const part = parts.find((p) => p.id === selectedPartId) ?? null;
    setPartDraft((prev) => {
      if (!part) return null;
      // Same part refreshed (e.g. after photo/manual upload): keep in-progress text fields.
      if (prev?.id === part.id) {
        return {
          ...part,
          name: prev.name,
          manufacturer: prev.manufacturer,
          partNumber: prev.partNumber,
          visualDescription: prev.visualDescription,
          technicalDescription: prev.technicalDescription,
          active: prev.active,
          sectionId: prev.sectionId,
        };
      }
      return part;
    });
  }, [parts, selectedPartId]);

  useEffect(() => {
    const part = parts.find((p) => p.id === selectedPartId) ?? null;
    if (part?.manualKind === "link" && part.manualUrl) {
      setManualLinkInput(part.manualUrl);
    } else {
      setManualLinkInput("");
    }
  }, [selectedPartId]); // eslint-disable-line react-hooks/exhaustive-deps -- sync on part switch only

  /** Persist name/descriptions without clobbering the draft from a subsequent reload. */
  async function persistPartFields(draft: Part) {
    const res = await fetch(`/api/settings/storm-ai/parts/${draft.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: draft.name,
        manufacturer: draft.manufacturer,
        partNumber: draft.partNumber,
        visualDescription: draft.visualDescription,
        technicalDescription: draft.technicalDescription,
        active: draft.active,
        sectionId: draft.sectionId,
      }),
    });
    if (!res.ok) throw new Error("save");
  }

  async function createSection() {
    const name = sectionName.trim();
    if (!name) return;
    const res = await fetch("/api/settings/storm-ai/parts/sections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      toast.error("Could not create section");
      return;
    }
    const section = await res.json();
    setSectionName("");
    await loadSections();
    setSelectedSectionId(section.id);
    toast.success("Section created");
  }

  async function renameSection(id: string, name: string) {
    const res = await fetch(`/api/settings/storm-ai/parts/sections/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) toast.error("Could not rename section");
    else void loadSections();
  }

  async function deleteSection(id: string) {
    if (!confirm("Delete this section and all parts inside it?")) return;
    const res = await fetch(`/api/settings/storm-ai/parts/sections/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      toast.error("Could not delete section");
      return;
    }
    if (selectedSectionId === id) setSelectedSectionId(null);
    await loadSections();
    toast.success("Section deleted");
  }

  async function createPart() {
    if (!selectedSectionId) return;
    const res = await fetch("/api/settings/storm-ai/parts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sectionId: selectedSectionId, name: "New part" }),
    });
    if (!res.ok) {
      toast.error("Could not create part");
      return;
    }
    const part = (await res.json()) as Part;
    await loadParts(selectedSectionId);
    await loadSections();
    setSelectedPartId(part.id);
    toast.success("Part created");
  }

  async function savePart() {
    if (!partDraft) return;
    setSaving(true);
    try {
      await persistPartFields(partDraft);
      await loadParts(selectedSectionId);
      toast.success("Part saved");
    } catch {
      toast.error("Could not save part");
    } finally {
      setSaving(false);
    }
  }

  async function deletePart(id: string) {
    if (!confirm("Delete this part?")) return;
    const res = await fetch(`/api/settings/storm-ai/parts/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Could not delete part");
      return;
    }
    setSelectedPartId(null);
    await loadParts(selectedSectionId);
    await loadSections();
    toast.success("Part deleted");
  }

  async function uploadPhotos(files: FileList | null) {
    if (!partDraft || !files?.length) return;
    setUploading(true);
    try {
      // Save text fields first so a media refresh cannot wipe unsaved edits in the DB either.
      await persistPartFields(partDraft);
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch(`/api/settings/storm-ai/parts/${partDraft.id}/photos`, {
          method: "POST",
          body: form,
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "Upload failed");
        }
      }
      await loadParts(selectedSectionId);
      toast.success("Photo uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  }

  async function removePhoto(photoId: string) {
    if (!partDraft) return;
    try {
      await persistPartFields(partDraft);
    } catch {
      /* still try delete */
    }
    const res = await fetch(
      `/api/settings/storm-ai/parts/${partDraft.id}/photos/${photoId}`,
      { method: "DELETE" }
    );
    if (!res.ok) {
      toast.error("Could not delete photo");
      return;
    }
    await loadParts(selectedSectionId);
  }

  async function uploadManual(files: FileList | null) {
    if (!partDraft || !files?.[0]) return;
    setUploading(true);
    try {
      await persistPartFields(partDraft);
      const form = new FormData();
      form.append("file", files[0]);
      const res = await fetch(`/api/settings/storm-ai/parts/${partDraft.id}/manual`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Upload failed");
      }
      await loadParts(selectedSectionId);
      toast.success("Manual uploaded");
      setManualLinkInput("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (manualInputRef.current) manualInputRef.current.value = "";
    }
  }

  async function clearManual() {
    if (!partDraft) return;
    try {
      await persistPartFields(partDraft);
    } catch {
      /* still try clear */
    }
    const res = await fetch(`/api/settings/storm-ai/parts/${partDraft.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clearManual: true }),
    });
    if (!res.ok) {
      toast.error("Could not remove manual");
      return;
    }
    setManualLinkInput("");
    await loadParts(selectedSectionId);
  }

  async function saveManualLink() {
    if (!partDraft) return;
    const trimmed = manualLinkInput.trim();
    if (!trimmed) {
      toast.error("Paste a manual URL first");
      return;
    }
    setSavingManualLink(true);
    try {
      await persistPartFields(partDraft);
      const res = await fetch(`/api/settings/storm-ai/parts/${partDraft.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manualLink: trimmed }),
      });
      const data = (await res.json().catch(() => ({}))) as Part & { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Could not save link");
      }
      if (data.manualUrl) setManualLinkInput(data.manualUrl);
      await loadParts(selectedSectionId);
      toast.success("Manual link saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save link");
    } finally {
      setSavingManualLink(false);
    }
  }

  if (loading) {
    return (
      <ContentArea>
        <p className="text-sm text-muted-foreground">Loading parts library…</p>
      </ContentArea>
    );
  }

  return (
    <ContentArea className="max-w-6xl">
      <PageHeader
        breadcrumb={["Settings", "Storm AI", "Technician Assistant", "Parts Info"]}
        title="Parts Info"
        subtitle="Sections of parts with visual and technical descriptions, photos, and manuals for Storm AI to look up in the field"
      />

      <div className="grid gap-4 lg:grid-cols-[220px_220px_1fr]">
        {/* Sections */}
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Sections
          </p>
          <div className="mb-3 flex gap-1">
            <Input
              placeholder="New section"
              value={sectionName}
              onChange={(e) => setSectionName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void createSection();
              }}
            />
            <Button type="button" size="icon" variant="outline" onClick={() => void createSection()}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <ul className="space-y-1">
            {sections.length === 0 ? (
              <li className="px-2 py-3 text-xs text-muted-foreground">
                Add a section (e.g. Solenoids, Controllers).
              </li>
            ) : (
              sections.map((section) => (
                <li key={section.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedSectionId(section.id)}
                    className={`flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm ${
                      selectedSectionId === section.id
                        ? "bg-primary/10 font-medium text-primary"
                        : "hover:bg-muted"
                    }`}
                  >
                    <span className="truncate">{section.name}</span>
                    <span className="text-xs text-muted-foreground">{section.partCount}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>

        {/* Parts list */}
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Parts
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!selectedSectionId}
              onClick={() => void createPart()}
            >
              <Plus className="mr-1 h-3 w-3" />
              Add
            </Button>
          </div>
          {!selectedSectionId ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">Select a section.</p>
          ) : parts.length === 0 ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">No parts in this section.</p>
          ) : (
            <ul className="space-y-1">
              {parts.map((part) => (
                <li key={part.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedPartId(part.id)}
                    className={`w-full rounded-md px-2 py-2 text-left text-sm ${
                      selectedPartId === part.id
                        ? "bg-primary/10 font-medium text-primary"
                        : "hover:bg-muted"
                    }`}
                  >
                    <span className="block truncate">{part.name}</span>
                    {!part.active ? (
                      <span className="text-xs text-muted-foreground">Inactive</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Editor */}
        <div className="rounded-lg border border-border bg-card p-4">
          {!partDraft ? (
            <p className="text-sm text-muted-foreground">
              Select or create a part to edit its descriptions, photos, and manual.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-3">
                  <label className="block text-sm">
                    Name
                    <Input
                      className="mt-1"
                      value={partDraft.name}
                      onChange={(e) => setPartDraft({ ...partDraft, name: e.target.value })}
                    />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-sm">
                      Manufacturer
                      <Input
                        className="mt-1"
                        value={partDraft.manufacturer ?? ""}
                        onChange={(e) =>
                          setPartDraft({ ...partDraft, manufacturer: e.target.value || null })
                        }
                      />
                    </label>
                    <label className="block text-sm">
                      Part number
                      <Input
                        className="mt-1"
                        value={partDraft.partNumber ?? ""}
                        onChange={(e) =>
                          setPartDraft({ ...partDraft, partNumber: e.target.value || null })
                        }
                      />
                    </label>
                  </div>
                  {sections.length > 1 ? (
                    <label className="block text-sm">
                      Section
                      <select
                        className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                        value={partDraft.sectionId}
                        onChange={(e) =>
                          setPartDraft({ ...partDraft, sectionId: e.target.value })
                        }
                      >
                        {sections.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                </div>
                <div className="flex items-center gap-2 pt-6">
                  <span className="text-xs text-muted-foreground">Active</span>
                  <Switch
                    checked={partDraft.active}
                    onCheckedChange={(checked) =>
                      setPartDraft({ ...partDraft, active: checked })
                    }
                  />
                </div>
              </div>

              <label className="block text-sm">
                Visual description
                <textarea
                  className="mt-1 min-h-[88px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  value={partDraft.visualDescription ?? ""}
                  onChange={(e) =>
                    setPartDraft({ ...partDraft, visualDescription: e.target.value || null })
                  }
                  placeholder="How to recognize this part in the field (shape, color, markings, where it sits)…"
                />
              </label>

              <label className="block text-sm">
                Technical description
                <textarea
                  className="mt-1 min-h-[120px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  value={partDraft.technicalDescription ?? ""}
                  onChange={(e) =>
                    setPartDraft({
                      ...partDraft,
                      technicalDescription: e.target.value || null,
                    })
                  }
                  placeholder="Specs, wiring, ohms ranges, install notes, common failures…"
                />
              </label>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-medium">Photos</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={uploading}
                    onClick={() => photoInputRef.current?.click()}
                  >
                    {uploading ? (
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    ) : (
                      <Upload className="mr-1 h-3 w-3" />
                    )}
                    Upload photos
                  </Button>
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    multiple
                    className="hidden"
                    onChange={(e) => void uploadPhotos(e.target.files)}
                  />
                </div>
                {partDraft.photos.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No photos yet.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {partDraft.photos.map((photo) => (
                      <div
                        key={photo.id}
                        className="group relative overflow-hidden rounded-md border border-border"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={photo.url}
                          alt={photo.alt || photo.fileName}
                          className="h-28 w-full object-cover"
                        />
                        <button
                          type="button"
                          className="absolute right-1 top-1 rounded bg-black/60 p-1 text-white opacity-0 transition group-hover:opacity-100"
                          onClick={() => void removePhoto(photo.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">Manual (PDF or link)</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={uploading}
                    onClick={() => manualInputRef.current?.click()}
                  >
                    <Upload className="mr-1 h-3 w-3" />
                    Upload PDF
                  </Button>
                  <input
                    ref={manualInputRef}
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={(e) => void uploadManual(e.target.files)}
                  />
                </div>
                <div className="mb-2 flex gap-2">
                  <Input
                    value={manualLinkInput}
                    onChange={(e) => setManualLinkInput(e.target.value)}
                    placeholder="https://… manufacturer manual URL"
                    className="text-sm"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={savingManualLink || uploading}
                    onClick={() => void saveManualLink()}
                  >
                    {savingManualLink ? (
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    ) : (
                      <Link2 className="mr-1 h-3 w-3" />
                    )}
                    Save link
                  </Button>
                </div>
                {partDraft.manualUrl ? (
                  <div className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                    <a
                      href={partDraft.manualUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-w-0 items-center gap-2 text-primary hover:underline"
                    >
                      {partDraft.manualKind === "link" ? (
                        <Link2 className="h-4 w-4 shrink-0" />
                      ) : (
                        <FileText className="h-4 w-4 shrink-0" />
                      )}
                      <span className="truncate">
                        {partDraft.manualKind === "link"
                          ? partDraft.manualFileName || partDraft.manualUrl
                          : partDraft.manualFileName || "Manual.pdf"}
                      </span>
                    </a>
                    <Button type="button" size="sm" variant="ghost" onClick={() => void clearManual()}>
                      Remove
                    </Button>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No manual yet — upload a PDF or paste a link above.
                  </p>
                )}
              </div>

              <div className="flex flex-wrap justify-between gap-2 border-t border-border pt-4">
                <Button
                  type="button"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => void deletePart(partDraft.id)}
                >
                  Delete part
                </Button>
                <div className="flex gap-2">
                  {selectedSectionId ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        const section = sections.find((s) => s.id === selectedSectionId);
                        if (!section) return;
                        const next = window.prompt("Rename section", section.name);
                        if (next?.trim()) void renameSection(section.id, next.trim());
                      }}
                    >
                      Rename section
                    </Button>
                  ) : null}
                  {selectedSectionId ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void deleteSection(selectedSectionId)}
                    >
                      Delete section
                    </Button>
                  ) : null}
                  <Button type="button" onClick={() => void savePart()} disabled={saving}>
                    {saving ? "Saving…" : "Save part"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </ContentArea>
  );
}
