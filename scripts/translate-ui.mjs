// One-off: translate src/data/ui/en.json into the other core UI languages via Sarvam. Idempotent: skips keys already present.
// Usage: node scripts/translate-ui.mjs [mr gu ...]
import { readFileSync, writeFileSync, existsSync } from "node:fs";

process.loadEnvFile(".env.local");
const KEY = process.env.SARVAM_API_KEY;
if (!KEY) throw new Error("SARVAM_API_KEY missing in .env.local");

const DIR = "src/data/ui";
const LANGS = process.argv.slice(2).length ? process.argv.slice(2) : ["mr", "gu", "te", "ta", "kn", "bn", "pa", "ml", "od"];
const MAX_CHARS = 1800; // sarvam-translate:v1 input limit is 2000
const CONCURRENCY = 4;
const PROTECT = /\{\w+\}|\bKCC\b|\bSoF\b|\bPMFBY\b|\bRBI\b|\bAadhaar\b|₹|\b\d+\(\d+\)/g;

const en = JSON.parse(readFileSync(`${DIR}/en.json`, "utf8"));
let calls = 0;
const fallbacks = [];

async function translate(input, lang, model = "sarvam-translate:v1") {
  for (let attempt = 0; ; attempt++) {
    calls++;
    const r = await fetch("https://api.sarvam.ai/translate", {
      method: "POST",
      headers: { "api-subscription-key": KEY, "content-type": "application/json" },
      body: JSON.stringify({ input, source_language_code: "en-IN", target_language_code: `${lang}-IN`, model, mode: "formal" }),
    });
    if (r.ok) return (await r.json()).translated_text;
    if ((r.status === 429 || r.status >= 500) && attempt < 5) {
      await new Promise((res) => setTimeout(res, 1000 * 2 ** attempt));
      continue;
    }
    throw new Error(`Sarvam ${r.status} for ${lang}`);
  }
}

// Swap protected spans for <vN> tokens (which Sarvam passes through untouched).
function protect(text, start) {
  const map = {};
  let n = start;
  const out = text.replace(PROTECT, (m) => ((map[`<v${n}>`] = m), `<v${n++}>`));
  return { out, map, next: n };
}

function restore(text, map) {
  const tokens = text.match(/<v\d+>/g) ?? [];
  const want = Object.keys(map);
  if (tokens.length !== want.length || want.some((t) => !tokens.includes(t))) return null;
  return text.replace(/<v\d+>/g, (t) => map[t]).replace(/\u2014/g, "-").trim();
}

// Translate a list of keys in one call as "N. text" lines; returns {key: translated|null}.
async function translateBatch(keys, lang) {
  let n = 0;
  const items = keys.map((k) => {
    const p = protect(en[k], n);
    n = p.next;
    return p;
  });
  const input = items.map((p, i) => `${i + 1}. ${p.out}`).join("\n");
  const raw = await translate(input, lang);
  const lines = {};
  for (const m of raw.matchAll(/^\s*(\d+)\.\s*(.*)$/gm)) lines[m[1]] = m[2];
  const res = {};
  keys.forEach((k, i) => (res[k] = lines[i + 1] != null ? restore(lines[i + 1], items[i].map) : null));
  return res;
}

async function translateOne(key, lang) {
  const p = protect(en[key], 0);
  const v = restore(await translate(p.out, lang), p.map);
  if (v != null) return v;
  // Last try unprotected on mayura; accept only if every protected term survived verbatim.
  const raw = (await translate(en[key], lang, "mayura:v1")).replace(/\u2014/g, "-").trim();
  return Object.values(p.map).every((term) => raw.includes(term)) ? raw : null;
}

async function pool(jobs, size) {
  let i = 0;
  await Promise.all(Array.from({ length: size }, async () => { while (i < jobs.length) await jobs[i++](); }));
}

const dicts = {};
const save = (lang) => {
  const d = dicts[lang];
  const ordered = Object.fromEntries(Object.keys(en).filter((k) => k in d).map((k) => [k, d[k]]));
  writeFileSync(`${DIR}/${lang}.json`, JSON.stringify(ordered, null, 2) + "\n");
};

const jobs = [];
for (const lang of LANGS) {
  const path = `${DIR}/${lang}.json`;
  dicts[lang] = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
  const todo = Object.keys(en).filter((k) => !(k in dicts[lang]));
  let batch = [], size = 0;
  const flush = () => {
    if (!batch.length) return;
    const keys = batch;
    jobs.push(async () => {
      const res = await translateBatch(keys, lang);
      for (const k of keys) {
        let v = res[k];
        if (v == null) v = await translateOne(k, lang); // batch lost or mangled this line; retry alone
        if (v == null) { fallbacks.push(`${lang}:${k}`); v = en[k]; }
        dicts[lang][k] = v;
      }
      save(lang);
      console.log(`${lang}: ${Object.keys(dicts[lang]).length}/${Object.keys(en).length}`);
    });
    batch = []; size = 0;
  };
  for (const k of todo) {
    if (size + en[k].length + 8 > MAX_CHARS) flush();
    batch.push(k);
    size += en[k].length + 8;
  }
  flush();
}

await pool(jobs, CONCURRENCY);
console.log(`calls: ${calls}`);
console.log(`fell back to English (${fallbacks.length}): ${fallbacks.join(", ") || "none"}`);
