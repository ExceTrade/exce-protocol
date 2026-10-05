// Build: src/ -> dist/. Pre-renders every register region into index.html from records.json, generates the colour
// tokens and the brand assets, copies the rest.
// Usage: node tools/build.mjs            (dist/ from src/records.json)
// As a module: build({ out, recordsPath }) is what the gates use to build the mutated registers.
import { readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildBrand } from "./brand.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "src");

export function tokensCss(tokens) {
  const lines = Object.entries(tokens.palette).map(([n, p]) => "  --c-" + n + ": " + p.hex + "; /* " + p.source + " @ " + p.x + "," + p.y + " " + p.note + " */");
  return "/* Generated from src/tokens.json by tools/build.mjs. Do not edit.\n   Method: " + tokens.method + " */\n:root {\n" + lines.join("\n") + "\n}\n";
}

export async function build({ out = join(root, "dist"), recordsPath = join(src, "records.json") } = {}) {
  const reg = await import(pathToFileURL(join(src, "register.js")).href);
  const data = JSON.parse(readFileSync(recordsPath, "utf8"));
  const records = data.records;
  const tokens = JSON.parse(readFileSync(join(src, "tokens.json"), "utf8"));

  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });

  const values = { ...Object.fromEntries(Object.entries(reg.REGIONS).map(([id, fn]) => [id, fn(records)])), figureStates: reg.figureStates(records), themeColor: tokens.palette.cream.hex,
    recordsJson: JSON.stringify(data).replace(/</g, "\\u003c") };
  let html = readFileSync(join(src, "index.html"), "utf8");
  html = html.replace(/\{\{([\w-]+)\}\}/g, (m, k) => {
    if (!(k in values)) throw new Error("template slot without a renderer: " + k);
    return values[k];
  });
  writeFileSync(join(out, "index.html"), html);

  writeFileSync(join(out, "tokens.css"), tokensCss(tokens));
  await buildBrand(out, tokens.palette); // logo-*.png (premultiplied resize), mark.svg, favicon.svg traced from the logo's pixel grid
  for (const f of ["theme.css", "styles.css", "app.js", "register.js"]) copyFileSync(join(src, f), join(out, f));
  writeFileSync(join(out, "records.json"), JSON.stringify(data, null, 2) + "\n");
  writeFileSync(join(out, "_headers"), "/records.json\n  Cache-Control: no-cache\n/index.html\n  Cache-Control: no-cache\n");
  return { out, records };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const { out } = await build();
  console.log("built " + out);
}
