/**
 * Landing-page demo animation — a CSS-driven phone mockup that loops
 * through Nibble's core flow:
 *
 *   1. 📸 Camera viewfinder
 *   2. 🥗 Photo taken (with shutter flash)
 *   3. ✨ "AI is analyzing…"
 *   4. 🎯 Results: 3 RDA rings filling up + "Today's targets ✓" badge
 *
 * Total loop length is 14 seconds. Each stage's opacity timing lives in
 * `globals.css` (`@keyframes nibble-stage-1..4`). The component is pure
 * presentation — no state, no client interactivity — so it can render as
 * a server component inside the marketing page.
 *
 * Designed as a holdover until a real screen-recorded demo video lives
 * at `/public/nibble-demo.mp4`. To swap, replace the `<LandingDemoAnimation />`
 * usage with a `<video>` element pointing at that file.
 */

interface Props {
  locale: "en" | "zh-TW";
}

export function LandingDemoAnimation({ locale }: Props) {
  const L = (en: string, zh: string) => (locale === "en" ? en : zh);

  return (
    <div
      className="relative mx-auto w-full max-w-[300px] aspect-[9/19] select-none"
      role="img"
      aria-label={L(
        "Animated demo of Nibble: snap a meal, see nutrient breakdown, hit your daily targets.",
        "Nibble 動畫示範：拍下餐點、查看營養分析、追蹤每日目標。",
      )}
    >
      {/* Phone frame — outer bezel + notch */}
      <div className="absolute inset-0 rounded-[2.25rem] bg-ink shadow-2xl p-[6px]">
        <div className="relative h-full w-full rounded-[2rem] bg-cream overflow-hidden">
          {/* Notch */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-20 h-5 bg-ink rounded-b-2xl z-30" />

          {/* Status bar (purely cosmetic — gives the phone a real feel) */}
          <div className="absolute top-1.5 left-0 right-0 px-5 z-20 flex items-center justify-between text-[10px] text-ink-soft tabular-nums">
            <span>9:41</span>
            <span aria-hidden>●●●● 100%</span>
          </div>

          {/* Stage stack — all four stages are layered absolutely. Their
              CSS animations drive opacity to fade between them. */}
          <div className="absolute inset-0 pt-8 pb-10 px-5 flex flex-col">
            {/* Stage 1: viewfinder */}
            <div
              className="absolute inset-0 pt-10 pb-12 px-5 flex flex-col items-center justify-between"
              style={{ animation: "nibble-stage-1 14s infinite ease-in-out" }}
            >
              <div className="text-xs font-medium text-ink-soft pt-2">
                {L("📸 Tap to capture meal", "📸 點擊拍下餐點")}
              </div>
              <div className="relative flex-1 w-full mx-auto flex items-center justify-center">
                {/* Camera-style crosshair */}
                <div className="absolute inset-x-2 inset-y-6 border-2 border-dashed border-peach-deep/50 rounded-2xl" />
                <div className="text-7xl opacity-60">🍽️</div>
              </div>
              {/* Shutter button */}
              <div className="size-14 rounded-full bg-white border-4 border-ink shadow-md mb-2" />
            </div>

            {/* Camera flash overlay between stage 1 and stage 2 */}
            <div
              className="absolute inset-0 bg-white pointer-events-none z-20"
              style={{ animation: "nibble-flash 14s infinite ease-out" }}
            />

            {/* Stage 2: photo taken */}
            <div
              className="absolute inset-0 pt-10 pb-12 px-5 flex flex-col items-center justify-center gap-4"
              style={{ animation: "nibble-stage-2 14s infinite ease-in-out" }}
            >
              <div className="rounded-3xl bg-butter/40 p-6 card-pop w-full max-w-[200px] aspect-square flex items-center justify-center">
                <div className="text-5xl leading-none flex flex-wrap gap-1 justify-center">
                  <span>🥑</span>
                  <span>🥕</span>
                  <span>🥚</span>
                  <span>🍞</span>
                </div>
              </div>
              <p className="text-sm font-display font-semibold text-ink">
                {L("Photo uploaded ✓", "已上傳 ✓")}
              </p>
            </div>

            {/* Stage 3: analyzing */}
            <div
              className="absolute inset-0 pt-10 pb-12 px-5 flex flex-col items-center justify-center gap-5"
              style={{ animation: "nibble-stage-3 14s infinite ease-in-out" }}
            >
              <div className="rounded-3xl bg-butter/30 p-5 w-full max-w-[200px] aspect-square flex items-center justify-center opacity-50">
                <div className="text-4xl leading-none flex flex-wrap gap-1 justify-center">
                  <span>🥑</span>
                  <span>🥕</span>
                  <span>🥚</span>
                  <span>🍞</span>
                </div>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div className="flex gap-1.5" aria-hidden>
                  {[0, 0.15, 0.3].map((delay, i) => (
                    <span
                      key={i}
                      className="size-2 rounded-full bg-peach-deep"
                      style={{
                        animation: "nibble-dot-pulse 1s infinite ease-in-out",
                        animationDelay: `${delay}s`,
                      }}
                    />
                  ))}
                </div>
                <p className="text-sm font-display font-semibold text-ink">
                  {L("AI is analyzing…", "AI 分析中⋯⋯")}
                </p>
              </div>
            </div>

            {/* Stage 4: results — 3 rings + badge */}
            <div
              className="absolute inset-0 pt-10 pb-10 px-4 flex flex-col items-center"
              style={{ animation: "nibble-stage-4 14s infinite ease-in-out" }}
            >
              <p className="text-xs font-medium text-ink-faded mb-2">
                {L("Today's nutrition", "今日營養")}
              </p>
              <div className="rounded-2xl bg-butter/40 p-2 mb-3 w-20 h-20 flex items-center justify-center">
                <div className="text-2xl leading-none flex flex-wrap gap-0.5 justify-center">
                  <span>🥑</span>
                  <span>🥕</span>
                  <span>🥚</span>
                  <span>🍞</span>
                </div>
              </div>
              <div className="flex gap-3 mt-1">
                <DemoRing
                  emoji="⚙️"
                  label={L("Iron", "鐵")}
                  pct={72}
                  color="#6fb38a"
                  animationName="nibble-ring-iron"
                />
                <DemoRing
                  emoji="🦴"
                  label={L("Calcium", "鈣")}
                  pct={91}
                  color="#a8d5ba"
                  animationName="nibble-ring-calcium"
                />
                <DemoRing
                  emoji="🐟"
                  label="DHA"
                  pct={48}
                  color="#86b7e8"
                  animationName="nibble-ring-dha"
                />
              </div>
              {/* Bottom badge — pops in late in stage 4 to deliver the
                  emotional payoff: "you did it." */}
              <div
                className="mt-auto inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-sage/40 border border-sage-deep/40 text-xs font-semibold text-sage-deep"
                style={{ animation: "nibble-badge-pop 14s infinite ease-out" }}
              >
                <span>✅</span>
                <span>{L("Today's targets", "今日目標進度")}</span>
              </div>
            </div>
          </div>

          {/* Loop progress strip — visual cue that the animation is moving */}
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-border/40 z-30">
            <div
              className="h-full bg-peach-deep origin-left"
              style={{
                animation: "nibble-progress 14s infinite linear",
                transformOrigin: "left center",
              }}
            />
          </div>
        </div>
      </div>

      {/* Soft glow under the phone for product-shot feel */}
      <div
        className="absolute -bottom-6 left-1/2 -translate-x-1/2 w-3/4 h-12 rounded-full bg-peach/40 blur-2xl -z-10"
        aria-hidden
      />
    </div>
  );
}

/**
 * One animated RDA ring — background circle + foreground circle whose
 * stroke-dashoffset animates per the named keyframe (defined in
 * globals.css). The percentage is hardcoded in the keyframe; the prop
 * here is just the label so callers can match.
 */
function DemoRing({
  emoji,
  label,
  pct,
  color,
  animationName,
}: {
  emoji: string;
  label: string;
  pct: number;
  color: string;
  animationName: "nibble-ring-iron" | "nibble-ring-calcium" | "nibble-ring-dha";
}) {
  const r = 22;
  const c = 2 * Math.PI * r; // ≈ 138.23

  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="relative size-14">
        <svg viewBox="0 0 60 60" className="size-14 -rotate-90">
          <circle
            cx="30"
            cy="30"
            r={r}
            stroke="#f0e6d2"
            strokeWidth="6"
            fill="none"
          />
          <circle
            cx="30"
            cy="30"
            r={r}
            stroke={color}
            strokeWidth="6"
            strokeLinecap="round"
            fill="none"
            strokeDasharray={c}
            strokeDashoffset={c}
            style={{
              animation: `${animationName} 14s infinite ease-out`,
            }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-base">
          {emoji}
        </div>
      </div>
      <div className="text-[9px] font-medium text-ink-faded leading-none">
        {label}
      </div>
      <div
        className="text-[10px] font-display font-bold leading-none"
        style={{ color }}
      >
        {pct}%
      </div>
    </div>
  );
}
