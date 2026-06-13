"use client";

import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ChatFab() {
  return (
    <Button
      size="icon"
      className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full shadow-lg"
      aria-label="Open chat support"
    >
      <MessageCircle className="h-6 w-6" />
    </Button>
  );
}
