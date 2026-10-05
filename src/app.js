// Page behaviour. The page is complete without it (the build pre-renders every region); this refreshes the regions from
// records.json at load (so a restated record shows without a rebuild), and adds copy, the matcher, the stack figure,
// scroll state and the process walk. Motion follows prefers-reduced-motion.
import { REGIONS, figureStates, matchAddress } from "./register.js";

const reduced = matchMedia("(prefers-reduced-motion: reduce)");
const motionOff = reduced.matches || new URLSearchParams(location.search).get("motion") === "off";
document.body.classList.toggle("motion-off", motionOff);

let records = null;
try { records = JSON.parse(document.getElementById("records-baked").textContent).records; } catch { records = null; }

// ---- records: read at runtime, render every region from the same functions the build used
async function load() {
  try {
    const res = await fetch("records.json", { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    records = data.records;
    for (const [id, render] of Object.entries(REGIONS)) {
      const el = document.getElementById(id);
      if (el) el.innerHTML = render(records);
    }
    const canvas = document.getElementById("stack");
    if (canvas) { canvas.dataset.states = figureStates(records); stack?.draw(); }
  } catch { /* the pre-rendered page stands */ }
}

// ---- click to copy, with feedback
document.addEventListener("click", async (e) => {
  const el = e.target instanceof Element ? e.target.closest("[data-copy]") : null;
  if (!el) return;
  const text = el.dataset.copy;
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; } catch {
    const t = document.createElement("textarea");
    t.value = text; t.style.position = "fixed"; t.style.opacity = "0"; document.body.append(t); t.select();
    try { ok = document.execCommand("copy"); } catch { ok = false; }
    t.remove();
  }
  const slot = el.closest(".ca-slot");
  const hint = slot?.querySelector(".ca-hint");
  const label = el.dataset.copyLabel;
  if (hint) hint.textContent = ok ? "Copied to clipboard" : "Copy blocked; select the text manually";
  if (label) el.textContent = ok ? "Copied" : "Copy blocked";
  slot?.classList.toggle("copied", ok);
  clearTimeout(el._t);
  el._t = setTimeout(() => {
    if (hint) hint.textContent = "Tap to copy";
    if (label) el.textContent = label;
    slot?.classList.remove("copied");
  }, 1600);
});

// ---- the matcher: address-shaped strings are compared with the stated register, never rejected for being 0x hex
(() => {
  const form = document.getElementById("matcher");
  if (!form) return;
  const input = document.getElementById("m-in"), out = document.getElementById("m-out");
  const run = () => {
    const r = matchAddress(input.value, records ?? globalThis.__records ?? {});
    out.dataset.kind = r.kind;
    out.textContent = r.kind === "idle" ? "Waiting for an address" : r.text;
  };
  form.addEventListener("submit", (e) => { e.preventDefault(); run(); });
  input.addEventListener("input", run);
})();

// ---- scroll state, progress bar, section links, arrival
(() => {
  const nav = document.querySelector(".nav");
  const links = [...document.querySelectorAll('.links a[href^="#"]')];
  const sections = links.map((l) => document.querySelector(l.hash)).filter(Boolean);
  const progress = document.createElement("div");
  progress.className = "reading-progress";
  progress.setAttribute("aria-hidden", "true");
  nav?.append(progress);
  let scheduled = false;
  function update() {
    scheduled = false;
    const distance = document.documentElement.scrollHeight - innerHeight;
    progress.style.transform = "scaleX(" + (distance > 0 ? scrollY / distance : 0) + ")";
    nav?.classList.toggle("solid", scrollY > 24);
    let active = "";
    for (const s of sections) if (s.getBoundingClientRect().top <= 150) active = "#" + s.id;
    links.forEach((l) => {
      l.classList.toggle("on", l.hash === active);
      if (l.hash === active) l.setAttribute("aria-current", "location"); else l.removeAttribute("aria-current");
    });
  }
  addEventListener("scroll", () => { if (!scheduled) { scheduled = true; requestAnimationFrame(update); } }, { passive: true });
  addEventListener("resize", update);
  update();
  if (!motionOff && "IntersectionObserver" in window) {
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) if (entry.isIntersecting) { entry.target.classList.add("arrived"); observer.unobserve(entry.target); }
    }, { threshold: 0.08 });
    document.querySelectorAll(".way, .cell, .stepl, .terms2 > div").forEach((el, i) => {
      el.style.setProperty("--arrival-delay", (i % 3) * 65 + "ms");
      observer.observe(el);
    });
  }
})();

// ---- register rows arrive one after another when the section scrolls in (the reference's 1.4s fade, staggered)
(() => {
  const wrap = document.querySelector(".logwrap");
  if (!wrap || motionOff || !("IntersectionObserver" in window)) return;
  new IntersectionObserver((es, o) => {
    if (!es[0].isIntersecting) return;
    wrap.querySelectorAll(".ln").forEach((r, i) => { r.style.setProperty("--row-delay", i * 120 + "ms"); r.classList.add("new"); });
    o.disconnect();
  }, { threshold: 0.2 }).observe(wrap);
})();

// ---- how a record lands: walk the four stages in turn while on screen; hover or tap holds one
(() => {
  const how = document.querySelector(".howto");
  if (!how || motionOff) return;
  const steps = [...how.querySelectorAll(".stepl")];
  const parts = [...how.querySelectorAll(".diagram [data-step]")];
  let at = 0, timer = null, held = false;
  const show = (n) => {
    at = n;
    steps.forEach((el, i) => el.classList.toggle("on", i === n));
    parts.forEach((g) => g.classList.toggle("on", Number(g.dataset.step) === n + 1));
    how.classList.toggle("at-4", n === 3);
  };
  const run = () => { if (!timer) timer = setInterval(() => { if (!held) show((at + 1) % steps.length); }, 3400); };
  const stop = () => { clearInterval(timer); timer = null; };
  how.classList.add("playing");
  show(0);
  steps.forEach((el, i) => {
    el.addEventListener("mouseenter", () => { held = true; show(i); });
    el.addEventListener("mouseleave", () => { held = false; });
    el.addEventListener("click", () => show(i));
  });
  new IntersectionObserver((es) => (es[0].isIntersecting ? run() : stop()), { threshold: 0.2 }).observe(how);
})();

// ---- the stack: one block per record, solid when stated, outlined while it waits. Drag to turn; idle drift unless reduced.
const stack = (() => {
  const canvas = document.getElementById("stack");
  if (!canvas) return null;
  const ctx = canvas.getContext("2d");
  let yaw = 0.7, drag = null, raf = 0, w = 0, h = 0, dpr = 1;
  const css = (n) => getComputedStyle(canvas).getPropertyValue(n).trim();
  const cube = (cx, cy, s, a) => {
    const c = Math.cos(a), sn = Math.sin(a), tilt = 0.5;
    const pt = (x, y, z) => { const rx = x * c - z * sn, rz = x * sn + z * c; return [cx + rx * s, cy + (y * 1 + rz * tilt) * s]; };
    const V = [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]].map((v) => pt(v[0], v[1] * 0.55, v[2]));
    return { V, faces: [[0,1,2,3],[4,5,6,7],[0,1,5,4],[3,2,6,7],[0,3,7,4],[1,2,6,5]] };
  };
  function draw() {
    const states = (canvas.dataset.states || "").split(",").filter(Boolean);
    dpr = Math.min(devicePixelRatio || 1, 2);
    w = canvas.clientWidth; h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const ink = css("color") || "currentColor", root = getComputedStyle(document.documentElement), tok = (n, f) => root.getPropertyValue(n).trim() || f;
    const tint = { stated: tok("--c-mint", ink), unconfirmed: tok("--c-coral", ink), absent: tok("--c-slate", ink) };
    const n = Math.max(states.length, 1), s = Math.min(w * 0.2, h / (n * 1.6 + 1));
    const gap = s * 1.5;
    ctx.lineWidth = 1.5; ctx.strokeStyle = ink; ctx.lineJoin = "round";
    states.forEach((st, i) => {
      const cy = h / 2 + (i - (n - 1) / 2) * gap;
      const { V, faces } = cube(w / 2, cy, s, yaw + i * 0.18);
      faces.forEach((f, fi) => {
        ctx.beginPath();
        f.forEach((vi, k) => (k ? ctx.lineTo(V[vi][0], V[vi][1]) : ctx.moveTo(V[vi][0], V[vi][1])));
        ctx.closePath();
        if (st === "stated") { ctx.globalAlpha = 0.45 + fi * 0.09; ctx.fillStyle = tint.stated; ctx.fill(); ctx.globalAlpha = 1; }
        ctx.strokeStyle = st === "stated" ? ink : tint[st] || ink;
        ctx.stroke();
      });
    });
  }
  const tick = () => { if (!drag) yaw += 0.004; draw(); raf = requestAnimationFrame(tick); };
  canvas.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, yaw }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener("pointermove", (e) => { if (drag) { yaw = drag.yaw + (e.clientX - drag.x) * 0.01; if (motionOff) draw(); } });
  const end = () => { drag = null; };
  canvas.addEventListener("pointerup", end); canvas.addEventListener("pointercancel", end);
  addEventListener("resize", draw);
  if (motionOff) draw();
  else new IntersectionObserver((es) => { if (es[0].isIntersecting) { if (!raf) tick(); } else { cancelAnimationFrame(raf); raf = 0; } }).observe(canvas);
  return { draw };
})();

load();
