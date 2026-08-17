import { Suspense } from "react";
import { StormAiChat } from "@/components/storm-ai/StormAiChat";

export default function StormAiPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
          Loading Storm AI…
        </div>
      }
    >
      <StormAiChat />
    </Suspense>
  );
}
