const CALLBACK_TAG = "callback";

export function syncCallbackTag(tags: string[], isCallback: boolean): string[] {
  const without = tags.filter((t) => t.toLowerCase() !== CALLBACK_TAG);
  if (isCallback) {
    return [...without, CALLBACK_TAG];
  }
  return without;
}

export function resolveIsCallback(isCallback: boolean | undefined, tags: string[] | undefined): boolean {
  if (isCallback !== undefined) return isCallback;
  return (tags ?? []).some((t) => t.toLowerCase() === CALLBACK_TAG);
}
