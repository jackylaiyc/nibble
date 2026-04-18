"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { lookupBarcode, type BarcodeLookupResult } from "@/lib/nutrition/barcodeLookup";
import { useScanIntakeStore } from "@/stores/scanIntakeStore";

/**
 * Barcode scanner page. Uses html5-qrcode to stream camera video and decode
 * EAN/UPC codes. On a successful scan we look the code up against OpenFoodFacts,
 * stash the parsed food in scanIntakeStore, and route to /app/scan for the
 * usual review-and-save flow.
 *
 * The html5-qrcode library is dynamically imported so it doesn't bloat the
 * main bundle for users who never use barcode scanning.
 */

type Phase =
  | "idle"
  | "scanning"
  | "looking-up"
  | "not-found"
  | "parsing-label"
  | "error";

export default function BarcodeScanPage() {
  const locale = useLocale() as "zh-TW" | "en";
  const router = useRouter();
  const setPendingFoods = useScanIntakeStore((s) => s.setPendingFoods);

  const containerRef = useRef<HTMLDivElement | null>(null);
  // We keep the scanner instance in a ref — its type depends on the dynamic
  // import so we can't name it cleanly here; `unknown` + a cleanup helper
  // keeps TypeScript happy without importing the type at build time.
  const scannerRef = useRef<unknown>(null);
  const decodingRef = useRef(false);
  const labelInputRef = useRef<HTMLInputElement | null>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [lastCode, setLastCode] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");

  const L = (en: string, zh: string) => (locale === "en" ? en : zh);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        const mod = await import("html5-qrcode");
        const { Html5Qrcode } = mod;
        if (cancelled || !containerRef.current) return;

        const scanner = new Html5Qrcode("nibble-barcode-reader");
        scannerRef.current = scanner;
        setPhase("scanning");

        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: { width: 280, height: 180 },
          },
          (decodedText) => {
            void handleCode(decodedText, scanner);
          },
          () => {
            // Decode errors fire constantly while no code is in frame.
            // Intentional no-op.
          },
        );
      } catch (err) {
        if (cancelled) return;
        console.error("[barcode] init failed:", err);
        setErrorMsg(
          err instanceof Error
            ? err.message
            : L("Camera unavailable", "相機無法使用"),
        );
        setPhase("error");
      }
    }

    void start();

    return () => {
      cancelled = true;
      stopScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function stopScanner() {
    const s = scannerRef.current as
      | { stop: () => Promise<void>; clear: () => void; isScanning?: boolean }
      | null;
    if (!s) return;
    try {
      if (s.isScanning) await s.stop();
      s.clear();
    } catch {
      // ignore — unmounting anyway
    }
    scannerRef.current = null;
  }

  async function handleCode(
    code: string,
    scanner: { stop: () => Promise<void>; isScanning?: boolean },
  ) {
    // Debounce — html5-qrcode fires rapidly when a barcode stays in frame.
    if (decodingRef.current) return;
    decodingRef.current = true;
    setLastCode(code);
    setPhase("looking-up");
    try {
      if (scanner.isScanning) await scanner.stop();
    } catch {
      /* ignore */
    }

    let result: BarcodeLookupResult | null = null;
    try {
      result = await lookupBarcode(code);
    } catch (err) {
      console.error("[barcode] lookup failed:", err);
      setErrorMsg(
        err instanceof Error ? err.message : L("Lookup failed", "查詢失敗"),
      );
      setPhase("error");
      decodingRef.current = false;
      return;
    }

    if (!result) {
      setPhase("not-found");
      decodingRef.current = false;
      return;
    }

    setPendingFoods([result.food]);
    router.push("/app/scan");
  }

  async function rescan() {
    decodingRef.current = false;
    setPhase("idle");
    setErrorMsg("");
    // Force a remount of the scanner by bouncing through idle — simpler than
    // managing restart state here. The useEffect re-runs on nothing though,
    // so we just reload the page as the most reliable restart.
    window.location.reload();
  }

  async function onLabelPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setPhase("parsing-label");
    setErrorMsg("");

    let dataUrl: string;
    try {
      dataUrl = await compressToDataUrl(file);
    } catch (err) {
      console.error("[barcode] compress failed:", err);
      setErrorMsg(
        err instanceof Error ? err.message : L("Image read failed", "圖片處理失敗"),
      );
      setPhase("error");
      return;
    }

    const commaIdx = dataUrl.indexOf(",");
    const base64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;

    let data: { found: boolean; food?: import("@/stores/mealStore").FoodItem; reason?: string };
    try {
      const res = await fetch("/api/ai/nutrition-label", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: base64,
          mimeType: "image/jpeg",
          barcode: lastCode || undefined,
        }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`${res.status}: ${txt.slice(0, 120)}`);
      }
      data = (await res.json()) as {
        found: boolean;
        food?: import("@/stores/mealStore").FoodItem;
        reason?: string;
      };
    } catch (err) {
      console.error("[barcode] label OCR failed:", err);
      setErrorMsg(
        err instanceof Error ? err.message : L("Label read failed", "標籤辨識失敗"),
      );
      setPhase("error");
      return;
    }

    if (!data.found || !data.food) {
      setErrorMsg(
        data.reason ??
          L("Couldn't read the label — try a clearer photo.", "無法讀取標籤，請換張清楚的照片。"),
      );
      setPhase("error");
      return;
    }

    setPendingFoods([data.food]);
    router.push("/app/scan");
  }

  return (
    <main className="min-h-screen bg-black text-white flex flex-col">
      <header className="flex items-center justify-between px-5 py-4 bg-black/70 backdrop-blur-sm z-10">
        <Link
          href="/app"
          className="text-white/80 hover:text-white flex items-center gap-2"
          onClick={() => void stopScanner()}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          <span className="text-sm font-medium">
            {L("Back", "返回")}
          </span>
        </Link>
        <p className="text-sm font-semibold">{L("Scan barcode", "掃描條碼")}</p>
        <span className="w-12" />
      </header>

      <div className="relative flex-1 flex items-center justify-center">
        {/* The html5-qrcode library mounts the camera stream inside this div. */}
        <div
          id="nibble-barcode-reader"
          ref={containerRef}
          className="w-full h-full"
        />

        {/* Centered aiming frame + status text */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="w-[280px] h-[180px] border-2 border-white/80 rounded-lg shadow-[0_0_0_2000px_rgba(0,0,0,0.35)]" />
        </div>

        <div className="absolute bottom-8 inset-x-0 flex flex-col items-center gap-3 px-6 text-center">
          {phase === "scanning" && (
            <p className="text-sm text-white/90 bg-black/50 rounded-full px-4 py-2">
              {L("Point the camera at a barcode", "請對準商品條碼")}
            </p>
          )}
          {phase === "looking-up" && (
            <p className="text-sm text-white/90 bg-black/50 rounded-full px-4 py-2">
              {L(`Looking up ${lastCode}…`, `查詢 ${lastCode}⋯`)}
            </p>
          )}
          {phase === "parsing-label" && (
            <p className="text-sm text-white/90 bg-black/50 rounded-full px-4 py-2">
              {L("Reading the nutrition label…", "正在讀取營養標籤⋯")}
            </p>
          )}
          {phase === "not-found" && (
            <div className="bg-white rounded-bubble p-4 text-ink text-sm max-w-sm">
              <p className="font-semibold mb-1">
                {L("Not found in database", "資料庫找不到這個商品")}
              </p>
              <p className="text-ink-soft text-xs mb-3">
                {L(
                  `Barcode ${lastCode}. Snap the nutrition label on the back of the package — we'll read it for you.`,
                  `條碼 ${lastCode}。拍一下包裝背面的營養標籤，我們幫你讀。`,
                )}
              </p>
              <button
                type="button"
                onClick={() => labelInputRef.current?.click()}
                className="w-full mb-2 py-2.5 rounded-full bg-peach-deep text-white text-sm font-semibold"
              >
                📷 {L("Snap nutrition label", "拍營養標籤")}
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={rescan}
                  className="flex-1 py-2 rounded-full border border-border text-ink-soft text-sm font-medium"
                >
                  {L("Scan again", "重新掃描")}
                </button>
                <Link
                  href="/app"
                  className="flex-1 py-2 rounded-full border border-border text-ink-soft text-sm font-medium text-center"
                  onClick={() => void stopScanner()}
                >
                  {L("Cancel", "取消")}
                </Link>
              </div>
            </div>
          )}
          {phase === "error" && (
            <div className="bg-white rounded-bubble p-4 text-ink text-sm max-w-sm">
              <p className="font-semibold mb-1">
                {L("Something went wrong", "出了點問題")}
              </p>
              <p className="text-ink-soft text-xs mb-3">{errorMsg}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => labelInputRef.current?.click()}
                  className="flex-1 py-2 rounded-full bg-peach-deep text-white text-sm font-semibold"
                >
                  📷 {L("Try label", "改用標籤")}
                </button>
                <Link
                  href="/app"
                  className="flex-1 py-2 rounded-full border border-border text-ink-soft text-sm font-medium text-center"
                >
                  {L("Back", "返回")}
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Hidden input for the label-OCR fallback. Uses the device's native
          picker (camera or library) — same pattern as the dashboard scan CTA. */}
      <input
        ref={labelInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onLabelPhoto}
      />
    </main>
  );
}

// ─── helpers ────────────────────────────────────────────────────────────────

/**
 * Resize + re-encode a picked photo to ~800px JPEG at 70% quality. Keeps
 * the payload to Gemini small (~150-300 KB) regardless of phone camera
 * resolution, which makes OCR faster and cheaper.
 */
function compressToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      if (typeof dataUrl !== "string") {
        reject(new Error("Reader returned non-string"));
        return;
      }
      const img = new Image();
      img.onload = () => {
        const maxEdge = 1200; // labels need a bit more detail than plates
        const ratio = Math.min(1, maxEdge / Math.max(img.width, img.height));
        const w = Math.round(img.width * ratio);
        const h = Math.round(img.height * ratio);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        try {
          resolve(canvas.toDataURL("image/jpeg", 0.8));
        } catch {
          resolve(dataUrl);
        }
      };
      img.onerror = () => reject(new Error("Image decode failed"));
      img.src = dataUrl;
    };
    reader.onerror = () => reject(reader.error ?? new Error("Reader error"));
    reader.readAsDataURL(file);
  });
}
