"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { usePathname } from "next/navigation";

const TABS = [
  { key: "home" as const, href: "/app" as const, exact: true },
  { key: "scan" as const, href: "/app/scan" as const, exact: false },
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

const ICONS = {
  home: HomeIcon,
  scan: CameraIcon,
  history: ClockIcon,
  more: GridIcon,
} as const;

export function BottomNav() {
  useLocale(); // ensure locale context is available for Link
  const t = useTranslations("Nav");
  const pathname = usePathname();
  const cleanPath = pathname.replace(/^\/(zh-TW|en)/, "") || "/";

  function isActive(tab: (typeof TABS)[number]): boolean {
    if (tab.exact) return cleanPath === tab.href;
    // Check history before scan since /app/scan/history startsWith /app/scan
    if (tab.key === "history") return cleanPath.startsWith("/app/scan/history");
    if (tab.key === "scan") return cleanPath === "/app/scan" || cleanPath.startsWith("/app/scan/") && !cleanPath.startsWith("/app/scan/history");
    return cleanPath.startsWith(tab.href);
  }

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-50 bg-white/95 backdrop-blur-md border-t border-border"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="max-w-xl mx-auto flex items-center justify-around px-2 py-2">
        {TABS.map((tab) => {
          const active = isActive(tab);
          const Icon = ICONS[tab.key];
          const isScan = tab.key === "scan";

          return (
            <Link
              key={tab.key}
              href={tab.href}
              className={`flex flex-col items-center gap-0.5 min-w-0 px-3 py-1 transition-colors ${
                active ? "text-peach-deep" : "text-ink-faded hover:text-ink-soft"
              }`}
            >
              <div className={isScan ? "bg-peach/20 rounded-full p-2" : "p-1"}>
                <Icon />
              </div>
              <span className="text-[10px] font-medium leading-none">
                {t(tab.key)}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
