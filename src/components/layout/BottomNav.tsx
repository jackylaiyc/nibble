"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { usePathname } from "next/navigation";
import { ScanSourceSheet } from "@/components/scan/ScanSourceSheet";

// Bottom nav order (left → right): AI · Scan · History · Account.
// The "scan" slot is rendered separately (it's a button that opens a
// bottom sheet, not a Link), so this list only carries the three Link
// tabs that bookend it.
const NAV_TABS = [
  { key: "ai" as const, href: "/app/chat" as const, exact: false },
  { key: "history" as const, href: "/app/scan/history" as const, exact: false },
  { key: "account" as const, href: "/app/more" as const, exact: false },
] as const;

function ChatIcon() {
  // Speech bubble with three dots — universal "AI / chat" affordance.
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <circle cx="8" cy="10" r="0.6" fill="currentColor" />
      <circle cx="12" cy="10" r="0.6" fill="currentColor" />
      <circle cx="16" cy="10" r="0.6" fill="currentColor" />
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

function PersonIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

const TAB_ICONS = {
  ai: ChatIcon,
  history: ClockIcon,
  account: PersonIcon,
} as const;

export function BottomNav() {
  const locale = useLocale() as "zh-TW" | "en";
  const t = useTranslations("Nav");
  const pathname = usePathname();
  const cleanPath = pathname.replace(/^\/(zh-TW|en)/, "") || "/";

  const [scanSheetOpen, setScanSheetOpen] = useState(false);

  function isActive(tab: (typeof NAV_TABS)[number]): boolean {
    if (tab.exact) return cleanPath === tab.href;
    // Each non-exact tab activates anywhere within its destination
    // tree — chat sub-pages, history, account/more sub-pages.
    return cleanPath.startsWith(tab.href);
  }

  // Scan tab is "active" when on the scan page (not history)
  const scanActive =
    cleanPath === "/app/scan" ||
    (cleanPath.startsWith("/app/scan/") && !cleanPath.startsWith("/app/scan/history"));

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
    <>
      <nav
        className="fixed bottom-0 inset-x-0 z-50 bg-white/95 backdrop-blur-md border-t border-border"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="max-w-xl mx-auto flex items-center justify-around px-2 py-2">
          {/* Order left → right: AI · Scan · History · Account */}
          {renderLinkTab(NAV_TABS[0])}

          {/* Scan slot — opens the ScanSourceSheet to pick photo / barcode / search */}
          <button
            type="button"
            onClick={() => setScanSheetOpen(true)}
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

      <ScanSourceSheet
        open={scanSheetOpen}
        locale={locale}
        onClose={() => setScanSheetOpen(false)}
      />
    </>
  );
}
