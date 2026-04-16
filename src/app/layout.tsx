import type { Metadata } from "next";
import { Fredoka, Geist_Mono, Noto_Sans_TC } from "next/font/google";
import "./globals.css";

const fredoka = Fredoka({
  variable: "--font-fredoka",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const notoTc = Noto_Sans_TC({
  variable: "--font-noto-tc",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Nibble · 寶貝小口",
  description:
    "拍一張照片，Nibble 用 AI 分析寶寶每一餐的鐵、鋅、鈣，告訴你補夠沒。給 6 個月到 4 歲寶寶的專屬營養管家。",
  keywords: [
    "baby nutrition",
    "toddler nutrition",
    "寶寶副食品",
    "寶寶營養",
    "AI 營養分析",
    "BLW",
    "副食品",
    "兒童營養追蹤",
  ],
  openGraph: {
    title: "Nibble · 寶貝小口",
    description: "拍一張照片，Nibble 用 AI 告訴你寶寶今天吃夠了沒。",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-TW"
      className={`${fredoka.variable} ${notoTc.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-cream text-ink">{children}</body>
    </html>
  );
}
