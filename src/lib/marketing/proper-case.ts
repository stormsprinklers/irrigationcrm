/** Format imported names and places for customer-facing campaign merge fields. */
export function marketingProperCase(value?: string | null): string | null {
  if (!value?.trim()) return null;
  const capitalize = (part: string) => {
    const letters = Array.from(part.toLocaleLowerCase("en-US"));
    return letters[0]!.toLocaleUpperCase("en-US") + letters.slice(1).join("");
  };
  return value.trim().replace(/\p{L}+(?:['’]\p{L}+)*/gu, (word) => {
    const parts = word.split(/(['’])/u);
    return parts
      .map((part, index) =>
        index % 2 === 1
          ? part
          : index > 0 && index === parts.length - 1 && part.length === 1
            ? part.toLocaleLowerCase("en-US")
            : capitalize(part)
      )
      .join("");
  });
}

export function marketingStateCase(value?: string | null): string | null {
  const state = value?.trim();
  if (!state) return null;
  return /^[a-z]{2}$/i.test(state) ? state.toUpperCase() : marketingProperCase(state);
}
