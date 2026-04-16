"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useChildProfileStore } from "@/stores/childProfileStore";
import {
  useGrowthStore,
  type GrowthRecord,
} from "@/stores/growthStore";
import { ageInfoFromDob, monthsBetween } from "@/lib/pediatric/ageBucket";
import {
  lookupLms,
  valueToPercentile,
  type Measure,
  type Sex,
} from "@/lib/pediatric/whoGrowthCurves";

/**
 * Growth tracker.
 *
 * Form accepts kg / cm / cm (any subset). When the WHO LMS tables have
 * been loaded we render a percentile readout next to each latest value
 * and a tiny "pct over time" chart per measure. Until then we still
 * plot the raw values — percentile simply shows em-dash.
 *
 * Child's biological-sex "unspecified" disables percentile math (we don't
 * guess). Raw values still plot.
 */

type ChartRow = {
  date: string;
  ageMonths: number;
  weightKg?: number;
  heightCm?: number;
  headCm?: number;
};

export default function GrowthPage() {
  const locale = useLocale() as "zh-TW" | "en";
  const t = useTranslations("Growth");
  const tCommon = useTranslations("Common");

  const loadChildren = useChildProfileStore((s) => s.loadFromStorage);
  const childLoaded = useChildProfileStore((s) => s.loaded);
  const activeChild = useChildProfileStore((s) => s.getActiveChild());

  const loadG = useGrowthStore((s) => s.loadFromStorage);
  const gLoaded = useGrowthStore((s) => s.loaded);
  const addMeasurement = useGrowthStore((s) => s.addMeasurement);
  const removeMeasurement = useGrowthStore((s) => s.removeMeasurement);
  const getForChild = useGrowthStore((s) => s.getMeasurementsForChild);

  useEffect(() => {
    loadChildren();
    loadG();
  }, [loadChildren, loadG]);

  const [date, setDate] = useState(() => todayKey());
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  const [head, setHead] = useState("");
  const [notes, setNotes] = useState("");

  const entries = useMemo(
    () => (activeChild ? getForChild(activeChild.id) : []),
    [activeChild, getForChild],
  );

  const chartRows: ChartRow[] = useMemo(() => {
    if (!activeChild) return [];
    return entries.map((e) => ({
      date: e.date,
      ageMonths: monthsBetween(new Date(activeChild.dob), new Date(e.date)),
      weightKg: e.weightKg,
      heightCm: e.heightCm,
      headCm: e.headCm,
    }));
  }, [entries, activeChild]);

  const latest = entries[entries.length - 1];

  if (!childLoaded || !gLoaded) {
    return (
      <main className="min-h-screen flex items-center justify-center text-ink-faded">
        {tCommon("loading")}
      </main>
    );
  }

  if (!activeChild) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-8 text-center">
        <div className="text-6xl mb-4">📈</div>
        <p className="text-ink-soft mb-6">{t("noChildWarning")}</p>
        <Link
          href="/onboarding"
          className="rounded-full bg-peach-deep text-white font-semibold px-8 py-3 bubble-shadow"
        >
          {t("goToOnboarding")} →
        </Link>
      </main>
    );
  }

  const ageInfo = ageInfoFromDob(activeChild.dob);
  const sexForWho: Sex | null =
    activeChild.sex === "female"
      ? "female"
      : activeChild.sex === "male"
        ? "male"
        : null;

  function save() {
    if (!activeChild) return;
    const weightKg = parseNumber(weight);
    const heightCm = parseNumber(height);
    const headCm = parseNumber(head);
    if (!weightKg && !heightCm && !headCm) return;
    addMeasurement({
      childId: activeChild.id,
      date,
      weightKg,
      heightCm,
      headCm,
      notes,
    });
    setWeight("");
    setHeight("");
    setHead("");
    setNotes("");
  }

  return (
    <main className="min-h-screen pb-24">
      <header className="sticky top-0 z-20 bg-cream/90 backdrop-blur-md border-b border-border px-6 py-4">
        <div className="max-w-xl mx-auto flex items-center gap-3">
          <Link href="/app" className="text-ink-soft hover:text-ink">
            ←
          </Link>
          <h1 className="font-display text-lg font-semibold text-ink flex-1">
            {t("title")}
          </h1>
        </div>
      </header>

      <div className="max-w-xl mx-auto px-6 pt-6 space-y-6">
        {/* Latest snapshot */}
        {latest && (
          <section className="rounded-bubble bg-white card-pop p-5">
            <p className="text-xs font-medium text-ink-faded">
              {t("latestLabel")} · {latest.date}
            </p>
            <div className="mt-3 grid grid-cols-3 gap-3 text-center">
              <LatestCell
                label={t("weight")}
                value={latest.weightKg}
                unit="kg"
                measure="weight"
                ageMonths={ageInfo.months}
                sex={sexForWho}
                localeStr={locale}
              />
              <LatestCell
                label={t("height")}
                value={latest.heightCm}
                unit="cm"
                measure="height"
                ageMonths={ageInfo.months}
                sex={sexForWho}
                localeStr={locale}
              />
              <LatestCell
                label={t("head")}
                value={latest.headCm}
                unit="cm"
                measure="head"
                ageMonths={ageInfo.months}
                sex={sexForWho}
                localeStr={locale}
              />
            </div>
          </section>
        )}

        {/* Chart */}
        {chartRows.length >= 2 && (
          <section>
            <h2 className="font-display font-semibold text-ink mb-2">
              {t("chartTitle")}
            </h2>
            <div className="rounded-bubble bg-white card-pop p-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartRows}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0e6d2" />
                  <XAxis
                    dataKey="ageMonths"
                    tick={{ fontSize: 11, fill: "#6b6658" }}
                    label={{
                      value: locale === "en" ? "Age (mo)" : "月齡",
                      position: "insideBottomRight",
                      offset: -2,
                      fontSize: 11,
                      fill: "#6b6658",
                    }}
                  />
                  <YAxis tick={{ fontSize: 11, fill: "#6b6658" }} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="weightKg"
                    stroke="#d97a63"
                    strokeWidth={2.5}
                    dot={{ r: 4 }}
                    name={locale === "en" ? "Weight (kg)" : "體重 (kg)"}
                  />
                  <Line
                    type="monotone"
                    dataKey="heightCm"
                    stroke="#6fb38a"
                    strokeWidth={2.5}
                    dot={{ r: 4 }}
                    name={locale === "en" ? "Height (cm)" : "身高 (cm)"}
                  />
                  <Line
                    type="monotone"
                    dataKey="headCm"
                    stroke="#e0a23f"
                    strokeWidth={2.5}
                    dot={{ r: 4 }}
                    name={locale === "en" ? "Head (cm)" : "頭圍 (cm)"}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>
        )}

        {/* Entry form */}
        <section>
          <h2 className="font-display font-semibold text-ink mb-3">
            {t("newEntry")}
          </h2>
          <div className="space-y-3">
            <label className="block">
              <span className="block text-sm font-medium text-ink mb-1">
                {t("dateLabel")}
              </span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-card bg-white border border-border px-3 py-2 text-ink tabular-nums"
              />
            </label>

            <div className="grid grid-cols-3 gap-3">
              <NumberInput
                label={`${t("weight")} (kg)`}
                value={weight}
                onChange={setWeight}
                step={0.01}
              />
              <NumberInput
                label={`${t("height")} (cm)`}
                value={height}
                onChange={setHeight}
                step={0.1}
              />
              <NumberInput
                label={`${t("head")} (cm)`}
                value={head}
                onChange={setHead}
                step={0.1}
              />
            </div>

            <label className="block">
              <span className="block text-sm font-medium text-ink mb-1">
                {t("notesLabel")}{" "}
                <span className="text-ink-faded text-xs font-normal">
                  {tCommon("optional")}
                </span>
              </span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t("notesPlaceholder")}
                rows={2}
                className="w-full rounded-card bg-white border border-border px-3 py-2 text-ink resize-none"
              />
            </label>

            <button
              type="button"
              onClick={save}
              disabled={!weight && !height && !head}
              className="w-full px-8 py-4 rounded-full bg-sage-deep text-white font-semibold text-lg bubble-shadow hover:bg-sage-deep/90 transition disabled:opacity-50"
            >
              {t("save")}
            </button>
          </div>
        </section>

        {/* History */}
        <section className="pt-2">
          <h2 className="font-display font-semibold text-ink mb-3">
            {t("historyTitle")}
          </h2>
          {entries.length === 0 ? (
            <p className="text-sm text-ink-faded text-center py-6">
              {t("emptyList")}
            </p>
          ) : (
            <ul className="space-y-2">
              {[...entries].reverse().map((m) => (
                <GrowthRow
                  key={m.id}
                  record={m}
                  onDelete={() => {
                    if (confirm(tCommon("delete") + "?"))
                      removeMeasurement(m.id);
                  }}
                />
              ))}
            </ul>
          )}
        </section>

        <p className="text-[11px] text-ink-faded text-center">
          {t("disclaimer")}
        </p>
      </div>
    </main>
  );
}

function NumberInput({
  label,
  value,
  onChange,
  step,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  step: number;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-ink mb-1">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        value={value}
        step={step}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-card bg-white border border-border px-3 py-2 text-ink tabular-nums"
      />
    </label>
  );
}

function LatestCell({
  label,
  value,
  unit,
  measure,
  ageMonths,
  sex,
  localeStr,
}: {
  label: string;
  value: number | undefined;
  unit: string;
  measure: Measure;
  ageMonths: number;
  sex: Sex | null;
  localeStr: "zh-TW" | "en";
}) {
  const percentile = useMemo(() => {
    if (value === undefined || !sex) return null;
    const lms = lookupLms(measure, sex, ageMonths);
    if (!lms) return null;
    const p = valueToPercentile(value, lms);
    return Number.isFinite(p) ? p : null;
  }, [value, sex, measure, ageMonths]);

  return (
    <div>
      <p className="font-display text-xl font-bold text-ink tabular-nums">
        {value !== undefined ? value : "—"}
      </p>
      <p className="text-[10px] text-ink-faded">
        {label} ({unit})
      </p>
      <p className="mt-1 text-[11px] font-medium text-sage-deep tabular-nums">
        {percentile !== null
          ? `${localeStr === "en" ? "P" : "第 "}${Math.round(percentile)}${localeStr === "zh-TW" ? " 百分位" : ""}`
          : "—"}
      </p>
    </div>
  );
}

function GrowthRow({
  record,
  onDelete,
}: {
  record: GrowthRecord;
  onDelete: () => void;
}) {
  const bits: string[] = [];
  if (record.weightKg !== undefined) bits.push(`${record.weightKg}kg`);
  if (record.heightCm !== undefined) bits.push(`${record.heightCm}cm`);
  if (record.headCm !== undefined) bits.push(`🧠 ${record.headCm}cm`);
  return (
    <li className="flex items-center gap-3 p-4 rounded-card bg-white border border-border">
      <div className="size-10 rounded-2xl bg-sage/30 flex items-center justify-center text-lg shrink-0">
        📏
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-ink tabular-nums">{bits.join(" · ")}</p>
        <p className="text-xs text-ink-faded tabular-nums">{record.date}</p>
        {record.notes && (
          <p className="mt-1 text-xs text-ink-soft line-clamp-2">
            {record.notes}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onDelete}
        className="text-xs text-ink-faded hover:text-peach-deep px-2 py-1"
        aria-label="delete"
      >
        ×
      </button>
    </li>
  );
}

// ─── helpers ──────────────────────────────────────────────────────────────

function parseNumber(v: string): number | undefined {
  const n = parseFloat(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
