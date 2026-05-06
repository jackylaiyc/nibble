"use client";

import { useState } from "react";
import { useLocale } from "next-intl";
import type { OgSize } from "@/lib/share/ogTemplates";

/**
 * Share-card button.
 *
 * Builds a /api/og URL from the given params, fetches the PNG as a Blob,
 * then hands it off to `navigator.share({ files: [...] })` (native share
 * sheet on iOS Safari and Android Chrome). Falls back to triggering a
 * download on desktop / browsers without Web Share Level 2.
 *
 * Intentionally free of business logic — callers pass in whatever the
 * OG endpoint accepts. Currently only used for plate-scan share cards.
 */

type ShareParams = Record<string, string | number | undefined>;

export function ShareCardButton({
  type,
  params,
  label,
  size = "square",
  filename = "nibble-card.png",
  className = "",
}: {
  type: "scan";
  params: ShareParams;
  label: string;
  size?: OgSize;
  filename?: string;
  className?: string;
}) {
  const locale = useLocale() as "en" | "zh-TW";
  const [busy, setBusy] = useState(false);

  async function onClick() {
    if (busy) return;
    setBusy(true);
    try {
      const qs = new URLSearchParams();
      qs.set("type", type);
      qs.set("locale", locale);
      qs.set("size", size);
      for (const [k, v] of Object.entries(params)) {
        if (v === undefined || v === "") continue;
        qs.set(k, String(v));
      }
      const url = `/api/og?${qs.toString()}`;

      const res = await fetch(url);
      if (!res.ok) throw new Error(`OG fetch failed: ${res.status}`);
      const blob = await res.blob();
      const file = new File([blob], filename, { type: "image/png" });

      // Web Share Level 2 — iOS Safari + modern Android Chrome support this.
      const navAny = navigator as Navigator & {
        canShare?: (data: ShareData) => boolean;
      };
      if (navAny.canShare && navAny.canShare({ files: [file] })) {
        await navigator.share({ files: [file] });
      } else {
        // Fallback: trigger a download.
        const objUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = objUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(objUrl);
      }
    } catch (err) {
      // navigator.share throws AbortError when the user cancels — swallow
      // that specific case silently; surface anything else.
      if (
        typeof err === "object" &&
        err !== null &&
        "name" in err &&
        (err as { name?: string }).name === "AbortError"
      ) {
        return;
      }
      console.error("[ShareCardButton]", err);
      alert(locale === "en" ? "Sharing failed" : "分享失敗");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={`inline-flex items-center gap-2 font-semibold rounded-full transition disabled:opacity-50 ${className}`}
    >
      <span>📤</span>
      <span>{busy ? (locale === "en" ? "Preparing…" : "準備中⋯⋯") : label}</span>
    </button>
  );
}
