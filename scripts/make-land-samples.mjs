// Renders 10 SYNTHETIC MP land-record samples (khasra / B1 style) to public/samples/khasra-N.jpg
// plus land-expected.json. All names and numbers are fictional; every image carries a SAMPLE / नमूना mark.
// Usage: node scripts/make-land-samples.mjs   (needs Google Chrome + macOS sips, no npm deps)
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OUT = resolve(import.meta.dirname, "../public/samples");
const ACRE_TO_HA = 0.404686;
const BIGHA_TO_HA = 0.25; // printed on the bigha sample as the local factor

// style: clean | rotated | phone | hand ; unit: hectare | acre | bigha
const records = [
  { district: "सीहोर", tehsil: "आष्टा", village: "खजूरिया कलां", halka: 23, owner: "रामप्रसाद पटेल", relation: "पिता मोहनलाल पटेल", plots: [["214/1", 2.0]], unit: "hectare", aadhaar: "4821", style: "clean", irrigated: "सिंचित (कुआँ)" },
  { district: "सीहोर", tehsil: "इछावर", village: "देवपुरा", halka: 11, owner: "सुनीता बाई कुशवाहा", relation: "पति रमेश कुशवाहा", plots: [["112/3", 1.5]], unit: "hectare", aadhaar: "7390", style: "rotated", rot: 2.5, devDigits: true, irrigated: "असिंचित" },
  { district: "इंदौर", tehsil: "देपालपुर", village: "सांवेर खेड़ी", halka: 37, owner: "गोविंद सिंह चौहान", relation: "पिता भंवर सिंह चौहान", plots: [["45", 3.25]], unit: "hectare", aadhaar: "1658", style: "phone", rot: -3, irrigated: "सिंचित (नलकूप)" },
  { district: "उज्जैन", tehsil: "तराना", village: "कनासिया", halka: 8, owner: "हरिओम शर्मा", relation: "पिता दुर्गाशंकर शर्मा", plots: [["78/2", 4.5]], unit: "acre", aadhaar: "2047", style: "clean", irrigated: "सिंचित (नहर)" },
  { district: "देवास", tehsil: "सोनकच्छ", village: "पीपलरावां खुर्द", halka: 19, owner: "कमला देवी यादव", relation: "पति शिवनारायण यादव", plots: [["301", 6]], unit: "bigha", aadhaar: "5512", style: "rotated", rot: -1.8, irrigated: "असिंचित" },
  { district: "धार", tehsil: "बदनावर", village: "बिड़वाल", halka: 42, owner: "भेरूलाल पाटीदार", relation: "पिता नाथूलाल पाटीदार", plots: [["17/1", 0.62], ["17/4", 0.48], ["233", 1.1]], unit: "hectare", aadhaar: "9034", style: "clean", irrigated: "सिंचित (कुआँ)" },
  { district: "सीहोर", tehsil: "बुधनी", village: "मरदानपुर", halka: 5, owner: "राधेश्याम मीणा", relation: "पिता गणपत मीणा", plots: [["56/2", 0.8]], unit: "hectare", aadhaar: "3176", style: "hand", rot: 0.8, irrigated: "असिंचित" },
  { district: "उज्जैन", tehsil: "महिदपुर", village: "झारड़ा", halka: 14, owner: "शंकरलाल गुर्जर", relation: "पिता कालूराम गुर्जर", plots: [["9/1", 1.05], ["9/3", 0.35]], unit: "hectare", aadhaar: "6603", style: "phone", rot: 4, irrigated: "सिंचित (तालाब)" },
  { district: "इंदौर", tehsil: "महू", village: "गवली पलासिया", halka: 29, owner: "अनीता ठाकुर", relation: "पति विजय ठाकुर", plots: [["402/1", 0.95]], unit: "hectare", aadhaar: "8245", style: "rotated", rot: -4, shadow: true, irrigated: "असिंचित" },
  { district: "देवास", tehsil: "बागली", village: "उदयनगर", halka: 33, owner: "जगदीश प्रसाद वर्मा", relation: "पिता हीरालाल वर्मा", plots: [["128/5", 2.75]], unit: "hectare", aadhaar: "1129", style: "phone", rot: -2.2, hand: true, irrigated: "सिंचित (नलकूप)" },
];

const DEV = "०१२३४५६७८९";
const dev = (s, on) => (on ? String(s).replace(/\d/g, (d) => DEV[d]) : String(s));
const unitLabel = { hectare: "हेक्टेयर", acre: "एकड़", bigha: "बीघा" };
const toHa = (a, unit) => (unit === "acre" ? a * ACRE_TO_HA : unit === "bigha" ? a * BIGHA_TO_HA : a);
const fmt = (a, unit) => (unit === "bigha" ? String(a) : a.toFixed(unit === "acre" ? 2 : 3));
const round4 = (n) => Math.round(n * 1e4) / 1e4;

function html(r, i) {
  const hand = r.style === "hand" || r.hand;
  const d = (s) => dev(s, r.devDigits);
  const total = r.plots.reduce((s, [, a]) => s + a, 0);
  const rows = r.plots
    .map(([k, a], j) => `<tr><td>${d(j + 1)}</td><td class="v">${d(k)}</td><td class="v">${d(fmt(a, r.unit))}</td><td>${r.irrigated}</td><td>सोयाबीन / गेहूं</td></tr>`)
    .join("");
  const phone = r.style === "phone";
  const rot = r.rot ?? 0;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;width:1100px;height:1000px;overflow:hidden;background:${phone ? "radial-gradient(circle at 30% 20%,#8a6a4a,#4b3423)" : "#ffffff"};}
  .page{position:absolute;left:90px;top:70px;width:920px;padding:40px 46px;box-sizing:border-box;background:#fbf7ec;color:#1d1d1d;
    font-family:"Kohinoor Devanagari","ITF Devanagari","Devanagari Sangam MN",sans-serif;font-size:21px;
    transform:${phone ? `perspective(1600px) rotateX(4deg) rotateY(-3deg) ` : ""}rotate(${rot}deg);
    box-shadow:${phone || r.shadow ? "0 30px 60px rgba(0,0,0,.45)" : "0 0 0 1px #ccc"};
    ${phone ? "filter:blur(0.6px) contrast(1.05) brightness(0.97);" : ""}}
  h1{font-size:28px;text-align:center;margin:0 0 4px} h2{font-size:20px;text-align:center;margin:0 0 22px;font-weight:500}
  table{width:100%;border-collapse:collapse;margin:10px 0} td,th{border:1.4px solid #333;padding:8px 10px;text-align:left;vertical-align:top}
  th{background:#efe7d2;font-weight:600} .meta td:first-child{width:34%;background:#f4eedd}
  .v{${hand ? 'font-family:"Bradley Hand","Kohinoor Devanagari",cursive;color:#1b2f8f;font-size:25px;filter:url(#wobble);' : "font-weight:600;"}}
  .stamp{position:absolute;right:40px;top:34px;border:3px solid #b3261e;color:#b3261e;padding:4px 12px;font-weight:700;font-size:22px;transform:rotate(-8deg);font-family:Arial,"Kohinoor Devanagari"}
  .wm{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;font:700 120px Arial,"Kohinoor Devanagari";color:rgba(179,38,30,.08);transform:rotate(-28deg)}
  .foot{font-size:16px;color:#444;margin-top:18px;line-height:1.5}
  .noise,.shade{position:absolute;inset:0;pointer-events:none}
  .shade{background:linear-gradient(115deg,rgba(0,0,0,0) 40%,rgba(0,0,0,.28) 75%,rgba(0,0,0,.4))}
  </style></head><body>
  <svg width="0" height="0" style="position:absolute"><filter id="wobble"><feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="${i}"/><feDisplacementMap in="SourceGraphic" scale="3"/></filter>
  <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="${i + 7}"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .35 0"/></filter></svg>
  <div class="page">
    <div class="stamp">SAMPLE / नमूना</div>
    <h1>भू-अभिलेख प्रति (खसरा / बी-1) - नमूना</h1>
    <h2>प्रशिक्षण हेतु काल्पनिक दस्तावेज़, शासकीय अभिलेख नहीं</h2>
    <table class="meta">
      <tr><td>जिला</td><td class="v">${r.district}</td></tr>
      <tr><td>तहसील</td><td class="v">${r.tehsil}</td></tr>
      <tr><td>ग्राम / प.ह.नं.</td><td class="v">${r.village} / ${d(r.halka)}</td></tr>
      <tr><td>भूमिस्वामी का नाम</td><td class="v">${r.owner}</td></tr>
      <tr><td>पिता / पति का नाम</td><td class="v">${r.relation}</td></tr>
      <tr><td>आधार (मास्क)</td><td class="v">XXXX XXXX ${d(r.aadhaar)}</td></tr>
      <tr><td>वर्ष</td><td>${d("2026-27")}</td></tr>
    </table>
    <table><tr><th>क्र.</th><th>खसरा नं.</th><th>रकबा (${unitLabel[r.unit]})</th><th>सिंचाई</th><th>फसल</th></tr>${rows}
      <tr><td></td><th>कुल रकबा</th><td class="v"><b>${d(fmt(total, r.unit))}</b></td><td colspan="2"></td></tr></table>
    <div class="foot">${r.unit === "bigha" ? `स्थानीय मान: 1 बीघा = ${BIGHA_TO_HA} हेक्टेयर (नमूना हेतु)<br>` : ""}नमूना क्र. ${d(i + 1)} / 10 &middot; सभी नाम, खसरा व आधार अंक काल्पनिक हैं। SAMPLE ONLY, NOT A GOVERNMENT RECORD.</div>
    <div class="wm">SAMPLE / नमूना</div>
  </div>
  ${phone ? '<svg class="noise" width="1100" height="1000"><rect width="100%" height="100%" filter="url(#grain)"/></svg><div class="shade"></div>' : ""}
  ${r.shadow ? '<div class="shade" style="opacity:.6"></div>' : ""}
  </body></html>`;
}

mkdirSync(OUT, { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), "land-"));
const expected = [];
try {
  records.forEach((r, i) => {
    const name = `khasra-${i + 1}`;
    const h = join(tmp, `${name}.html`);
    const png = join(tmp, `${name}.png`);
    writeFileSync(h, html(r, i));
    execFileSync(CHROME, ["--headless", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1", "--window-size=1100,1000", `--screenshot=${png}`, `file://${h}`], { stdio: "ignore" });
    execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "82", png, "--out", join(OUT, `${name}.jpg`)], { stdio: "ignore" });
    const total = r.plots.reduce((s, [, a]) => s + a, 0);
    expected.push({
      file: `/samples/${name}.jpg`,
      style: r.style + (r.hand ? "+hand" : "") + (r.devDigits ? "+devanagari-digits" : ""),
      district: r.district,
      tehsil: r.tehsil,
      ownerName: r.owner,
      village: r.village,
      surveyNos: r.plots.map(([k]) => k),
      areaAsPrinted: Number(fmt(total, r.unit)),
      areaUnitSeen: r.unit,
      areaHa: round4(toHa(total, r.unit)),
      aadhaarLast4: r.aadhaar,
    });
    console.log(`ok ${name}.jpg`);
  });
  writeFileSync(join(OUT, "land-expected.json"), JSON.stringify({ note: "Synthetic samples, fictional data. Acre factor 0.404686; bigha factor printed on image.", bighaToHa: BIGHA_TO_HA, records: expected }, null, 2) + "\n");
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
