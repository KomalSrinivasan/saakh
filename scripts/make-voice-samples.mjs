// Renders public/samples/crop-plans.json to crop-plan-<lang>.wav via Sarvam TTS (bulbul:v3).
// Usage: node scripts/make-voice-samples.mjs   (reads SARVAM_API_KEY from .env.local, never prints it)
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
try {
  process.loadEnvFile(resolve(root, ".env.local"));
} catch {}
const key = process.env.SARVAM_API_KEY;
if (!key) {
  console.error("SARVAM_API_KEY missing in .env.local; nothing rendered.");
  process.exit(1);
}

const { plans } = JSON.parse(readFileSync(resolve(root, "public/samples/crop-plans.json"), "utf8"));
for (const p of plans) {
  const res = await fetch("https://api.sarvam.ai/text-to-speech", {
    method: "POST",
    headers: { "api-subscription-key": key, "content-type": "application/json" },
    body: JSON.stringify({ text: p.text, language_code: p.lang, model: "bulbul:v3", speaker: "ratan", pace: 0.95, speech_sample_rate: 16000 }),
  });
  if (!res.ok) throw new Error(`${p.lang}: HTTP ${res.status} ${await res.text()}`);
  const { audios } = await res.json();
  const out = resolve(root, "public", p.audio.slice(1));
  writeFileSync(out, Buffer.from(audios[0], "base64"));
  console.log(`ok ${p.audio}`);
}
