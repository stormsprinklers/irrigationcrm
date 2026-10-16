/** Accept the production setting's historical name as well as Twilio's SID name. */
export function iosVoicePushCredentialSid(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.TWILIO_PUSH_CREDENTIAL_SID?.trim() || env.TWILIO_PUSH_CREDENTIAL_ID?.trim() || undefined;
}
