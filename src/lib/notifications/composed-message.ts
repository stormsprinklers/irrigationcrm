/** The estimate URL is supplied by the server, separately from editable copy. */
export function composeEstimateMessage(message: string, estimateUrl: string) {
  return `${message.trim()}\n\n${estimateUrl}`;
}

export function escapeMessageHtml(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
