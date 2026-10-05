// Gates: exit 0 only when every check passes. Builds the page again from the live register, then rebuilds it from
// mutated registers to prove both branches of every gate. Mutation anchors are state-independent: each one reads
// the record as it is right now and derives its mutation and its expectation from that, never from a fixed state.
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve, extname, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "./build.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "src"), dist = join(root, "dist"), tmp = join(root, ".gate-tmp");
const reg = await import(pathToFileURL(join(src, "register.js")).href);

let failed = 0, passed = 0;
const section = (t) => console.log("\n" + t);
const ok = (cond, msg) => { if (cond) { passed++; console.log("  pass  " + msg); } else { failed++; console.log("  FAIL  " + msg); } };

const walk = (dir, skip = []) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  if (skip.includes(n)) return [];
  return statSync(p).isDirectory() ? walk(p, skip) : [p];
});
const read = (p) => readFileSync(p, "utf8");
const live = JSON.parse(read(join(src, "records.json")));

// ------------------------------------------------------------------ 1. fresh build
section("build");
await build({ out: dist });
ok(existsSync(join(dist, "index.html")), "dist/index.html exists after a fresh build");
for (const f of ["styles.css", "tokens.css", "theme.css", "app.js", "register.js", "records.json", "favicon.svg", "mark.svg", "logo-64.png", "logo-128.png", "logo-180.png", "logo-512.png"]) ok(existsSync(join(dist, f)), "dist/" + f);

// ------------------------------------------------------------------ 2. repo hygiene (standing rule 5)
section("repo hygiene");
const scanRoots = walk(root, ["node_modules", "reference", ".gate-tmp"]);
ok(!scanRoots.some((p) => /(^|[\\/])CLAUDE\.md$/i.test(p)) && !existsSync(join(root, ".claude")), "no CLAUDE.md, no .claude/ directory");
const ATTR = new RegExp(["co-authored" + "-by", "generated " + "with", "claude" + " code", "anthro" + "pic", "\\bclau" + "de\\b", "\\bA" + "I\\b-generated"].join("|"), "i");
const hits = scanRoots.filter((p) => !p.endsWith("gates.mjs") && /\.(html|css|js|mjs|json|svg|md|txt)$/.test(p) && ATTR.test(read(p)));
ok(hits.length === 0, "no AI attribution text in any project file" + (hits.length ? " (" + hits.map((h) => relative(root, h)).join(", ") + ")" : ""));

// ------------------------------------------------------------------ 3. palette (standing rule 4)
section("palette: sampled from the brand assets, literals in one file");
const tokens = JSON.parse(read(join(src, "tokens.json")));
const pal = tokens.palette;
const hexRe = /#[0-9a-fA-F]{6}\b/g;
const rgbOf = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const dist2 = (a, b) => Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
const BAD_LITERAL = [/(^|[\s:,(])#[0-9a-fA-F]{3,8}(?![\w-])/, /\b(rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|color)\(/, /:\s*(white|black|red|green|blue|gray|grey|silver|orange|yellow|purple|brown|pink|navy|teal)\b/i];
const noLiterals = (p) => { const t = read(p); return !BAD_LITERAL.some((r) => r.test(t.replace(/href="#[^"]*"/g, ""))); };
const srcFiles = walk(src).filter((p) => /\.(css|js|html|svg)$/.test(p));
ok(srcFiles.every(noLiterals), "no hex, rgb, hsl, lab or named colour in any src css, js, html or svg (" + srcFiles.length + " files)");
ok(srcFiles.every((p) => !/oklch\(/.test(read(p).replace(/color-mix\(in oklch/g, ""))), "no oklch literal outside a color-mix");
ok(Object.values(pal).every((p) => /^#[0-9a-f]{6}$/.test(p.hex) && p.source && Number.isInteger(p.x) && Number.isInteger(p.y) && p.note), "every token records hex, source file, pixel x,y and a note (" + Object.keys(pal).length + " tokens)");
ok(/k-means/.test(tokens.method) && /real pixel/.test(tokens.method), "tokens.json states the method: k-means, snapped to a real pixel");
const { default: sharp } = await import("sharp");
for (const [name, p] of Object.entries(pal)) {
  if (!p.verifiable) continue;
  const file = join(root, p.source);
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const i = (p.y * info.width + p.x) * 4, got = "#" + [data[i], data[i + 1], data[i + 2]].map((v) => v.toString(16).padStart(2, "0")).join("");
  ok(got === p.hex && data[i + 3] === 255, "--c-" + name + " " + p.hex + " is the real pixel at " + p.x + "," + p.y + " of " + p.source);
}
const unverifiable = Object.entries(pal).filter(([, p]) => !p.verifiable).map(([n]) => n);
console.log("  note  not re-verifiable here (source art is not in the repo): " + unverifiable.join(", "));
const palSet = new Set(Object.values(pal).map((p) => p.hex));
const distHex = walk(dist).filter((p) => /\.(css|html|svg|js)$/.test(p)).flatMap((p) => [...read(p).matchAll(hexRe)].map((m) => [p, m[0].toLowerCase()]));
ok(distHex.every(([p]) => /(tokens\.css|favicon\.svg|mark\.svg|index\.html)$/.test(p)), "dist: colour literals appear only in tokens.css, the two traced svgs and the theme-color meta");
ok(distHex.every(([, h]) => palSet.has(h)), "dist: every literal is a token value (" + distHex.length + " occurrences)");

// contrast, from theme.css: var() and color-mix(in srgb) evaluated against the sampled tokens
const theme = read(join(src, "theme.css"));
const declsOf = (t) => Object.fromEntries([...t.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
const mediaAt = theme.indexOf("@media");
const lightEnv = { ...Object.fromEntries(Object.entries(pal).map(([n, p]) => ["--c-" + n, p.hex])), ...declsOf(theme.slice(0, mediaAt)) };
const darkEnv = { ...lightEnv, ...declsOf(theme.slice(mediaAt)) };
function colour(expr, env) {
  expr = expr.trim();
  if (/^#[0-9a-f]{6}$/i.test(expr)) return rgbOf(expr);
  let m = expr.match(/^var\((--[\w-]+)\)$/);
  if (m) return colour(env[m[1]], env);
  m = expr.match(/^color-mix\(in srgb,\s*(.+?)\s+(\d+)%,\s*(.+)\)$/);
  if (m) { const a = colour(m[1], env), b = colour(m[3], env), w = Number(m[2]) / 100; return a.map((v, i) => v * w + b[i] * (1 - w)); }
  throw new Error("cannot evaluate " + expr);
}
const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const L = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
const ratio = (a, b) => { const x = L(a), y = L(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const PAIRS = [["--ink", "--paper", 7], ["--ink-2", "--paper", 7], ["--muted", "--paper", 4.5], ["--accent", "--paper", 4.5], ["--warn", "--paper", 4.5], ["--ink", "--paper-2", 7], ["--muted", "--paper-2", 4.5], ["--paper", "--ink", 7], ["--night-ink", "--night", 7], ["--night-muted", "--night", 4.5], ["--night-hi", "--night", 4.5]];
for (const [mode, env] of [["light", lightEnv], ["dark", darkEnv]]) {
  const bad = PAIRS.map(([f, b, min]) => [f, b, min, ratio(colour(env[f], env), colour(env[b], env))]).filter(([, , min, r]) => r < min);
  ok(bad.length === 0, mode + " theme text contrast meets WCAG on " + PAIRS.length + " pairs" + (bad.length ? ": " + bad.map(([f, b, min, r]) => f + " on " + b + " " + r.toFixed(2) + " < " + min).join("; ") : ""));
}

// ------------------------------------------------------------------ 4. units, logo, favicon, motion, social visibility
section("units, logo, favicon, motion, icons");
const stylesCss = read(join(src, "styles.css")), appJs = read(join(src, "app.js"));
const cssAll = stylesCss + theme;
const stripped = (cssAll + read(join(src, "index.html")) + appJs).replace(/[A-Za-z-]+ch\b/g, "");
ok(!/\d(?:\.\d+)?ch\b/.test(stripped), "no ch units in css, inline styles or script");

// logo: the source's transparent area is pure black, so the resize must be premultiplied; no dark fringe may survive
const brand = await import(pathToFileURL(join(root, "tools", "brand.mjs")).href);
const logo = await brand.loadLogo();
let blackTransparent = 0; for (let i = 0; i < logo.W * logo.H; i++) if (logo.data[i * 4 + 3] === 0 && !logo.data[i * 4] && !logo.data[i * 4 + 1] && !logo.data[i * 4 + 2]) blackTransparent++;
ok(blackTransparent > 0, "source logo has " + blackTransparent + " pure-black transparent pixels, so brand.mjs resizes premultiplied");
const brandRgb = ["mint", "coral", "slate"].map((n) => rgbOf(pal[n].hex));
for (const s of [64, 128, 180, 512]) {
  const f = join(dist, "logo-" + s + ".png");
  const { data, info } = await sharp(f).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let edge = 0, dark = 0;
  for (let i = 0; i < info.width * info.height; i++) { const a = data[i * 4 + 3]; if (a > 40 && a < 255) { edge++; if (Math.min(...brandRgb.map((c) => dist2(c, [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]]))) > 60) dark++; } }
  ok(info.width === s && info.height === s && info.channels === 4 && dark / Math.max(edge, 1) < 0.01, "logo-" + s + ".png is " + s + "x" + s + " RGBA, no dark fringe (" + dark + " of " + edge + " edge pixels off-palette)");
}

const fav = read(join(dist, "favicon.svg")), mark = read(join(dist, "mark.svg"));
ok(/viewBox="0 0 32 32"/.test(fav) && /width="32"/.test(fav) && /height="32"/.test(fav), "favicon is SVG 32x32");
ok(!/<!--/.test(fav) && !/--/.test(fav) && !/<!--/.test(mark), "favicon has no comments and no double hyphens");
ok(/^<svg[^>]*>(<rect\b[^>]*\/>)+<\/svg>\s*$/.test(fav) && /^<svg[^>]*>(<rect\b[^>]*\/>)+<\/svg>\s*$/.test(mark), "favicon and mark are plain rect geometry traced from the pixel grid");
{ // independent check: render the favicon, compare with the premultiplied downscale of the logo's own pixels
  const b = brand.bbox(logo, 128), u = (b.y1 - b.y0) / brand.GRID_ROWS, cols = Math.ceil((b.x1 - b.x0) / u), ox = Math.floor((32 - cols) / 2), oy = Math.floor((32 - brand.GRID_ROWS) / 2);
  const fr = await sharp(Buffer.from(fav), { density: 72 }).resize(32, 32).ensureAlpha().raw().toBuffer();
  const crop = Buffer.alloc((b.x1 - b.x0) * (b.y1 - b.y0) * 4); let o = 0;
  for (let y = b.y0; y < b.y1; y++) for (let x = b.x0; x < b.x1; x++) { const i = (y * logo.W + x) * 4, a = logo.data[i + 3]; crop[o++] = logo.data[i] * a / 255; crop[o++] = logo.data[i + 1] * a / 255; crop[o++] = logo.data[i + 2] * a / 255; crop[o++] = a; }
  const ref = await sharp(crop, { raw: { width: b.x1 - b.x0, height: b.y1 - b.y0, channels: 4, premultiplied: true } }).resize(cols, brand.GRID_ROWS, { kernel: "cubic" }).raw().toBuffer();
  let agree = 0, total = 0;
  for (let y = 0; y < brand.GRID_ROWS; y++) for (let x = 0; x < cols; x++) {
    const ri = (y * cols + x) * 4, fi = ((y + oy) * 32 + x + ox) * 4, ra = ref[ri + 3] > 127, fa = fr[fi + 3] > 127;
    total++;
    if (ra !== fa) continue;
    if (!ra) { agree++; continue; }
    const near = (p) => brandRgb.map((c) => dist2(c, p)).indexOf(Math.min(...brandRgb.map((c) => dist2(c, p))));
    if (near([ref[ri], ref[ri + 1], ref[ri + 2]]) === near([fr[fi], fr[fi + 1], fr[fi + 2]])) agree++;
  }
  ok(agree / total >= 0.9, "favicon matches the logo's pixel grid: " + (100 * agree / total).toFixed(1) + "% of " + total + " cells agree in coverage and colour");
}
const html0 = read(join(dist, "index.html"));
ok(/rel="icon"[^>]*favicon\.svg/.test(html0) && /rel="apple-touch-icon"[^>]*logo-180\.png/.test(html0) && /<img src="logo-64\.png"/.test(html0), "page links the favicon, the touch icon and uses the real logo in the nav");
ok(/@media \(prefers-reduced-motion: reduce\)/.test(cssAll) && /prefers-reduced-motion: reduce/.test(appJs), "prefers-reduced-motion handled in css and script");
// motion: the reference's measured values, carried over
ok(/--ease:\s*cubic-bezier\(\.22,\s*\.61,\s*\.21,\s*1\)/.test(stylesCss), "easing is the reference's cubic-bezier(.22, .61, .21, 1)");
ok(/animation: arrive \.6s var\(--ease\)/.test(stylesCss) && /\(i % 3\) \* 65/.test(appJs) && /threshold: 0\.08/.test(appJs), "arrival: 0.6s, 65ms stagger over three, threshold 0.08");
ok(/3400\)/.test(appJs) && /dash 1\.1s linear infinite/.test(stylesCss) && /transition: fill \.5s var\(--ease\)/.test(stylesCss), "process walk: 3400ms step, 1.1s dash, 0.5s fills");
ok(/status-grow 3\.6s step-end infinite/.test(stylesCss) && /lnIn 1\.4s ease-out/.test(stylesCss) && /transition: background \.15s/.test(stylesCss), "status loop 3.6s step-end, row arrival 1.4s, button 0.15s");
ok((stylesCss.match(/@keyframes/g) || []).length >= 5 && /requestAnimationFrame\(tick\)/.test(appJs), "animation is alive: at least five keyframe sets plus the drifting block stack");
const hidesSocial = [...stylesCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)].some(([, sel, body]) => /\.(soc|socials)\b/.test(sel) && /display:\s*none/.test(body));
ok(html0.includes('data-soc="x"') && html0.includes('data-soc="github"') && html0.includes("M18.244 2.25h3.308") && html0.includes("M10.226 17.284"), "both icons present in the rendered nav with the official X mark and the official Octicon mark-github");
ok(!hidesSocial, "no stylesheet rule hides .soc or .socials at any breakpoint");
ok(/--tap:\s*44px/.test(stylesCss) && /\.soc\s*\{[^}]*width:\s*var\(--tap\)[^}]*height:\s*var\(--tap\)/.test(stylesCss), "social icons are sized to 44x44");
const missing = [...html0.matchAll(/(?:src|href)="([^"#:]+)"/g)].map((m) => m[1]).filter((u) => !u.startsWith("/") && !existsSync(join(dist, u)));
ok(missing.length === 0, "every local href and src in dist resolves" + (missing.length ? " (missing: " + missing.join(", ") + ")" : ""));

// ------------------------------------------------------------------ 5. register integrity (standing rule 1)
section("register integrity");
const recs = live.records;
ok(Object.values(recs).every((r) => reg.STATES.includes(r.state)), "every record's state is stated, absent or unconfirmed");
ok(Object.values(recs).every((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.asOf)), "every record is dated");
ok(Object.entries(recs).every(([id, r]) => r.state !== "stated" || (r.kind === "social" ? reg.deriveHandle(id, r.url) : r.value)), "every stated record carries its payload; the handle derives from the stored URL");
const ch = recs.chain;
ok(ch.state !== "stated" || (ch.value.chainId === 4663 && ch.value.chainIdHex === "0x1237" && parseInt(ch.value.chainIdHex, 16) === ch.value.chainId && ch.value.rpc === "https://rpc.mainnet.chain.robinhood.com"), "chain record: 4663 = 0x1237, rpc as stated");
ok(ch.source === "client statement 2026-09-02 batch-level", "chain record cites the client statement");
ok(recs.x.state === "stated" && recs.x.url === "https://x.com/Exce_Trade" && recs.x.asOf === "2026-10-05", "X record is the client-confirmed 2026-10-05 statement");
ok(recs.github.state === "stated" && recs.github.url === "https://github.com/ExceTrade/exce-protocol" && recs.github.asOf === "2026-10-05", "GitHub record is the client-confirmed 2026-10-05 statement");
{ const live0 = read(join(dist, "index.html")); for (const id of ["x", "github"]) { const r = recs[id], h = reg.deriveHandle(id, r.url); const tag = live0.match(new RegExp("<(a|span) class=\"soc[^\"]*\" data-soc=\"" + id + "\"[^>]*>"))?.[0] ?? ""; ok(r.state === "stated" ? tag.startsWith("<a ") && tag.includes('href="' + r.url + '"') && !!h : tag.startsWith("<span ") && !/href=/.test(tag), "live page: " + id + " icon follows its record (" + (r.state === "stated" ? "link to " + h : "inert") + ")"); } }

// ------------------------------------------------------------------ 6. mutation harness
section("mutation harness: both branches, state-independent");
const TEST_ADDR = "0x" + "ab12".repeat(10);
const OTHER_ADDR = "0x" + "cd34".repeat(10);
const clone = (o) => JSON.parse(JSON.stringify(o));
function mutate(data, id, state) {
  const d = clone(data), r = d.records[id];
  r.state = state;
  if (state === "stated") {
    if (r.kind === "address") r.value = TEST_ADDR;
    else if (r.kind === "social") r.url = id === "x" ? "https://x.com/exce_test" : "https://github.com/exce-test/exce";
    else if (r.kind === "chain") r.value = r.value ?? { name: "Robinhood Chain", chainId: 4663, chainIdHex: "0x1237", rpc: "https://rpc.mainnet.chain.robinhood.com" };
  } else if (state === "absent") {
    if (r.kind === "social") r.url = null; else r.value = null;
  } // unconfirmed keeps whatever stale payload is there: the state alone must keep the slot inert
  return d;
}
async function buildFrom(name, data) {
  mkdirSync(tmp, { recursive: true });
  const rp = join(tmp, name + ".json"), out = join(tmp, name);
  writeFileSync(rp, JSON.stringify(data));
  await build({ out, recordsPath: rp });
  return read(join(out, "index.html"));
}
const region = (html, id) => { const m = html.match(new RegExp('id="' + id + '"[^>]*>([\\s\\S]*?)</(?:div|span|ul|output)>(?=\\s*(?:<|$))')); return m ? m[1] : ""; };
const hrefs = (html) => [...html.matchAll(/<a\b[^>]*\bhref="([^"]*)"/g)].map((m) => m[1]);

let branchesSeen = { stated: 0, inert: 0 };
for (const id of Object.keys(live.records)) {
  for (const state of reg.STATES) {
    const d = mutate(live, id, state), r = d.records[id];
    const html = await buildFrom("m-" + id + "-" + state, d);
    const tag = id + " -> " + state;
    const n = reg.counts(d.records);
    ok(new RegExp('<div class="v[^"]*">' + n.stated + " / " + n.total + "</div>").test(html), tag + ": register tile counts " + n.stated + " / " + n.total);
    if (r.kind === "address") {
      const ca = html.match(/<div class="wrap" id="ca">([\s\S]*?)<\/div><\/div>/)?.[1] ?? "";
      if (state === "stated") {
        branchesSeen.stated++;
        ok(ca.includes('data-copy="' + r.value + '"') && ca.includes(">" + r.value + "</button>") && /class="ca-slot"/.test(ca), tag + ": full address shown, click-to-copy live, feedback slot present");
      } else {
        branchesSeen.inert++;
        ok(!/data-copy/.test(ca) && !/0x[0-9a-fA-F]{40}/.test(ca) && /ca-slot inert/.test(ca) && ca.includes("checked " + r.asOf), tag + ": slot inert, no copy, no address, dated " + r.asOf);
      }
    }
    if (r.kind === "social") {
      const soc = html.match(/id="socials"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/nav>/)?.[1] ?? "";
      const handle = reg.deriveHandle(id, r.url);
      const mine = soc.match(new RegExp('<(a|span) class="soc[^"]*" data-soc="' + id + '"[^>]*>'))?.[0] ?? "";
      const bothIcons = soc.includes('data-soc="x"') && soc.includes('data-soc="github"') && (soc.match(/<svg/g) || []).length === 2;
      ok(bothIcons, tag + ": both icons still present");
      if (state === "stated") {
        branchesSeen.stated++;
        ok(mine.startsWith("<a ") && mine.includes('href="' + r.url + '"') && mine.includes(handle), tag + ": live link, href is the stored URL, handle " + handle + " derived");
      } else {
        branchesSeen.inert++;
        ok(mine.startsWith("<span ") && !/href=/.test(mine) && mine.includes("checked " + r.asOf), tag + ": inert span, no href, dated");
        ok(!hrefs(html).some((h) => (id === "x" ? /(^|\/\/)(www\.)?(x|twitter)\.com/ : /(^|\/\/)(www\.)?github\.com/).test(h)), tag + ": no outbound href for this record anywhere in the page");
      }
    }
    if (r.kind === "chain") {
      const status = html.match(/id="status">([\s\S]*?)<\/div>/)?.[1] ?? "";
      if (state === "stated") { branchesSeen.stated++; ok(status.includes("Chain " + r.value.chainId) && html.includes('data-copy="' + r.value.rpc + '"'), tag + ": chain id shown, rpc copy live"); }
      else { branchesSeen.inert++; ok(status.includes("Chain —") && !html.includes('data-copy="https://rpc') && /<button type="button" class="btn" disabled/.test(html), tag + ": chain id blank, rpc copy disabled"); }
    }
  }
}
ok(branchesSeen.stated > 0 && branchesSeen.inert > 0, "both branches exercised (" + branchesSeen.stated + " stated builds, " + branchesSeen.inert + " inert builds)");
const everyStated = clone(live); for (const id of Object.keys(everyStated.records)) Object.assign(everyStated.records, { [id]: mutate(everyStated, id, "stated").records[id] });
const everyAbsent = clone(live); for (const id of Object.keys(everyAbsent.records)) Object.assign(everyAbsent.records, { [id]: mutate(everyAbsent, id, "absent").records[id] });
const hs = await buildFrom("all-stated", everyStated), ha = await buildFrom("all-absent", everyAbsent);
ok(new Set(hrefs(hs).filter((h) => /^https:\/\/(x|github)\.com/.test(h))).size === 2, "all stated: both channel links are live");
ok(hrefs(ha).filter((h) => /^https:\/\/(x|github)\.com/.test(h)).length === 0 && !/data-copy/.test(ha), "all absent: no channel href, nothing copyable");
ok(reg.matchAddress("", live.records).kind === "idle", "empty input is idle, not an error");

// ------------------------------------------------------------------ 7. address gate (standing rule 3)
section("address gate: match, never blanket-reject");
const withCa = mutate(live, "contract", "stated").records, noCa = mutate(live, "contract", "absent").records;
ok(reg.matchAddress(TEST_ADDR, withCa).kind === "match", "stated registry: exact address matches");
ok(reg.matchAddress(TEST_ADDR.toUpperCase().replace("0X", "0x"), withCa).kind === "match", "stated registry: letter case does not matter");
ok(reg.matchAddress("  " + TEST_ADDR + " ", withCa).kind === "match", "stated registry: surrounding spaces ignored");
const un = reg.matchAddress(OTHER_ADDR, withCa);
ok(un.kind === "unmatched" && !/invalid|malformed|error/i.test(un.text), "stated registry: another well-formed 0x address is 'not in the register', not 'invalid'");
const em = reg.matchAddress(OTHER_ADDR, noCa);
ok(em.kind === "empty" && !/invalid|malformed|error/i.test(em.text) && em.text.includes(noCa.contract.asOf), "empty registry: a 0x address is neither matched nor rejected, answer is dated");
ok(reg.matchAddress("0x1234", withCa).kind === "shape" && reg.matchAddress("0x" + "g".repeat(40), withCa).kind === "shape", "only non-address shapes get the shape answer");
ok(reg.isAddress(OTHER_ADDR) && reg.isAddress("0x" + "A".repeat(40)), "no blanket 0x rejection: every 40-digit hex string is address-shaped");
const mi = read(join(src, "app.js"));
ok(!/\.test\(\s*input|invalid address|Invalid address/.test(mi), "script holds no standalone 0x reject path");

// ------------------------------------------------------------------ 8. copy novelty vs the reference
section("copy: no shared 2-grams with the reference");
const ref = join(root, "reference", "index.html");
if (!existsSync(ref)) ok(false, "reference/index.html missing, cannot compare copy");
else {
  const ENT = { "&rarr;": " ", "&middot;": " ", "&mdash;": " ", "&amp;": "and", "&nbsp;": " " };
  const textOf = (h) => {
    const metas = [...h.matchAll(/<meta[^>]*(?:name|property)="(?:description|og:description|twitter:description|og:title|twitter:title)"[^>]*content="([^"]*)"/g)].map((m) => m[1]).join(" ");
    const title = h.match(/<title>([^<]*)/)?.[1] ?? "";
    const aria = [...h.matchAll(/aria-label="([^"]*)"/g)].map((m) => m[1]).join(" ");
    const body = h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/g, " ").replace(/<[^>]+>/g, " ");
    return (body + " " + title + " " + metas + " " + aria).replace(/&\w+;/g, (e) => ENT[e] ?? " ");
  };
  const stringsOf = (p) => [...read(p).matchAll(/"([^"\n]{4,})"/g)].map((m) => m[1]).filter((s) => /[a-z]{3,}\s+[a-z]{2,}/i.test(s) && !/[{}=;<>]/.test(s)).join(" ");
  const words = (t) => t.toLowerCase().replace(/·|—|→|…/g, " ").replace(/’/g, "'").split(/[^a-z0-9']+/).filter(Boolean);
  const grams = (w) => { const s = new Set(); for (let i = 0; i < w.length - 1; i++) s.add(w[i] + " " + w[i + 1]); return s; };
  const mine = grams(words(textOf(read(join(dist, "index.html"))) + " " + stringsOf(join(src, "register.js")) + " " + stringsOf(join(src, "app.js"))));
  const theirs = grams(words(textOf(read(ref)) + " " + stringsOf(join(root, "reference", "landing.js"))));
  const ALLOW = new Set(["robinhood chain", "on robinhood"]); // the client-stated network name, a proper noun
  const shared = [...mine].filter((g) => theirs.has(g) && !ALLOW.has(g));
  if (shared.length && process.env.GATE_DEBUG) {
    const flat = words(textOf(read(join(dist, "index.html"))) + " " + stringsOf(join(src, "register.js")) + " " + stringsOf(join(src, "app.js")));
    for (const g of shared) { const [a, b] = g.split(" "); for (let i = 0; i < flat.length - 1; i++) if (flat[i] === a && flat[i + 1] === b) console.log("    context: " + flat.slice(Math.max(0, i - 6), i + 8).join(" ")); }
  }
  ok(shared.length === 0,"zero shared 2-grams" + (shared.length ? ": " + shared.slice(0, 40).join(" | ") : ""));
}

rmSync(tmp, { recursive: true, force: true });
console.log("\n" + passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
