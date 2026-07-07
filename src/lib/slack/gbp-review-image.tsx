import { ImageResponse } from "next/og";
import { getOgFont, sanitizeOgText } from "@/lib/slack/og-font";

export type GbpReviewCardInput = {
  companyName: string;
  reviewerName: string;
  starCount: number;
  comment: string | null;
  reviewDate: string | null;
};

const CARD_WIDTH = 1200;
const CARD_MIN_HEIGHT = 630;
const HORIZONTAL_PADDING = 56;
const COMMENT_FONT_SIZE = 24;
const COMMENT_LINE_HEIGHT = 1.45;
const COMMENT_LINE_PX = COMMENT_FONT_SIZE * COMMENT_LINE_HEIGHT;
/** Space above the review body (header, stars, reviewer name, gaps, padding). */
const FIXED_CHROME_HEIGHT = 340;
const INNER_BOX_PADDING_X = 36;
const COMMENT_WIDTH =
  CARD_WIDTH - HORIZONTAL_PADDING * 2 - INNER_BOX_PADDING_X * 2;

function StarRow({ count }: { count: number }) {
  const safe = Math.max(0, Math.min(5, Math.round(count)));
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      {Array.from({ length: 5 }, (_, index) => {
        const filled = index < safe;
        return (
          <div
            key={index}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 38,
              lineHeight: 1,
              color: filled ? "#fbbf24" : "#64748b",
            }}
          >
            {filled ? "★" : "☆"}
          </div>
        );
      })}
    </div>
  );
}

function formatComment(text: string | null) {
  return sanitizeOgText(text?.trim() || "No written review - star rating only.");
}

function formatStarLabel(count: number) {
  const safe = Math.max(0, Math.min(5, Math.round(count)));
  if (safe === 1) return "1 star";
  return `${safe} stars`;
}

function estimateCardHeight(comment: string) {
  const avgCharWidth = COMMENT_FONT_SIZE * 0.48;
  const charsPerLine = Math.max(24, Math.floor(COMMENT_WIDTH / avgCharWidth));
  const lineCount = Math.max(1, Math.ceil(comment.length / charsPerLine));
  const commentAreaHeight = CARD_MIN_HEIGHT - FIXED_CHROME_HEIGHT;
  const linesAtMinHeight = Math.floor(commentAreaHeight / COMMENT_LINE_PX);
  if (lineCount <= linesAtMinHeight) return CARD_MIN_HEIGHT;
  const extraLines = lineCount - linesAtMinHeight;
  return CARD_MIN_HEIGHT + Math.ceil(extraLines * COMMENT_LINE_PX);
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
  const comment = formatComment(input.comment);
  const dateLabel = formatReviewDate(input.reviewDate);
  const reviewerName = sanitizeOgText(input.reviewerName) || "Google reviewer";
  const companyName = sanitizeOgText(input.companyName) || "Your company";
  const starLabel = formatStarLabel(input.starCount);
  const cardHeight = estimateCardHeight(comment);
  const ogFont = await getOgFont();

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
          fontFamily: ogFont.name,
          padding: `${HORIZONTAL_PADDING}px`,
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
              <div style={{ fontSize: 28, fontWeight: 700, display: "flex" }}>New Google Review</div>
              <div style={{ fontSize: 18, color: "#cbd5e1", marginTop: 4, display: "flex" }}>{dateLabel}</div>
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
              display: "flex",
            }}
          >
            {companyName}
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
          <StarRow count={input.starCount} />
          <div style={{ fontSize: 30, fontWeight: 700, display: "flex" }}>{starLabel}</div>
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
          <div style={{ fontSize: 26, fontWeight: 700, color: "#f8fafc", display: "flex" }}>
            {reviewerName}
          </div>
          <div
            style={{
              fontSize: COMMENT_FONT_SIZE,
              lineHeight: COMMENT_LINE_HEIGHT,
              color: "#e2e8f0",
              whiteSpace: "pre-wrap",
              display: "flex",
            }}
          >
            {comment}
          </div>
        </div>
      </div>
    ),
    {
      width: CARD_WIDTH,
      height: cardHeight,
      fonts: [
        {
          name: ogFont.name,
          data: ogFont.data,
          style: "normal",
          weight: 400,
        },
      ],
    }
  );

  return Buffer.from(await response.arrayBuffer());
}
