"use client";

import { useRef } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { usePathname } from "next/navigation";
import { useScanIntakeStore } from "@/stores/scanIntakeStore";

const NAV_TABS = [
  { key: "home" as const, href: "/app" as const, exact: true },
  { key: "history" as const, href: "/app/scan/history" as const, exact: false },
  { key: "more" as const, href: "/app/more" as const, exact: false },
] as const;

function HomeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

const TAB_ICONS = {
  home: HomeIcon,
  history: ClockIcon,
  more: GridIcon,
} as const;

export function BottomNav() {
  useLocale(); // ensure locale context is available for Link
  const t = useTranslations("Nav");
  const pathname = usePathname();
  const router = useRouter();
  const cleanPath = pathname.replace(/^\/(zh-TW|en)/, "") || "/";

  const setPendingFile = useScanIntakeStore((s) => s.setPendingFile);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function isActive(tab: (typeof NAV_TABS)[number]): boolean {
    if (tab.exact) return cleanPath === tab.href;
    if (tab.key === "history") return cleanPath.startsWith("/app/scan/history");
    return cleanPath.startsWith(tab.href);
  }

  // Scan tab is "active" when on the scan page (not history)
  const scanActive =
    cleanPath === "/app/scan" ||
    (cleanPath.startsWith("/app/scan/") && !cleanPath.startsWith("/app/scan/history"));

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file later
    if (!file) return;
    setPendingFile(file);
    if (!scanActive) router.push("/app/scan");
  }

  function renderLinkTab(tab: (typeof NAV_TABS)[number]) {
    const active = isActive(tab);
    const Icon = TAB_ICONS[tab.key];
    return (
      <Link
        key={tab.key}
        href={tab.href}
        className={`flex flex-col items-center gap-0.5 min-w-0 px-3 py-1 transition-colors ${
          active ? "text-peach-deep" : "text-ink-faded hover:text-ink-soft"
        }`}
      >
        <div className="p-1">
          <Icon />
        </div>
        <span className="text-[10px] font-medium leading-none">{t(tab.key)}</span>
      </Link>
    );
  }

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-50 bg-white/95 backdrop-blur-md border-t border-border"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="max-w-xl mx-auto flex items-center justify-around px-2 py-2">
        {renderLinkTab(NAV_TABS[0])}

        {/* Scan tab — tap opens the device's native photo picker immediately */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handlePhotoChange}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className={`flex flex-col items-center gap-0.5 min-w-0 px-3 py-1 transition-colors ${
            scanActive ? "text-peach-deep" : "text-ink-faded hover:text-ink-soft"
          }`}
        >
          <div className="bg-peach/20 rounded-full p-2">
            <CameraIcon />
          </div>
          <span className="text-[10px] font-medium leading-none">{t("scan")}</span>
        </button>

        {renderLinkTab(NAV_TABS[1])}
        {renderLinkTab(NAV_TABS[2])}
      </div>
    </nav>
  );
}
