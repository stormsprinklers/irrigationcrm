export function callRecordingPlaybackPath(callLogId: string) {
  return `/api/voice/calls/history/${callLogId}/recording`;
}

export function twilioRecordingMediaUrl(recordingUrl: string) {
  if (recordingUrl.endsWith(".mp3") || recordingUrl.endsWith(".wav")) {
    return recordingUrl;
  }
  return `${recordingUrl}.mp3`;
}
