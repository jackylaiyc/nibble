import { NextRequest, NextResponse } from "next/server";
import { runBarcodeCascade } from "@/lib/nutrition/barcodeCascade";

/**
 * POST /api/barcode
 *
 * Body:   { barcode: string }
 * Return: { found: true, food, barcode, brand?, servingText?, source, resolvedName? }
 *         | { found: false }
 *
 * Runs the free cascade (OpenFoodFacts → UPCitemDB → Rakuten → OFF name search).
 * The client doesn't call any of these sources directly — Rakuten blocks
 * cross-origin browser requests, and concentrating the logic here lets us
 * swap sources later without touching the UI.
 *
 * Never throws on a source failure — individual tiers are wrapped and
 * skipped gracefully. We only return 5xx for internal issues (bad body, etc.).
 */

interface RequestBody {
  barcode?: string;
}

export async function POST(request: NextRequest) {
  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const barcode = (body.barcode ?? "").trim();
  // EAN-13 / UPC-A / EAN-8 are 8–14 digits. Be strict to avoid hammering
  // upstream APIs with junk.
  if (!/^\d{8,14}$/.test(barcode)) {
    return NextResponse.json(
      { error: "barcode must be 8–14 digits" },
      { status: 400 },
    );
  }

  const hit = await runBarcodeCascade(barcode);
  if (!hit) {
    console.info(`[barcode] miss: ${barcode}`);
    return NextResponse.json({ found: false });
  }

  console.info(`[barcode] hit ${barcode} via ${hit.source}`);
  return NextResponse.json({
    found: true,
    food: hit.food,
    barcode: hit.barcode,
    brand: hit.brand,
    servingText: hit.servingText,
    source: hit.source,
    resolvedName: hit.resolvedName,
  });
}
