export function CallRecordingPlayer({
  callId,
  playbackUrl,
}: {
  callId: string;
  playbackUrl?: string | null;
}) {
  const src = playbackUrl ?? `/api/voice/calls/history/${callId}/recording`;

  return (
    <audio controls preload="none" className="w-full" src={src}>
      <track kind="captions" />
    </audio>
  );
}
