# Storm Sprinklers display font

Place **Lulo Clean One Bold** here as:

```
Lulo-Clean-One-Bold.otf
```

This matches the title font used on [stormsprinklers.com](https://stormsprinklers.com). The CRM loads it automatically for headings and large text via `font-display` in `globals.css`.

If the file is missing, headings fall back to the body sans-serif font.

## Inter (Slack GBP review cards)

Satori (`@vercel/og`) requires **TTF or OTF** fonts — not WOFF2.

- `inter-latin-400-normal.ttf` — primary font for Slack review card images
- `noto-sans-latin-regular.ttf` — fallback (same family Next.js uses for OG images)

Do not remove these files; Slack review cards fail without a TTF font.
