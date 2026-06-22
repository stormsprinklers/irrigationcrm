"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CallRecordingPlayer({
  callId,
  playbackUrl,
}: {
  callId: string;
  playbackUrl?: string | null;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const src = playbackUrl ?? `/api/voice/calls/history/${callId}/recording`;

  async function togglePlayback() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
    } else {
      try {
        await audio.play();
      } catch {
        // Browser blocked autoplay — user can use native controls
      }
    }
  }

  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/20 p-3">
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-10 w-10 shrink-0"
          onClick={togglePlayback}
          aria-label={playing ? "Pause recording" : "Play recording"}
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>
        <p className="text-sm text-muted-foreground">
          {playing ? "Playing call recording" : "Play call recording"}
        </p>
      </div>
      <audio
        ref={audioRef}
        controls
        preload="none"
        className="w-full"
        src={src}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      >
        <track kind="captions" />
      </audio>
    </div>
  );
}
