"use client";

import { useState } from "react";
import { toast } from "sonner";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type BlockContactActionProps = {
  customerId?: string;
  phone?: string | null;
  email?: string | null;
  name?: string;
  /** Smaller trigger for inline placement next to phone numbers. */
  inline?: boolean;
  onBlocked?: () => void;
};

export function BlockContactAction({
  customerId,
  phone,
  email,
  name,
  inline = false,
  onBlocked,
}: BlockContactActionProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const blockLabel = phone ? "Block number" : "Block contact";
  const confirmDescription = phone
    ? "Are you sure you want to block this number?"
    : `Are you sure you want to block ${name ?? "this contact"}?`;

  async function handleBlock() {
    setBusy(true);
    try {
      const res = await fetch("/api/inbox/block", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
          phone,
          email,
          reason: "Blocked from inbox",
        }),
      });

      if (!res.ok) {
        toast.error("Failed to block contact");
        return;
      }

      toast.success(phone ? "Number blocked" : `${name ?? "Contact"} blocked`);
      setConfirmOpen(false);
      onBlocked?.();
    } finally {
      setBusy(false);
    }
  }

  if (!phone && !email && !customerId) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={inline ? "h-6 w-6 shrink-0" : "h-8 w-8"}
            aria-label="More actions"
          >
            <MoreHorizontal className={inline ? "h-3.5 w-3.5" : "h-4 w-4"} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={() => setConfirmOpen(true)}
            className="text-destructive"
          >
            {blockLabel}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={confirmOpen}
        title={blockLabel}
        description={confirmDescription}
        confirmLabel="Yes, block"
        confirmVariant="destructive"
        busy={busy}
        onConfirm={() => void handleBlock()}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
