"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { useChildProfileStore } from "@/stores/childProfileStore";
import { useSubscriptionStore } from "@/stores/subscriptionStore";
import { useUsageStore } from "@/stores/usageStore";
import {
  useChatStore,
  type ChatMessage,
  type ChatToolCall,
  type DisclaimerLevel,
} from "@/stores/chatStore";
import { limitsFor } from "@/lib/pricing/plans";
import { PaywallModal } from "@/components/paywall/PaywallModal";
import { ageInfoFromDob } from "@/lib/pediatric/ageBucket";

/**
 * Ask Nibble — the conversational half of the hero pair (scan + chat).
 *
 * Thin client: we keep the thread in chatStore, ship the last-N turns to
 * /api/ai/chat for each send, and render whatever comes back. The route
 * already enforces three layers of legal defense (system prompt refusals,
 * keyword-based disclaimer shaping, emergency banner) — our job here is
 * just to surface those signals clearly to the caregiver.
 *
 * Tool calls arrive as metadata on assistant messages. We don't actually
 * execute the log from chat yet (that waits until Supabase-backed stores);
 * instead we show a "Nibble wants to log this for you — open the form"
 * card that deep-links to the matching log page. This keeps the UX honest
 * ("I heard you, tap here to confirm") without pretending we wrote data
 * we haven't.
 */

// ─── tool-call routing ────────────────────────────────────────────────────

const TOOL_ROUTE_MAP: Record<
  string,
  { href: "/app/scan" | "/app/poop/log" | "/app/sleep" | "/app/milestones" | "/app/reactions" | "/app/growth"; labelEn: string; labelZh: string; emoji: string }
> = {
  log_meal:      { href: "/app/scan",       labelEn: "Log this meal",     labelZh: "去記錄這餐",   emoji: "📸" },
  log_poop:      { href: "/app/poop/log",   labelEn: "Log the diaper",    labelZh: "去記錄便便",   emoji: "💩" },
  log_sleep:     { href: "/app/sleep",      labelEn: "Log sleep",         labelZh: "去記錄睡眠",   emoji: "😴" },
  log_milestone: { href: "/app/milestones", labelEn: "Mark milestone",    labelZh: "去勾選里程碑", emoji: "🎉" },
  log_reaction:  { href: "/app/reactions",  labelEn: "Log the reaction",  labelZh: "去記錄反應",   emoji: "⚠️" },
  log_growth:    { href: "/app/growth",     labelEn: "Log measurement",   labelZh: "去記錄測量",   emoji: "📈" },
};

// ─── page ─────────────────────────────────────────────────────────────────

export default function ChatPage() {
  const locale = useLocale() as "zh-TW" | "en";
  const t = useTranslations("Chat");
  const router = useRouter();

  // Hydrate all the stores the chat page needs.
  const loadChildren = useChildProfileStore((s) => s.loadFromStorage);
  const childLoaded = useChildProfileStore((s) => s.loaded);
  const activeChild = useChildProfileStore((s) => s.getActiveChild());

  const loadSub = useSubscriptionStore((s) => s.loadFromStorage);
  const currentPlan = useSubscriptionStore((s) => s.currentPlan);

  const loadUsage = useUsageStore((s) => s.loadFromStorage);
  const recordUsage = useUsageStore((s) => s.record);
  const todayChats = useUsageStore((s) => s.chat);

  const loadChat = useChatStore((s) => s.loadFromStorage);
  const addMessage = useChatStore((s) => s.addMessage);
  const popLastAssistant = useChatStore((s) => s.popLastAssistant);
  const resetThread = useChatStore((s) => s.resetThread);
  // Subscribe to the array directly so the assistant reply appears as soon
  // as it lands. Selecting only the function gave a stable reference and
  // the bubble silently never appeared — that was the "AI doesn't respond"
  // bug from the iPhone smoke test.
  const allMessages = useChatStore((s) => s.messages);

  useEffect(() => {
    loadChildren();
    loadSub();
    loadUsage();
    loadChat();
  }, [loadChildren, loadSub, loadUsage, loadChat]);

  // If no child after hydration, bounce to onboarding — chat without
  // context produces generic Gemini output that isn't what we promise.
  useEffect(() => {
    if (childLoaded && !activeChild) {
      router.replace("/onboarding");
    }
  }, [childLoaded, activeChild, router]);

  const messages = useMemo(
    () =>
      activeChild ? allMessages.filter((m) => m.childId === activeChild.id) : [],
    [activeChild, allMessages],
  );

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paywallOpen, setPaywallOpen] = useState(false);

  // Auto-scroll to bottom as messages arrive. We scroll the sentinel rather
  // than the container so we survive layout jumps from async content.
  const bottomRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, sending]);

  async function send() {
    const text = input.trim();
    if (!text || !activeChild || sending) return;

    // Enforce free-tier daily message cap. Same local-day semantics as scan.
    const plan = currentPlan();
    const cap = limitsFor(plan).chatMessagesPerDay;
    if (Number.isFinite(cap)) {
      const d = new Date();
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const usedToday = todayChats[key] ?? 0;
      if (usedToday >= cap) {
        setPaywallOpen(true);
        return;
      }
    }

    // Build the API turn list BEFORE we add the new message to the store —
    // otherwise the message is included in `messages` and we'd send it twice.
    // We then add the bounded prior + the fresh user turn.
    const priorForApi = messages
      .slice(-19)
      .map((m) => ({ role: m.role, content: m.content }));
    const apiMessages = [...priorForApi, { role: "user" as const, content: text }];

    addMessage({
      childId: activeChild.id,
      role: "user",
      content: text,
    });
    setInput("");
    setSending(true);
    setError(null);

    try {
      const bucket = ageInfoFromDob(activeChild.dob).bucket;
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: apiMessages,
          locale,
          child: {
            name: activeChild.name,
            ageBucket: bucket,
            feedingStyle: activeChild.feedingStyle,
            knownAllergens: activeChild.allergens,
            childId: activeChild.id,
          },
        }),
      });
      if (!res.ok) {
        // Surface the server's actual error so the caregiver knows whether
        // it was rate-limit, network, or a deeper issue. We keep the i18n
        // umbrella message and append the technical hint underneath.
        const detail = await res
          .text()
          .then((t) => {
            try {
              const j = JSON.parse(t) as { error?: string };
              return j.error ?? t;
            } catch {
              return t;
            }
          })
          .catch(() => `HTTP ${res.status}`);
        setError(`${t("error")} (${res.status}: ${detail.slice(0, 120)})`);
        setSending(false);
        return;
      }
      const data = (await res.json()) as {
        text: string;
        toolCall?: ChatToolCall;
        disclaimerLevel: DisclaimerLevel;
        disclaimerText?: string;
      };

      addMessage({
        childId: activeChild.id,
        role: "assistant",
        content: data.text,
        disclaimerLevel: data.disclaimerLevel,
        disclaimerText: data.disclaimerText,
        toolCall: data.toolCall,
      });
      recordUsage("chat");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`${t("error")} (${msg.slice(0, 120)})`);
      popLastAssistant();
    } finally {
      setSending(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    void send();
  }

  function applySuggestion(s: string) {
    setInput(s);
  }

  if (!childLoaded) {
    return (
      <main className="min-h-screen flex items-center justify-center text-ink-faded">
        {locale === "en" ? "Loading…" : "載入中⋯⋯"}
      </main>
    );
  }
  if (!activeChild) {
    return null; // redirect effect will kick in
  }

  const cap = limitsFor(currentPlan()).chatMessagesPerDay;
  const d = new Date();
  const dayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const usedToday = todayChats[dayKey] ?? 0;

  return (
    <main className="min-h-screen flex flex-col bg-cream">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-cream/90 backdrop-blur-md border-b border-border px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <Link href="/app" className="text-ink-soft hover:text-ink">
            ←
          </Link>
          <div className="flex-1 min-w-0">
            <p className="font-display font-semibold text-ink truncate">
              {t("title")}
            </p>
            <p className="text-xs text-ink-faded truncate">
              {t("subFor", { name: activeChild.name })}
            </p>
          </div>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => {
                if (confirm(t("resetConfirm"))) {
                  resetThread(activeChild.id);
                }
              }}
              className="text-xs text-ink-faded hover:text-ink px-3 py-1 rounded-full border border-border"
            >
              {t("reset")}
            </button>
          )}
        </div>
        {Number.isFinite(cap) && (
          <div className="max-w-2xl mx-auto mt-1 text-[11px] text-ink-faded text-right tabular-nums">
            {t("usedToday", { used: usedToday, cap })}
          </div>
        )}
      </header>

      {/* Transcript */}
      <section className="flex-1 px-4 py-5">
        <div className="max-w-2xl mx-auto space-y-4">
          {messages.length === 0 && (
            <EmptyState
              tTitle={t("emptyTitle")}
              tSub={t("emptySub")}
              suggestions={[
                t("suggest1"),
                t("suggest2"),
                t("suggest3"),
                t("suggest4"),
              ]}
              onPick={applySuggestion}
            />
          )}

          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} locale={locale} t={t} />
          ))}

          {sending && <TypingBubble t={t} />}
          {error && (
            <div className="rounded-card border border-peach-deep/40 bg-peach/15 p-3 text-sm text-ink">
              {error}
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </section>

      {/* Composer */}
      <form
        onSubmit={onSubmit}
        className="sticky bottom-0 z-20 border-t border-border bg-white/95 backdrop-blur-md px-4 py-3"
      >
        <div className="max-w-2xl mx-auto flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder={t("inputPlaceholder")}
            rows={1}
            disabled={sending}
            className="flex-1 resize-none rounded-2xl border border-border bg-cream px-4 py-3 text-ink placeholder:text-ink-faded focus:outline-none focus:border-peach-deep disabled:opacity-60"
            style={{ maxHeight: 160 }}
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="shrink-0 rounded-full bg-peach-deep text-white font-semibold px-5 py-3 disabled:opacity-50"
          >
            {sending ? t("sending") : t("send")}
          </button>
        </div>
        <p className="max-w-2xl mx-auto mt-2 text-[11px] text-ink-faded leading-relaxed">
          {t("composerFooter")}
        </p>
      </form>

      <PaywallModal
        open={paywallOpen}
        reason="chat"
        usedToday={usedToday}
        dailyCap={Number.isFinite(cap) ? cap : 0}
        locale={locale}
        onClose={() => setPaywallOpen(false)}
      />
    </main>
  );
}

// ─── subcomponents ────────────────────────────────────────────────────────

function EmptyState({
  tTitle,
  tSub,
  suggestions,
  onPick,
}: {
  tTitle: string;
  tSub: string;
  suggestions: string[];
  onPick: (s: string) => void;
}) {
  return (
    <div className="text-center py-10">
      <div className="text-5xl mb-3">🍎</div>
      <p className="font-display text-xl font-bold text-ink">{tTitle}</p>
      <p className="mt-2 text-sm text-ink-soft max-w-md mx-auto leading-relaxed">
        {tSub}
      </p>
      <div className="mt-6 grid gap-2 max-w-md mx-auto">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            className="text-left text-sm text-ink bg-white border border-border rounded-card px-4 py-3 hover:border-peach-deep hover:bg-peach/10"
          >
            💬 {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  locale,
  t,
}: {
  message: ChatMessage;
  locale: "zh-TW" | "en";
  t: (k: ChatI18nKey, values?: Record<string, string | number>) => string;
}) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-peach-deep text-white px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    );
  }

  // Assistant
  const level = message.disclaimerLevel ?? "none";
  const toolMeta = message.toolCall
    ? TOOL_ROUTE_MAP[message.toolCall.name]
    : undefined;

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] space-y-2">
        {level === "emergency" && (
          <div className="rounded-card bg-red-50 border border-red-200 p-3 text-sm text-red-900">
            <p className="font-semibold">🚨 {t("emergencyTitle")}</p>
            <p className="mt-1">{message.disclaimerText}</p>
          </div>
        )}
        {level === "pediatrician" && (
          <div className="rounded-card bg-peach/30 border border-peach-deep/40 p-3 text-sm text-ink">
            <p className="font-semibold">🩺 {t("pediatricianTitle")}</p>
            <p className="mt-1 text-ink-soft">{message.disclaimerText}</p>
          </div>
        )}

        <div className="rounded-2xl rounded-bl-sm bg-white border border-border px-4 py-2.5 text-[15px] text-ink leading-relaxed whitespace-pre-wrap">
          {message.content}
        </div>

        {toolMeta && (
          <Link
            href={toolMeta.href}
            className="flex items-center gap-3 rounded-card bg-butter/40 border border-butter-deep/60 px-4 py-3 text-sm text-ink hover:bg-butter/60"
          >
            <span className="text-xl">{toolMeta.emoji}</span>
            <span className="flex-1 font-medium">
              {locale === "en" ? toolMeta.labelEn : toolMeta.labelZh}
            </span>
            <span className="text-ink-soft">→</span>
          </Link>
        )}

      </div>
    </div>
  );
}

function TypingBubble({
  t,
}: {
  t: (k: ChatI18nKey) => string;
}) {
  return (
    <div className="flex justify-start">
      <div className="rounded-2xl rounded-bl-sm bg-white border border-border px-4 py-3 text-sm text-ink-soft">
        <span className="inline-flex items-center gap-1">
          <span>{t("thinking")}</span>
          <Dot delay={0} />
          <Dot delay={150} />
          <Dot delay={300} />
        </span>
      </div>
    </div>
  );
}

function Dot({ delay }: { delay: number }) {
  return (
    <span
      className="inline-block size-1.5 rounded-full bg-ink-faded animate-pulse"
      style={{ animationDelay: `${delay}ms` }}
    />
  );
}

type ChatI18nKey =
  | "title"
  | "subFor"
  | "reset"
  | "resetConfirm"
  | "usedToday"
  | "emptyTitle"
  | "emptySub"
  | "suggest1"
  | "suggest2"
  | "suggest3"
  | "suggest4"
  | "inputPlaceholder"
  | "send"
  | "sending"
  | "composerFooter"
  | "thinking"
  | "error"
  | "emergencyTitle"
  | "pediatricianTitle";
