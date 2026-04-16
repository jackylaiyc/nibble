import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import {
  GrowthCard,
  MilestoneCard,
  OG_SIZES,
  ScanCard,
  type Locale,
  type OgSize,
} from "@/lib/share/ogTemplates";

/**
 * Dynamic share-card endpoint.
 *
 * GET /api/og?type=milestone&childName=小豆&emoji=👣&label=First+step
 *              &achievedAt=2026-04-16&ageText=14mo&locale=zh-TW&size=og
 *
 * Runtime: "nodejs" (the default for route handlers) — @vercel/og ships
 * a Node build that handles Satori + PNG encoding in-process. Edge runtime
 * is also supported and is preferred for prod cache behaviour, but it
 * has intermittent compile issues in Next 16 dev; we'll flip the toggle
 * at deploy time.
 */

function q(req: NextRequest, key: string, fallback = ""): string {
  return req.nextUrl.searchParams.get(key) ?? fallback;
}

function qn(req: NextRequest, key: string): number | undefined {
  const raw = req.nextUrl.searchParams.get(key);
  if (raw === null || raw === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function coerceLocale(raw: string): Locale {
  return raw === "en" ? "en" : "zh-TW";
}

function coerceSize(raw: string): OgSize {
  return raw === "square" ? "square" : "og";
}

export async function GET(req: NextRequest) {
  try {
    const type = q(req, "type", "milestone");
    const locale = coerceLocale(q(req, "locale", "zh-TW"));
    const size = coerceSize(q(req, "size", "og"));
    const dims = OG_SIZES[size];

    let element: React.ReactElement;

    if (type === "milestone") {
      element = MilestoneCard({
        childName: q(req, "childName", locale === "en" ? "Baby" : "寶貝"),
        emoji: q(req, "emoji", "🎉"),
        label: q(req, "label", locale === "en" ? "Milestone" : "里程碑"),
        achievedAt: q(req, "achievedAt", ""),
        ageText: q(req, "ageText", ""),
        locale,
        size,
      });
    } else if (type === "growth") {
      element = GrowthCard({
        childName: q(req, "childName", locale === "en" ? "Baby" : "寶貝"),
        ageText: q(req, "ageText", ""),
        date: q(req, "date", ""),
        weightKg: qn(req, "weight"),
        heightCm: qn(req, "height"),
        headCm: qn(req, "head"),
        percentileWeight: qn(req, "pWeight"),
        percentileHeight: qn(req, "pHeight"),
        percentileHead: qn(req, "pHead"),
        locale,
        size,
      });
    } else if (type === "scan") {
      let nutrients: Array<{ key: string; label: string; pct: number }> = [];
      try {
        const raw = q(req, "nutrients", "[]");
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          nutrients = parsed
            .filter(
              (item: unknown): item is [string, string, number] =>
                Array.isArray(item) &&
                item.length === 3 &&
                typeof item[0] === "string" &&
                typeof item[1] === "string" &&
                typeof item[2] === "number",
            )
            .map(([key, label, pct]) => ({ key, label, pct }));
        }
      } catch {
        /* fall through to empty */
      }

      element = ScanCard({
        childName: q(req, "childName", locale === "en" ? "Baby" : "寶貝"),
        ageText: q(req, "ageText", ""),
        nutrients,
        locale,
        size,
      });
    } else {
      return new Response("Unknown card type", { status: 400 });
    }

    return new ImageResponse(element, {
      width: dims.width,
      height: dims.height,
    });
  } catch (err) {
    console.error("[og] handler error", err);
    const message = err instanceof Error ? err.message : String(err);
    return new Response(`OG render failed: ${message}`, { status: 500 });
  }
}
