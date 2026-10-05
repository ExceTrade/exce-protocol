// Static server for dist/, for local measurement only.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";

const dist = resolve(dirname(fileURLToPath(import.meta.url)), "..", "dist");
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml" };
const port = Number(process.env.PORT || 4173);
createServer(async (req, res) => {
  const p = new URL(req.url, "http://x").pathname;
  const file = join(dist, p === "/" ? "index.html" : p.replace(/\.\./g, ""));
  try { const b = await readFile(file); res.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream", "cache-control": "no-store" }); res.end(b); }
  catch { res.writeHead(404); res.end("not found"); }
}).listen(port, () => console.log("http://localhost:" + port));
