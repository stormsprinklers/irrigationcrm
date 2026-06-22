import Link from "next/link";
import { User } from "lucide-react";
import { CallHistoryIcon } from "@/components/voice/CallHistoryIcon";
import { CallRecordingPlayer } from "@/components/voice/CallRecordingPlayer";
import { CallTranscriptPanel } from "@/components/voice/CallTranscriptPanel";
import type { CallHistoryDetail } from "@/lib/voice/call-history";
import {
  formatCallDateTime,
  formatCallDuration,
  remotePartyLabel,
} from "@/lib/voice/call-history";

export function CallDetailView({ detail }: { detail: CallHistoryDetail }) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <CallHistoryIcon direction={detail.direction} answered={detail.answered} />
        <div>
          <p className="font-semibold">
            {remotePartyLabel(
              detail.direction,
              detail.fromNumber,
              detail.toNumber,
              detail.customer?.name
            )}
          </p>
          {detail.customer?.id ? (
            <Link href={`/customers/${detail.customer.id}`} className="text-sm text-primary hover:underline">
              View customer
            </Link>
          ) : null}
        </div>
      </div>

      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Date & time</dt>
          <dd className="font-medium">{formatCallDateTime(detail.startedAt)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Duration</dt>
          <dd className="font-medium">{formatCallDuration(detail.durationSec)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Employee</dt>
          <dd className="flex items-center gap-1.5 font-medium">
            <User className="h-3.5 w-3.5 text-muted-foreground" />
            {detail.handledBy?.name ?? detail.employee?.name ?? "—"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Phone</dt>
          <dd className="font-medium">
            {detail.direction === "INBOUND" ? detail.fromNumber : detail.toNumber}
          </dd>
        </div>
      </dl>

      <div>
        <p className="mb-2 text-sm font-medium">Recording</p>
        {detail.hasRecording ? (
          <CallRecordingPlayer callId={detail.id} playbackUrl={detail.recordingPlaybackUrl} />
        ) : (
          <p className="text-sm text-muted-foreground">No recording available.</p>
        )}
      </div>

      <div>
        <p className="mb-2 text-sm font-medium">Transcript</p>
        <CallTranscriptPanel transcript={detail.transcript} />
      </div>
    </div>
  );
}
