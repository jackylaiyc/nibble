import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import {
  OG_SIZES,
  ScanCard,
  type Locale,
  type OgSize,
} from "@/lib/share/ogTemplates";

/**
 * Dynamic share-card endpoint.
 *
 * GET /api/og?type=scan&childName=小豆&ageText=9m&nutrients=[["iron","Iron",72],…]
 *              &locale=zh-TW&size=og
 *
 * Runtime: "nodejs" (the default for route handlers) — @vercel/og ships
 * a Node build that handles Satori + PNG encoding in-process. Edge runtime
 * is also supported and is preferred for prod cache behaviour, but it
 * has intermittent compile issues in Next 16 dev; we'll flip the toggle
 * at deploy time.
 *
 * Only `type=scan` is supported now — milestone/growth share cards were
 * removed when those features were stripped from the app.
 */

function q(req: NextRequest, key: string, fallback = ""): string {
  return req.nextUrl.searchParams.get(key) ?? fallback;
}

function coerceLocale(raw: string): Locale {
  return raw === "en" ? "en" : "zh-TW";
}

function coerceSize(raw: string): OgSize {
  return raw === "square" ? "square" : "og";
}

export async function GET(req: NextRequest) {
  try {
    const type = q(req, "type", "scan");
    const locale = coerceLocale(q(req, "locale", "zh-TW"));
    const size = coerceSize(q(req, "size", "og"));
    const dims = OG_SIZES[size];

    if (type !== "scan") {
      return new Response("Unknown card type", { status: 400 });
    }

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

    const element: React.ReactElement = ScanCard({
      childName: q(req, "childName", locale === "en" ? "Baby" : "寶貝"),
      ageText: q(req, "ageText", ""),
      nutrients,
      locale,
      size,
    });

    return new ImageResponse(element, {
      width: dims.width,
      height: dims.height,
    });
  } catch (err) {
    // Log the full error server-side; never echo internals to the client.
    // OG cards are also fetched by social media crawlers, so leaks would
    // surface in their cached error pages.
    console.error("[og] handler error", err);
    return new Response("OG render failed", { status: 500 });
  }
}
