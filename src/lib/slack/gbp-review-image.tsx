import { ImageResponse } from "next/og";

export type GbpReviewCardInput = {
  companyName: string;
  reviewerName: string;
  starCount: number;
  comment: string | null;
  reviewDate: string | null;
};

function starGlyphs(count: number) {
  const safe = Math.max(0, Math.min(5, Math.round(count)));
  return `${"★".repeat(safe)}${"☆".repeat(5 - safe)}`;
}

function truncateComment(text: string | null, max = 320) {
  const trimmed = text?.trim() || "No written review — star rating only.";
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

function formatReviewDate(iso: string | null) {
  if (!iso) return "Recently on Google";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Recently on Google";
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Denver",
  });
}

export async function renderGbpReviewCardPng(input: GbpReviewCardInput): Promise<Buffer> {
  const stars = starGlyphs(input.starCount);
  const comment = truncateComment(input.comment);
  const dateLabel = formatReviewDate(input.reviewDate);

  const response = new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          background: "linear-gradient(145deg, #102341 0%, #1a4a7a 55%, #102341 100%)",
          color: "#ffffff",
          fontFamily: "sans-serif",
          padding: "56px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 26,
                background: "#ffffff",
                color: "#4285F4",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 30,
                fontWeight: 700,
              }}
            >
              G
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 28, fontWeight: 700 }}>New Google Review</div>
              <div style={{ fontSize: 18, color: "#cbd5e1", marginTop: 4 }}>{dateLabel}</div>
            </div>
          </div>
          <div
            style={{
              fontSize: 18,
              fontWeight: 600,
              color: "#f8fafc",
              background: "rgba(255,255,255,0.12)",
              padding: "10px 18px",
              borderRadius: 999,
            }}
          >
            {input.companyName}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 18,
            marginTop: 40,
          }}
        >
          <div style={{ fontSize: 44, color: "#fbbf24", letterSpacing: 2 }}>{stars}</div>
          <div style={{ fontSize: 30, fontWeight: 700 }}>{input.starCount} out of 5</div>
        </div>

        <div
          style={{
            marginTop: 36,
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.16)",
            borderRadius: 24,
            padding: "32px 36px",
            display: "flex",
            flexDirection: "column",
            gap: 18,
            flex: 1,
          }}
        >
          <div style={{ fontSize: 26, fontWeight: 700, color: "#f8fafc" }}>{input.reviewerName}</div>
          <div
            style={{
              fontSize: 24,
              lineHeight: 1.45,
              color: "#e2e8f0",
              whiteSpace: "pre-wrap",
            }}
          >
            {comment}
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );

  return Buffer.from(await response.arrayBuffer());
}
