"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Calendar, ChevronDown, FileText, Plus, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createDraftCustomer, createDraftVisit } from "@/lib/schedule/create-draft";

export function NewMenu() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  async function runCreate(action: () => Promise<void>) {
    if (creating) return;
    setCreating(true);
    try {
      await action();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setCreating(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="dark" size="sm" className="rounded-full px-4" disabled={creating}>
          <Plus className="h-4 w-4" />
          {creating ? "Creating…" : "New"}
          <ChevronDown className="h-3.5 w-3.5 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem
          disabled={creating}
          onSelect={() =>
            void runCreate(async () => {
              const customer = await createDraftCustomer();
              router.push(`/customers/${customer.id}?edit=1`);
            })
          }
        >
          <UserPlus />
          New customer
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={creating}
          onSelect={() =>
            void runCreate(async () => {
              const visit = await createDraftVisit();
              router.push(`/visits/${visit.id}`);
            })
          }
        >
          <Calendar />
          New visit
        </DropdownMenuItem>
        <DropdownMenuItem disabled={creating} onSelect={() => router.push("/estimates/new")}>
          <FileText />
          New estimate
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
