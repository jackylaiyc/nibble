/**
 * Preset milestone catalog keyed by typical age bucket.
 *
 * These are culturally-neutral feeding/motor milestones. We never surface
 * "your baby is behind" copy — the tile only celebrates what was achieved.
 * When a milestone is checked, we store the date; the typical bucket is
 * reference-only.
 *
 * Source: WHO motor milestones + AAP feeding milestones, trimmed to what
 * caregivers actually talk about.
 */

import type { AgeBucket } from "./ageBucket";

export type MilestoneKey =
  | "first_solid"
  | "first_finger_food"
  | "first_tooth"
  | "sits_up"
  | "crawls"
  | "pulls_to_stand"
  | "first_step"
  | "walks_unassisted"
  | "first_word"
  | "waves"
  | "drinks_from_cup"
  | "uses_spoon"
  | "stacks_blocks"
  | "two_word_phrase"
  | "runs"
  | "climbs_stairs";

export interface MilestoneInfo {
  key: MilestoneKey;
  emoji: string;
  label: { en: string; "zh-TW": string };
  /** The typical age bucket — babies normally hit milestones around this window. */
  typicalBucket: AgeBucket;
  /** Short parent-facing note. Always positive framing. */
  note: { en: string; "zh-TW": string };
}

export const MILESTONES: MilestoneInfo[] = [
  {
    key: "first_solid",
    emoji: "🥄",
    label: { en: "First solid food", "zh-TW": "第一次吃副食品" },
    typicalBucket: "6-8mo",
    note: {
      en: "The first spoonful! Purée or BLW — both count.",
      "zh-TW": "第一口副食品，泥狀或 BLW 都算。",
    },
  },
  {
    key: "sits_up",
    emoji: "🪑",
    label: { en: "Sits up unsupported", "zh-TW": "獨立坐起" },
    typicalBucket: "6-8mo",
    note: {
      en: "Balanced sitting without hands on the floor.",
      "zh-TW": "不用手撐地，自己穩穩坐著。",
    },
  },
  {
    key: "first_tooth",
    emoji: "🦷",
    label: { en: "First tooth", "zh-TW": "長第一顆牙" },
    typicalBucket: "6-8mo",
    note: {
      en: "You'll feel a tiny ridge on the lower gums first.",
      "zh-TW": "下排牙齦上會先摸到小小的凸起。",
    },
  },
  {
    key: "first_finger_food",
    emoji: "🫐",
    label: { en: "First finger food", "zh-TW": "第一口手指食物" },
    typicalBucket: "9-11mo",
    note: {
      en: "Soft, pea-sized pieces baby can pick up and chew.",
      "zh-TW": "豆子大小的軟食物，寶貝能自己抓起咀嚼。",
    },
  },
  {
    key: "crawls",
    emoji: "🧎",
    label: { en: "Crawls", "zh-TW": "開始爬行" },
    typicalBucket: "9-11mo",
    note: {
      en: "Commando crawling counts too! Some babies skip this entirely.",
      "zh-TW": "軍式爬行也算！有些寶貝會直接跳過這一步。",
    },
  },
  {
    key: "pulls_to_stand",
    emoji: "🧍",
    label: { en: "Pulls to stand", "zh-TW": "扶著站起來" },
    typicalBucket: "9-11mo",
    note: {
      en: "Grabs furniture or your leg and powers up.",
      "zh-TW": "扶著家具或你的腿自己站起來。",
    },
  },
  {
    key: "first_word",
    emoji: "💬",
    label: { en: "First real word", "zh-TW": "第一個真正的字" },
    typicalBucket: "9-11mo",
    note: {
      en: "Consistent sound for a specific thing — mama, dada, milk, bye.",
      "zh-TW": "對特定事物的固定音節：媽媽、爸爸、奶奶、掰掰。",
    },
  },
  {
    key: "waves",
    emoji: "👋",
    label: { en: "Waves bye-bye", "zh-TW": "揮手掰掰" },
    typicalBucket: "9-11mo",
    note: {
      en: "Responds to context — bye-bye, hi, or both.",
      "zh-TW": "會在適當場合揮手，表示掰掰或嗨。",
    },
  },
  {
    key: "first_step",
    emoji: "👟",
    label: { en: "First step", "zh-TW": "第一步" },
    typicalBucket: "12-23mo",
    note: {
      en: "One independent step between furniture or your arms counts!",
      "zh-TW": "家具間或大人手上放開，踏出一步就算！",
    },
  },
  {
    key: "walks_unassisted",
    emoji: "🚶",
    label: { en: "Walks unassisted", "zh-TW": "獨立行走" },
    typicalBucket: "12-23mo",
    note: {
      en: "Steady walking across a room without support.",
      "zh-TW": "不用扶任何東西，穩穩走過房間。",
    },
  },
  {
    key: "drinks_from_cup",
    emoji: "🥛",
    label: { en: "Drinks from open cup", "zh-TW": "用開口杯喝水" },
    typicalBucket: "12-23mo",
    note: {
      en: "Open cup is a speech-development win — worth the mess!",
      "zh-TW": "開口杯有助口腔發育，雖然會弄濕但值得。",
    },
  },
  {
    key: "uses_spoon",
    emoji: "🥄",
    label: { en: "Uses a spoon solo", "zh-TW": "會自己用湯匙" },
    typicalBucket: "12-23mo",
    note: {
      en: "Spoon-to-mouth, however messily, counts.",
      "zh-TW": "把湯匙送到嘴邊就算，沾得滿身沒關係。",
    },
  },
  {
    key: "stacks_blocks",
    emoji: "🧱",
    label: { en: "Stacks 2+ blocks", "zh-TW": "疊 2 塊以上積木" },
    typicalBucket: "12-23mo",
    note: {
      en: "Fine motor + patience — both get stronger each week.",
      "zh-TW": "精細動作 + 耐心，每週都會進步。",
    },
  },
  {
    key: "two_word_phrase",
    emoji: "🗣️",
    label: { en: "Two-word phrase", "zh-TW": "兩個字詞組合" },
    typicalBucket: "24-47mo",
    note: {
      en: "\"More milk\", \"mama go\" — the start of real sentences.",
      "zh-TW": "「要奶奶」、「媽媽抱」⋯⋯真正句子的起點。",
    },
  },
  {
    key: "runs",
    emoji: "🏃",
    label: { en: "Runs (both feet off ground)", "zh-TW": "會奔跑" },
    typicalBucket: "24-47mo",
    note: {
      en: "Actual running — both feet briefly leave the floor.",
      "zh-TW": "真正的跑——兩腳有瞬間都離地。",
    },
  },
  {
    key: "climbs_stairs",
    emoji: "🪜",
    label: { en: "Climbs stairs (holding rail)", "zh-TW": "扶扶手爬樓梯" },
    typicalBucket: "24-47mo",
    note: {
      en: "One step at a time with a hand on the rail.",
      "zh-TW": "一階一階扶著扶手爬上樓。",
    },
  },
];

/**
 * Bucket order used when sorting milestone tiles so younger milestones
 * appear first. Older milestones are still visible — caregivers love to
 * peek ahead at what's coming.
 */
const BUCKET_ORDER: Record<AgeBucket, number> = {
  "6-8mo": 0,
  "9-11mo": 1,
  "12-23mo": 2,
  "24-47mo": 3,
  "48mo+": 4,
};

/** Sorted by typical bucket, then alphabetical by key for stability. */
export function milestonesSorted(): MilestoneInfo[] {
  return [...MILESTONES].sort((a, b) => {
    const d = BUCKET_ORDER[a.typicalBucket] - BUCKET_ORDER[b.typicalBucket];
    if (d !== 0) return d;
    return a.key.localeCompare(b.key);
  });
}

export function getMilestone(key: MilestoneKey): MilestoneInfo | undefined {
  return MILESTONES.find((m) => m.key === key);
}
