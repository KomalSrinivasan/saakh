import en from "../data/ui/en.json" with { type: "json" };
import hi from "../data/ui/hi.json" with { type: "json" };
import mr from "../data/ui/mr.json" with { type: "json" };
import gu from "../data/ui/gu.json" with { type: "json" };
import te from "../data/ui/te.json" with { type: "json" };
import ta from "../data/ui/ta.json" with { type: "json" };
import kn from "../data/ui/kn.json" with { type: "json" };
import bn from "../data/ui/bn.json" with { type: "json" };
import pa from "../data/ui/pa.json" with { type: "json" };
import ml from "../data/ui/ml.json" with { type: "json" };
import od from "../data/ui/od.json" with { type: "json" };

// Saaras v4 STT codes (22 Indic + en-IN); core = also supported by Mayura translate and Bulbul TTS.
export const LANGUAGES = [
  { code: "hi-IN", name: "हिन्दी", english: "Hindi", core: true },
  { code: "en-IN", name: "English", english: "English", core: true },
  { code: "bn-IN", name: "বাংলা", english: "Bengali", core: true },
  { code: "gu-IN", name: "ગુજરાતી", english: "Gujarati", core: true },
  { code: "kn-IN", name: "ಕನ್ನಡ", english: "Kannada", core: true },
  { code: "ml-IN", name: "മലയാളം", english: "Malayalam", core: true },
  { code: "mr-IN", name: "मराठी", english: "Marathi", core: true },
  { code: "od-IN", name: "ଓଡ଼ିଆ", english: "Odia", core: true },
  { code: "pa-IN", name: "ਪੰਜਾਬੀ", english: "Punjabi", core: true },
  { code: "ta-IN", name: "தமிழ்", english: "Tamil", core: true },
  { code: "te-IN", name: "తెలుగు", english: "Telugu", core: true },
  { code: "as-IN", name: "অসমীয়া", english: "Assamese", core: false },
  { code: "ur-IN", name: "اردو", english: "Urdu", core: false },
  { code: "ne-IN", name: "नेपाली", english: "Nepali", core: false },
  { code: "kok-IN", name: "कोंकणी", english: "Konkani", core: false },
  { code: "ks-IN", name: "کٲشُر", english: "Kashmiri", core: false },
  { code: "sd-IN", name: "سنڌي", english: "Sindhi", core: false },
  { code: "sa-IN", name: "संस्कृतम्", english: "Sanskrit", core: false },
  { code: "sat-IN", name: "ᱥᱟᱱᱛᱟᱲᱤ", english: "Santali", core: false },
  { code: "mni-IN", name: "ꯃꯤꯇꯩꯂꯣꯟ", english: "Manipuri", core: false },
  { code: "brx-IN", name: "बड़ो", english: "Bodo", core: false },
  { code: "mai-IN", name: "मैथिली", english: "Maithili", core: false },
  { code: "doi-IN", name: "डोगरी", english: "Dogri", core: false },
] as const;

export type LangCode = (typeof LANGUAGES)[number]["code"];
export type UiKey = keyof typeof en;

const DICTS: Partial<Record<LangCode, Record<string, string>>> = {
  "en-IN": en,
  "hi-IN": hi,
  "mr-IN": mr,
  "gu-IN": gu,
  "te-IN": te,
  "ta-IN": ta,
  "kn-IN": kn,
  "bn-IN": bn,
  "pa-IN": pa,
  "ml-IN": ml,
  "od-IN": od,
};

export const isLangCode = (s: string): s is LangCode => LANGUAGES.some((l) => l.code === s);
export const langName = (code: string) => LANGUAGES.find((l) => l.code === code)?.english ?? code;

export function t(key: UiKey | (string & {}), lang: LangCode, vars?: Record<string, string | number>): string {
  const s = DICTS[lang]?.[key] ?? (en as Record<string, string>)[key] ?? key;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
}
