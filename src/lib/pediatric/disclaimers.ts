/**
 * Central source of legal / educational disclaimer copy.
 *
 * Nibble is an educational feeding-support app. It is NOT a medical
 * device, NOT a diagnostic tool, and does NOT provide medical advice.
 * Every surface that shows nutrition gaps, feeding suggestions, poop
 * interpretation, or AI chat responses must attribute copy from here.
 *
 * Three layers of defense:
 *   1. Static disclaimers (this file).
 *   2. AI response shaping in /api/ai/chat (regex keyword detection).
 *   3. Hard refusals in the Gemini system prompt.
 */

export const DISCLAIMERS = {
  /** Bottom-of-screen footer disclaimer. Small text. */
  footer: {
    en: "Educational use only. Not medical advice. Always consult your pediatrician.",
    "zh-TW": "僅供教育參考，並非醫療建議。有疑慮請諮詢兒科醫師。",
  },

  /** Shown after any AI chat message that touched a health-related topic. */
  aiResponse: {
    en: "This is educational information only, not medical advice. If you have concerns, please contact your pediatrician.",
    "zh-TW": "本回應僅供教育參考，並非醫療建議。如有疑慮請諮詢兒科醫師。",
  },

  /** Shown on onboarding consent screen. Parent must check the box. */
  onboardingConsent: {
    en: "I understand Nibble provides educational feeding guidance only and does NOT replace professional medical advice from a pediatrician or qualified health provider.",
    "zh-TW": "我明白 Nibble 僅提供育兒餵養的教育內容，不能取代兒科醫師或其他合格醫療專業人員的醫療建議。",
  },

  /** Shown when the pediatrician-referral banner is surfaced. */
  pediatricianReferral: {
    en: "Please contact your pediatrician. Nibble cannot give medical advice for this situation.",
    "zh-TW": "請聯絡您的兒科醫師。關於這種情況，Nibble 無法提供醫療建議。",
  },

  /** Emergency banner — only for life-threatening symptom keywords. */
  emergency: {
    en: "If your child's symptoms are severe (difficulty breathing, loss of consciousness, severe allergic reaction), call emergency services immediately.",
    "zh-TW": "如果寶寶出現嚴重症狀（呼吸困難、昏迷、嚴重過敏反應），請立即撥打 119 或前往急診。",
  },

  /** RDA results disclaimer (shown next to coverage rings). */
  rdaResults: {
    en: "Targets are based on WHO/AAP guidelines and are averages. Your child's needs may differ.",
    "zh-TW": "目標值依據 WHO/AAP 指南平均值，個別寶寶需求可能不同。",
  },
} as const;

/** Keywords that should trigger the pediatrician-referral banner on AI output. */
export const MEDICAL_RISK_KEYWORDS_EN = [
  "fever", "rash", "blood", "vomit", "vomiting", "diarrhea", "dehydrat",
  "breath", "breathing", "choke", "choking", "allerg", "anaphyla",
  "wheez", "lethargic", "seizure", "unresponsive", "passed out",
  "dose", "dosage", "medication", "prescri", "diagnos", "treat",
  "hospital", "emergency",
] as const;

export const MEDICAL_RISK_KEYWORDS_ZH = [
  "發燒", "發熱", "皮疹", "疹子", "出血", "血便", "嘔吐", "腹瀉",
  "脫水", "呼吸困難", "噎到", "嗆到", "過敏", "喘", "嗜睡", "抽搐",
  "昏迷", "劑量", "用藥", "藥物", "藥量", "處方", "診斷", "治療",
  "送醫", "急診",
] as const;

export function containsMedicalRiskKeyword(text: string): boolean {
  const lower = text.toLowerCase();
  for (const kw of MEDICAL_RISK_KEYWORDS_EN) {
    if (lower.includes(kw)) return true;
  }
  for (const kw of MEDICAL_RISK_KEYWORDS_ZH) {
    if (text.includes(kw)) return true;
  }
  return false;
}

/** Keywords that are life-threatening and should surface the emergency banner. */
export const EMERGENCY_KEYWORDS_EN = [
  "not breathing", "can't breathe", "blue lips", "unresponsive", "unconscious",
  "anaphyla", "seizure", "convulsion", "passed out",
] as const;

export const EMERGENCY_KEYWORDS_ZH = [
  "不能呼吸", "呼吸停止", "嘴唇發紫", "昏迷", "失去意識", "抽搐", "驚厥",
] as const;

export function containsEmergencyKeyword(text: string): boolean {
  const lower = text.toLowerCase();
  for (const kw of EMERGENCY_KEYWORDS_EN) {
    if (lower.includes(kw)) return true;
  }
  for (const kw of EMERGENCY_KEYWORDS_ZH) {
    if (text.includes(kw)) return true;
  }
  return false;
}
