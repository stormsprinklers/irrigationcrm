export function getSlackBotToken() {
  return process.env.SLACK_BOT_TOKEN?.trim() || null;
}

export function isSlackConfigured() {
  return Boolean(getSlackBotToken());
}

export function slackConfigHints() {
  return ["SLACK_BOT_TOKEN"];
}
