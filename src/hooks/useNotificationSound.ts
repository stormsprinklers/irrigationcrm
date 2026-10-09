"use client";

import { useCallback, useEffect, useRef } from "react";

export function useNotificationSound() {
  const audioContextRef = useRef<AudioContext | null>(null);

  const unlockNotificationSound = useCallback(async () => {
    if (typeof window === "undefined") return null;
    const AudioContextConstructor =
      window.AudioContext ??
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) return null;

    const context = audioContextRef.current ?? new AudioContextConstructor();
    audioContextRef.current = context;
    if (context.state === "suspended") {
      await context.resume().catch(() => undefined);
    }
    return context.state === "running" ? context : null;
  }, []);

  const playNotificationSound = useCallback(async () => {
    const context = await unlockNotificationSound();
    if (!context) return;

    const playTone = (frequency: number, delay: number) => {
      const start = context.currentTime + delay;
      const oscillator = context.createOscillator();
      const gain = context.createGain();

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.08, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.24);

      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.25);
      oscillator.addEventListener("ended", () => {
        oscillator.disconnect();
        gain.disconnect();
      });
    };

    playTone(659.25, 0);
    playTone(880, 0.11);
  }, [unlockNotificationSound]);

  useEffect(() => {
    const unlock = () => {
      void unlockNotificationSound();
    };
    window.addEventListener("pointerdown", unlock, { once: true, passive: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [unlockNotificationSound]);

  useEffect(
    () => () => {
      const context = audioContextRef.current;
      audioContextRef.current = null;
      if (context && context.state !== "closed") void context.close();
    },
    []
  );

  return playNotificationSound;
}
