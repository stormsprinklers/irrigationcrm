"use client";

import { toast } from "sonner";
import { Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
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
};

export function BlockContactAction({
  customerId,
  phone,
  email,
  name,
}: BlockContactActionProps) {
  async function handleBlock() {
    const res = await fetch("/api/inbox/block", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId, phone, email, reason: "Blocked from inbox" }),
    });

    if (!res.ok) {
      toast.error("Failed to block contact");
      return;
    }

    toast.success(`${name ?? "Contact"} blocked`);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <Ban className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={handleBlock} className="text-destructive">
          Block {name ?? "contact"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
