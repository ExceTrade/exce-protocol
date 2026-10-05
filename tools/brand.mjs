// Brand assets from brand/ : premultiplied logo resizes and the pixel-grid trace (mark.svg, favicon.svg).
// The transparent logo PNG is pure black wherever alpha is 0, so every resize here is done on premultiplied RGB:
// a straight-alpha resize would pull that black into the edge pixels as a dark fringe.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

export const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const LOGO_FILE = join(root, "brand", "LOGO EXCE PNG...png");
export const GRID_ROWS = 30; // the traced grid: 30 rows, so a 32px favicon gets one cell per pixel

const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

export async function loadLogo() {
  const { data, info } = await sharp(LOGO_FILE).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, W: info.width, H: info.height };
}

export function bbox({ data, W, H }, alphaMin = 1) {
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (data[(y * W + x) * 4 + 3] >= alphaMin) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}

// Square crop around the artwork with a margin, premultiplied, resized to `size`. Returns a straight-alpha PNG buffer.
export async function resizeLogo(logo, size, margin = 0.06) {
  const b = bbox(logo), side = Math.round(Math.max(b.x1 - b.x0, b.y1 - b.y0) * (1 + 2 * margin));
  const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
  const sx = Math.round(cx - side / 2), sy = Math.round(cy - side / 2);
  const buf = Buffer.alloc(side * side * 4);
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
    const X = sx + x, Y = sy + y;
    if (X < 0 || Y < 0 || X >= logo.W || Y >= logo.H) continue;
    const i = (Y * logo.W + X) * 4, o = (y * side + x) * 4, a = logo.data[i + 3];
    buf[o] = Math.round(logo.data[i] * a / 255); buf[o + 1] = Math.round(logo.data[i + 1] * a / 255); buf[o + 2] = Math.round(logo.data[i + 2] * a / 255); buf[o + 3] = a; // premultiply
  }
  return sharp(buf, { raw: { width: side, height: side, channels: 4, premultiplied: true } })
    .resize(size, size, { kernel: "lanczos3" }).png({ compressionLevel: 9 }).toBuffer();
}

// Trace the logo's real pixels onto a grid: GRID_ROWS rows tall; each cell takes the majority palette colour of the
// opaque pixels under it (empty when under half the cell is opaque). Returns merged rectangles in cell units.
export function trace(logo, palette) {
  const b = bbox(logo, 128), u = (b.y1 - b.y0) / GRID_ROWS, cols = Math.ceil((b.x1 - b.x0) / u);
  const keys = ["mint", "coral", "slate"], rgb = keys.map((k) => hexToRgb(palette[k].hex));
  const grid = [];
  for (let r = 0; r < GRID_ROWS; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) {
      const votes = [0, 0, 0]; let opaque = 0, total = 0;
      const xa = Math.floor(b.x0 + c * u), xb = Math.min(b.x1, Math.floor(b.x0 + (c + 1) * u)), ya = Math.floor(b.y0 + r * u), yb = Math.min(b.y1, Math.floor(b.y0 + (r + 1) * u));
      for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++) {
        total++; const i = (y * logo.W + x) * 4;
        if (logo.data[i + 3] < 128) continue;
        opaque++; const p = [logo.data[i], logo.data[i + 1], logo.data[i + 2]];
        let best = 0, bd = 1e12; rgb.forEach((m, j) => { const d = d2(m, p); if (d < bd) { bd = d; best = j; } });
        votes[best]++;
      }
      row.push(total && opaque / total >= 0.5 ? keys[votes.indexOf(Math.max(...votes))] : null);
    }
    grid.push(row);
  }
  // horizontal runs, then merge identical runs on consecutive rows
  const rects = [], open = new Map();
  for (let r = 0; r <= GRID_ROWS; r++) {
    const runs = new Map();
    if (r < GRID_ROWS) for (let c = 0; c < cols;) { const k = grid[r][c]; if (!k) { c++; continue; } let e = c; while (e < cols && grid[r][e] === k) e++; runs.set(c + ":" + (e - c) + ":" + k, { x: c, w: e - c, k }); c = e; }
    for (const [key, rc] of open) if (!runs.has(key)) { rects.push(rc); open.delete(key); }
    for (const [key, run] of runs) { if (open.has(key)) open.get(key).h++; else open.set(key, { ...run, y: r, h: 1 }); }
  }
  return { cols, rows: GRID_ROWS, rects, grid, bbox: b, unit: u };
}

export function svgFrom(t, palette, { size = null, ox = 0, oy = 0 } = {}) {
  const body = t.rects.map((r) => '<rect x="' + (r.x + ox) + '" y="' + (r.y + oy) + '" width="' + r.w + '" height="' + r.h + '" fill="' + palette[r.k].hex + '"/>').join("");
  const vb = size ? "0 0 " + size + " " + size : "0 0 " + t.cols + " " + t.rows;
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + vb + '"' + (size ? ' width="' + size + '" height="' + size + '"' : "") + ' shape-rendering="crispEdges">' + body + "</svg>\n";
}

export async function buildBrand(out, palette) {
  const logo = await loadLogo();
  for (const s of [64, 128, 180, 512]) writeFileSync(join(out, "logo-" + s + ".png"), await resizeLogo(logo, s));
  const t = trace(logo, palette);
  writeFileSync(join(out, "mark.svg"), svgFrom(t, palette));
  writeFileSync(join(out, "favicon.svg"), svgFrom(t, palette, { size: 32, ox: Math.floor((32 - t.cols) / 2), oy: Math.floor((32 - t.rows) / 2) }));
  return t;
}
