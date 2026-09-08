"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { Archive, ArchiveRestore, Copy, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { isCampaignEditable } from "@/lib/marketing/campaign-lifecycle";

type CampaignRef = { id: string; name: string; status: string };

type Props = {
  campaign: CampaignRef;
  variant?: "menu" | "buttons";
  onChanged?: () => void;
  onDeleted?: () => void;
};

export function CampaignLifecycleActions({
  campaign,
  variant = "menu",
  onChanged,
  onDeleted,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<"archive" | "delete" | null>(null);

  const editable = isCampaignEditable(campaign.status);
  const archived = campaign.status === "ARCHIVED";

  async function duplicate() {
    setBusy(true);
    try {
      const res = await fetch(`/api/marketing/campaigns/${campaign.id}/duplicate`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not duplicate campaign");
      toast.success("Campaign duplicated as a draft");
      router.push(`/marketing/campaigns/${data.id}/edit`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not duplicate");
    } finally {
      setBusy(false);
    }
  }

  async function archive() {
    setBusy(true);
    try {
      const res = await fetch(`/api/marketing/campaigns/${campaign.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ARCHIVED" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not archive campaign");
      toast.success("Campaign archived");
      setConfirm(null);
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not archive");
    } finally {
      setBusy(false);
    }
  }

  async function unarchive() {
    setBusy(true);
    try {
      const res = await fetch(`/api/marketing/campaigns/${campaign.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "DRAFT" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not restore campaign");
      toast.success("Campaign restored as a draft");
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not restore");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      const res = await fetch(`/api/marketing/campaigns/${campaign.id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not delete campaign");
      toast.success("Campaign deleted");
      setConfirm(null);
      if (onDeleted) onDeleted();
      else if (onChanged) onChanged();
      else router.push("/marketing/campaigns");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete");
    } finally {
      setBusy(false);
    }
  }

  const dialog = (
    <ConfirmDialog
      open={confirm !== null}
      title={confirm === "delete" ? "Delete campaign?" : "Archive campaign?"}
      description={
        confirm === "delete"
          ? `Permanently delete “${campaign.name}” and all of its send records. This cannot be undone.`
          : `Hide “${campaign.name}” from the campaign list. Active enrollments will be cancelled. You can restore it later as a draft.`
      }
      confirmLabel={confirm === "delete" ? "Delete permanently" : "Archive"}
      confirmVariant="destructive"
      busy={busy}
      onConfirm={confirm === "delete" ? remove : archive}
      onCancel={() => setConfirm(null)}
    />
  );

  if (variant === "buttons") {
    return (
      <>
        <div className="flex flex-wrap items-center gap-2">
          {editable ? (
            <Button size="sm" variant="outline" asChild>
              <Link href={`/marketing/campaigns/${campaign.id}/edit`}>
                <Pencil className="mr-1 h-4 w-4" />
                Edit
              </Link>
            </Button>
          ) : null}
          <Button size="sm" variant="outline" disabled={busy} onClick={duplicate}>
            <Copy className="mr-1 h-4 w-4" />
            Duplicate
          </Button>
          {archived ? (
            <Button size="sm" variant="outline" disabled={busy} onClick={unarchive}>
              <ArchiveRestore className="mr-1 h-4 w-4" />
              Restore
            </Button>
          ) : (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirm("archive")}>
              <Archive className="mr-1 h-4 w-4" />
              Archive
            </Button>
          )}
          <Button
            size="sm"
            variant="destructive"
            disabled={busy}
            onClick={() => setConfirm("delete")}
          >
            <Trash2 className="mr-1 h-4 w-4" />
            Delete
          </Button>
        </div>
        {dialog}
      </>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            disabled={busy}
            aria-label={`Actions for ${campaign.name}`}
            onClick={(event) => event.stopPropagation()}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
          {editable ? (
            <DropdownMenuItem asChild>
              <Link href={`/marketing/campaigns/${campaign.id}/edit`}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </Link>
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem disabled={busy} onSelect={() => duplicate()}>
            <Copy className="mr-2 h-4 w-4" />
            Duplicate
          </DropdownMenuItem>
          {archived ? (
            <DropdownMenuItem disabled={busy} onSelect={() => unarchive()}>
              <ArchiveRestore className="mr-2 h-4 w-4" />
              Restore
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => setConfirm("archive")}>
              <Archive className="mr-2 h-4 w-4" />
              Archive
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={() => setConfirm("delete")}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {dialog}
    </>
  );
}
