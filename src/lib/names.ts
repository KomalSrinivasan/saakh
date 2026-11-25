// Deterministic Devanagari to Latin transliteration and fuzzy name matching for land-record checks.
import { asciiDigits } from "./ai-pure.ts";

const VOWELS: Record<string, string> = { "अ": "a", "आ": "aa", "इ": "i", "ई": "ee", "उ": "u", "ऊ": "oo", "ऋ": "ri", "ए": "e", "ऐ": "ai", "ओ": "o", "औ": "au", "ऑ": "o", "ऍ": "e" };
const MATRAS: Record<string, string> = { "ा": "aa", "ि": "i", "ी": "ee", "ु": "u", "ू": "oo", "ृ": "ri", "े": "e", "ै": "ai", "ो": "o", "ौ": "au", "ॅ": "e", "ॉ": "o" };
const CONS: Record<string, string> = {
  "क": "k", "ख": "kh", "ग": "g", "घ": "gh", "ङ": "n", "च": "ch", "छ": "chh", "ज": "j", "झ": "jh", "ञ": "n",
  "ट": "t", "ठ": "th", "ड": "d", "ढ": "dh", "ण": "n", "त": "t", "थ": "th", "द": "d", "ध": "dh", "न": "n",
  "प": "p", "फ": "ph", "ब": "b", "भ": "bh", "म": "m", "य": "y", "र": "r", "ल": "l", "ळ": "l", "व": "v",
  "श": "sh", "ष": "sh", "स": "s", "ह": "h",
};
const NUKTA_CONS: Record<string, string> = { "क": "k", "ख": "kh", "ग": "g", "ज": "z", "ड": "r", "ढ": "rh", "फ": "f", "य": "y" };
const HALANT = "्";
const NUKTA = "़";

type Unit = { s: string; v: boolean; schwa?: boolean; cluster?: boolean };

/** One Devanagari word to Latin with Hindi schwa deletion (final, and medial in V C _ C V). */
function devWord(w: string): string {
  const u: Unit[] = [];
  const chars = [...w.normalize("NFD")];
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (CONS[c]) {
      let s = CONS[c];
      if (chars[i + 1] === NUKTA) {
        s = NUKTA_CONS[c] ?? s;
        i++;
      }
      const next = chars[i + 1];
      u.push({ s, v: false });
      if (next === HALANT) {
        u[u.length - 1].cluster = true;
        i++;
      } else if (MATRAS[next]) {
        u.push({ s: MATRAS[next], v: true });
        i++;
      } else u.push({ s: "a", v: true, schwa: true });
    } else if (VOWELS[c]) u.push({ s: VOWELS[c], v: true });
    else if (c === "ं" || c === "ँ") u.push({ s: "n", v: false });
    else if (c === "ः") u.push({ s: "h", v: false });
  }
  const live = () => u.filter((x) => x.s !== "");
  // Final schwa drops unless it is the only vowel or follows a conjunct (e.g. mitra).
  const last = u[u.length - 1];
  if (last?.schwa && u.filter((x) => x.v).length > 1 && !u[u.length - 3]?.cluster) last.s = "";
  for (let i = 0; i < u.length; i++) {
    if (!u[i].schwa || !u[i].s) continue;
    const l = live();
    const k = l.indexOf(u[i]);
    const vc = l[k - 2]?.v && l[k - 1] && !l[k - 1].v && l[k + 1] && !l[k + 1].v;
    // V C _ C V, or V C _ before a conjunct as in compounds (रामप्रसाद -> ramprasad).
    if (vc && (l[k + 2]?.v || (l[k + 1].cluster && l[k + 2] && !l[k + 2].v && l[k + 3]?.v))) u[i].s = "";
  }
  return u.map((x) => x.s).join("");
}

const DROP = new Set(["shri", "sri", "shree", "sree", "smt", "shrimati", "srimati", "sushri", "kumari", "km", "mr", "mrs", "ms", "dr", "late", "swargiya", "svargiya", "so", "do", "wo", "co", "son", "daughter", "wife", "of", "pita", "pati", "putra", "putri", "patni", "vald"]);
const DEV_DROP = /(^|\s)(श्रीमती|श्री|सुश्री|कुमारी|स्व\.?|स्वर्गीय|पिता|पति|पुत्र|पुत्री|पत्नी|वल्द)(?=\s|$)/g;

/** Devanagari to lowercase Latin, honorifics and punctuation stripped, common spelling variants folded. */
export function translit(s: string): string {
  let t = asciiDigits(s).replace(/\b[sdwc]\s*\/\s*o\b/gi, " ").replace(DEV_DROP, " ");
  t = t.replace(/[ऀ-ॿ]+/g, (w) => ` ${devWord(w)} `);
  t = t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ");
  const words = t.split(/\s+/).filter((w) => w && !DROP.has(w));
  return words.map(fold).filter(Boolean).join(" ");
}

function fold(w: string): string {
  return w
    .replace(/ph/g, "f")
    .replace(/z/g, "j")
    .replace(/w/g, "v")
    .replace(/q/g, "k")
    .replace(/x/g, "ks")
    .replace(/sh/g, "s")
    .replace(/chh/g, "ch")
    .replace(/([bcdgjkpt]h)\1/g, "$1")
    .replace(/ay(?=[^aeiou]|$)/g, "ai")
    .replace(/ee/g, "i")
    .replace(/oo/g, "u")
    .replace(/(.)\1+/g, "$1");
}

/** Jaro-Winkler similarity, 0..1. */
function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const win = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const ma = new Array<boolean>(a.length).fill(false);
  const mb = new Array<boolean>(b.length).fill(false);
  let m = 0;
  for (let i = 0; i < a.length; i++)
    for (let j = Math.max(0, i - win); j < Math.min(b.length, i + win + 1); j++)
      if (!mb[j] && a[i] === b[j]) {
        ma[i] = mb[j] = true;
        m++;
        break;
      }
  if (!m) return 0;
  let t = 0;
  for (let i = 0, j = 0; i < a.length; i++) {
    if (!ma[i]) continue;
    while (!mb[j]) j++;
    if (a[i] !== b[j]) t++;
    j++;
  }
  const jaro = (m / a.length + m / b.length + (m - t / 2) / m) / 3;
  let p = 0;
  while (p < 4 && a[p] && a[p] === b[p]) p++;
  return jaro + p * 0.1 * (1 - jaro);
}

// Unrelated strings still score ~0.5-0.6 on JW, so stretch 0.6..1 to 0..1.
const stretch = (x: number) => Math.max(0, (x - 0.6) / 0.4);
const tokSim = (x: string, y: string) =>
  x.length === 1 || y.length === 1 ? (x[0] === y[0] ? 0.9 : 0) : stretch(jaroWinkler(x, y));

/** Name similarity 0..1 across scripts: order-free token match (initials, extra father's-name tokens tolerated) blended with character similarity. */
export function nameSimilarity(a: string, b: string): number {
  const ta = translit(a).split(" ").filter(Boolean);
  const tb = translit(b).split(" ").filter(Boolean);
  if (!ta.length || !tb.length) return 0;
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const pool = [...long];
  let sum = 0;
  for (const t of short) {
    let best = -1;
    let bi = -1;
    pool.forEach((p, i) => {
      const s = tokSim(t, p);
      if (s > best) {
        best = s;
        bi = i;
      }
    });
    sum += best;
    pool.splice(bi, 1);
  }
  const token = (sum / short.length) * (1 - 0.03 * (long.length - short.length));
  const chars = stretch(jaroWinkler([...ta].sort().join(""), [...tb].sort().join("")));
  const joined = stretch(jaroWinkler(ta.join(""), tb.join("")));
  // token * 0.95 keeps a full match with extra father's-name tokens high even when chars drops.
  return Math.round(Math.max(0.7 * token + 0.3 * chars, joined, token * 0.95) * 1000) / 1000;
}
