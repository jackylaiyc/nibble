/**
 * Share-card templates rendered by Satori inside /api/og/route.tsx.
 *
 * We use inline styles rather than Tailwind because Satori only supports
 * a subset of Tailwind classes and the failure modes are silent (missing
 * spacing, broken flex) — plain style objects are the safe path.
 *
 * Every template MUST:
 *   - Fit the Nibble pastel palette (butter / peach / sage / cream).
 *   - Show a Nibble watermark in the bottom-right corner.
 *   - Include a tiny disclaimer line ("Educational use only" / zh equivalent)
 *     so the card is legally clean when reposted outside the app.
 */

import React from "react";

// Palette duplicated as hex strings because Satori doesn't resolve CSS vars.
const COLORS = {
  cream: "#FFFBF0",
  creamDeep: "#F4ECD8",
  butter: "#FFE8A3",
  butterDeep: "#F5CF66",
  peach: "#FFB5A0",
  peachDeep: "#FF8F70",
  sage: "#A8D5BA",
  sageDeep: "#6FB38A",
  ink: "#2A2A2A",
  inkSoft: "#5B5B5B",
  inkFaded: "#9A9A9A",
  border: "#F0E6D2",
} as const;

export const OG_SIZES = {
  og: { width: 1200, height: 630 },
  square: { width: 1080, height: 1080 },
} as const;

export type OgSize = keyof typeof OG_SIZES;

export type Locale = "en" | "zh-TW";

// Satori doesn't implement CSS grid, so we chunk items into flex rows.
function chunkPairs<T>(items: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += 2) out.push(items.slice(i, i + 2));
  return out;
}

// Watermark + disclaimer live on every card.
function Watermark({ locale }: { locale: Locale }) {
  return (
    <div
      style={{
        position: "absolute",
        bottom: 36,
        right: 44,
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 48,
          height: 48,
          borderRadius: 14,
          background: COLORS.butter,
          fontSize: 32,
        }}
      >
        🍎
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <span
          style={{
            fontSize: 26,
            fontWeight: 700,
            color: COLORS.ink,
            letterSpacing: -0.5,
          }}
        >
          Nibble
        </span>
        <span style={{ fontSize: 16, color: COLORS.inkSoft }}>
          {locale === "en" ? "trynibble.app" : "寶貝小口"}
        </span>
      </div>
    </div>
  );
}

function Disclaimer({ locale }: { locale: Locale }) {
  return (
    <div
      style={{
        position: "absolute",
        bottom: 36,
        left: 44,
        fontSize: 15,
        color: COLORS.inkFaded,
        maxWidth: 520,
      }}
    >
      {locale === "en"
        ? "Educational use only — not medical advice."
        : "僅供教育參考，並非醫療建議。"}
    </div>
  );
}

// ─── Scan card (today's RDA recap) ────────────────────────────────────────

export interface ScanCardParams {
  childName: string;
  ageText: string;
  nutrients: Array<{ key: string; label: string; pct: number }>;
  locale: Locale;
  size: OgSize;
}

export function ScanCard(p: ScanCardParams) {
  const { width, height } = OG_SIZES[p.size];
  return (
    <div
      style={{
        width,
        height,
        display: "flex",
        flexDirection: "column",
        position: "relative",
        background: `linear-gradient(135deg, ${COLORS.peach} 0%, ${COLORS.butter} 100%)`,
        fontFamily: "sans-serif",
        padding: 60,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span
          style={{
            fontSize: 22,
            fontWeight: 600,
            color: COLORS.peachDeep,
            letterSpacing: 2,
            textTransform: "uppercase",
          }}
        >
          {p.locale === "en" ? "Today's plate" : "今天的餐盤"}
        </span>
        <h1
          style={{
            fontSize: 70,
            lineHeight: 1.05,
            fontWeight: 800,
            color: COLORS.ink,
            margin: 0,
            letterSpacing: -2,
          }}
        >
          {p.childName}
        </h1>
        <div style={{ fontSize: 26, color: COLORS.inkSoft }}>{p.ageText}</div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 18,
          marginTop: "auto",
          marginBottom: 100,
        }}
      >
        {chunkPairs(p.nutrients.slice(0, 4)).map((row, rowIdx) => (
          <div
            key={rowIdx}
            style={{ display: "flex", gap: 18 }}
          >
            {row.map((n) => (
              <div
                key={n.key}
                style={{
                  flex: 1,
                  background: "rgba(255,255,255,0.8)",
                  borderRadius: 20,
                  padding: "16px 22px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span
                  style={{
                    fontSize: 24,
                    color: COLORS.ink,
                    fontWeight: 600,
                  }}
                >
                  {n.label}
                </span>
                <span
                  style={{
                    fontSize: 38,
                    fontWeight: 800,
                    color: COLORS.peachDeep,
                    letterSpacing: -1,
                  }}
                >
                  {`${Math.round(n.pct)}%`}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>

      <Disclaimer locale={p.locale} />
      <Watermark locale={p.locale} />
    </div>
  );
}
