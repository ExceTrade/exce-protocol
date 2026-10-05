// The register: one record per outside fact. Shared by the build (node) and the page (browser), so what is
// pre-rendered into dist/index.html and what the page re-renders after reading records.json cannot drift.
// Every renderer takes the records as they are right now; none of them assumes a state.

export const STATES = ["stated", "absent", "unconfirmed"];
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const SOCIAL_HOSTS = { x: ["x.com", "www.x.com", "twitter.com", "www.twitter.com"], github: ["github.com", "www.github.com"] };

export const ICONS = {
  x: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
  github: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M10.226 17.284c-2.965-.36-5.054-2.493-5.054-5.256 0-1.123.404-2.336 1.078-3.144-.292-.741-.247-2.314.09-2.965.898-.112 2.111.36 2.83 1.01.853-.269 1.752-.404 2.853-.404 1.1 0 1.999.135 2.807.382.696-.629 1.932-1.1 2.83-.988.315.606.36 2.179.067 2.942.72.854 1.101 2 1.101 3.167 0 2.763-2.089 4.852-5.098 5.234.763.494 1.28 1.572 1.28 2.807v2.336c0 .674.561 1.056 1.235.786 4.066-1.55 7.255-5.615 7.255-10.646C23.5 6.188 18.334 1 11.978 1 5.62 1 .5 6.188.5 12.545c0 4.986 3.167 9.12 7.435 10.669.606.225 1.19-.18 1.19-.786V20.63a2.9 2.9 0 0 1-1.078.224c-1.483 0-2.359-.808-2.987-2.313-.247-.607-.517-.966-1.034-1.033-.27-.023-.359-.135-.359-.27 0-.27.45-.471.898-.471.652 0 1.213.404 1.797 1.235.45.651.921.943 1.483.943.561 0 .92-.202 1.437-.719.382-.381.674-.718.944-.943"/></svg>',
};

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const isAddress = (s) => typeof s === "string" && ADDRESS.test(s);

const live = (r) => !!r && r.state === "stated";

// ---- link rule: the URL is what is stored; the handle is derived from it. No stated URL, no href.
export function deriveHandle(kind, url) {
  if (typeof url !== "string") return null;
  let u;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== "https:" || !SOCIAL_HOSTS[kind]?.includes(u.hostname.toLowerCase())) return null;
  const parts = u.pathname.split("/").filter(Boolean);
  if (!parts.length) return null;
  if (kind === "x") return /^[A-Za-z0-9_]{1,15}$/.test(parts[0]) ? "@" + parts[0] : null;
  return /^[A-Za-z0-9-]{1,39}$/.test(parts[0]) ? parts.slice(0, 2).join("/") : null;
}

export function socialView(id, rec) {
  const handle = live(rec) ? deriveHandle(id, rec.url) : null;
  return { id, label: rec?.label ?? id, state: rec?.state ?? "absent", asOf: rec?.asOf ?? "", href: handle ? rec.url : null, handle };
}

export function contractView(rec) {
  const addr = live(rec) && isAddress(rec.value) ? rec.value : null;
  return { state: rec?.state ?? "absent", asOf: rec?.asOf ?? "", address: addr };
}

export function chainView(rec) {
  const v = live(rec) && rec.value && Number.isInteger(rec.value.chainId) ? rec.value : null;
  return { state: rec?.state ?? "absent", asOf: rec?.asOf ?? "", chain: v };
}

const stateWord = (s) => (s === "stated" ? "Stated" : s === "unconfirmed" ? "Unconfirmed" : "Absent");
const when = (d) => (d ? "checked " + d : "undated");

// ---- gate: address-shaped strings are matched against the stated registry, never rejected for being 0x hex.
export function registryAddresses(records) {
  return Object.values(records).filter((r) => r.kind === "address" && live(r) && isAddress(r.value)).map((r) => r.value.toLowerCase());
}
export function matchAddress(input, records) {
  const s = String(input ?? "").trim();
  if (!s) return { kind: "idle", text: "" };
  if (!ADDRESS.test(s)) return { kind: "shape", text: "That string lacks 40 hex digits after 0x, so there is nothing to compare." };
  const known = registryAddresses(records);
  if (!known.length) {
    const asOf = records.contract?.asOf;
    return { kind: "empty", text: "The register holds no stated address yet (" + when(asOf) + "), so this one can be neither matched nor ruled out." };
  }
  return known.includes(s.toLowerCase())
    ? { kind: "match", text: "Match: this equals the stated contract." }
    : { kind: "unmatched", text: "Well formed, yet absent from this register: not the stated Exce contract." };
}

// ---- renderers (HTML strings)
export function renderCA(records) {
  const v = contractView(records.contract);
  if (v.address) {
    return '<div class="ca-slot" data-state="stated"><span class="ca-k">Contract</span>' +
      '<button type="button" class="ca-v" data-copy="' + esc(v.address) + '" aria-label="Copy the full contract">' + esc(v.address) + "</button>" +
      '<span class="ca-fb" role="status" aria-live="polite"><span class="ca-hint">Tap to copy</span></span></div>';
  }
  return '<div class="ca-slot inert" data-state="' + esc(v.state) + '"><span class="ca-k">Contract</span>' +
    '<span class="ca-v ghost" role="img" aria-label="Contract slot ' + esc(stateWord(v.state).toLowerCase()) + ", " + esc(when(v.asOf)) + '">' + (v.state === "unconfirmed" ? "Unconfirmed" : "Not stated yet") + "</span>" +
    '<span class="ca-fb"><span class="ca-hint">Nothing to copy · ' + esc(when(v.asOf)) + "</span></span></div>";
}

export function renderSocial(id, rec) {
  const v = socialView(id, rec);
  if (v.href) {
    return '<a class="soc" data-soc="' + id + '" data-state="stated" href="' + esc(v.href) + '" target="_blank" rel="noopener" aria-label="' + esc(v.label + (id === "x" ? " profile " : " repository ") + v.handle + ", external link") + '">' + ICONS[id] + "</a>";
  }
  const word = v.state === "unconfirmed" ? "unconfirmed" : "not stated";
  return '<span class="soc inert" data-soc="' + id + '" data-state="' + esc(v.state) + '" role="img" aria-label="' + esc(v.label + " " + word + ", " + when(v.asOf)) + '" title="' + esc(v.label + " " + word + ", " + when(v.asOf)) + '">' + ICONS[id] + "</span>";
}
export const renderSocials = (records) => renderSocial("x", records.x) + renderSocial("github", records.github);

export function renderStatus(records) {
  const c = chainView(records.chain);
  return '<span class="dot' + (c.chain ? " on" : "") + '"></span><span>' + (c.chain ? "Chain " + c.chain.chainId : "Chain —") + "</span>";
}

export function counts(records) {
  const all = Object.entries(records);
  const social = all.filter(([, r]) => r.kind === "social");
  return { total: all.length, stated: all.filter(([, r]) => live(r)).length, social: social.length, socialStated: social.filter(([id, r]) => live(r) && deriveHandle(id, r.url)).length };
}

export function renderTiles(records) {
  const c = chainView(records.chain), k = contractView(records.contract), n = counts(records);
  const cell = (key, val, sub, cls = "") => '<div class="cell"><div class="k">' + key + '</div><div class="v ' + cls + '">' + val + '</div><div class="s">' + sub + "</div></div>";
  return cell("Chain id", c.chain ? c.chain.chainId : "—", c.chain ? esc(c.chain.chainIdHex + " · " + c.chain.name) : esc(stateWord(c.state).toLowerCase() + " · " + when(c.asOf))) +
    cell("Contract", stateWord(k.state), esc(k.address ? "full address pinned at the top" : when(k.asOf)), k.address ? "good" : "") +
    cell("Channels", n.socialStated + " / " + n.social, "icons top right wake when stated") +
    cell("Register", n.stated + " / " + n.total, "records stated, the rest dated", n.stated === n.total ? "good" : "");
}

function valueText(id, rec) {
  if (!live(rec)) return "—";
  if (rec.kind === "chain") { const c = chainView(rec).chain; return c ? c.name + " · " + c.chainId : "—"; }
  if (rec.kind === "address") return isAddress(rec.value) ? rec.value.slice(0, 6) + "…" + rec.value.slice(-4) : "—";
  return deriveHandle(id, rec.url) ?? "—";
}
export function renderLog(records) {
  return Object.entries(records).map(([id, r]) =>
    '<div class="ln ' + esc(r.state) + '" data-record="' + esc(id) + '"><span class="blk">' + esc(id) + '</span><span class="kind">' + esc(stateWord(r.state)) +
    '</span><span class="who2">' + esc(valueText(id, r)) + '</span><span class="detail">' + esc(r.source ?? "") + '</span><span class="amt">' + esc(r.asOf || "undated") + "</span></div>").join("");
}
export const renderLogCount = (records) => Object.keys(records).length + " records";

export function renderFigureCaption(records) {
  const n = counts(records);
  return "<b>" + n.stated + " of " + n.total + " stated</b><span>Filled blocks are stated; hollow ones still wait. Spin the stack with your pointer.</span>";
}
export const figureStates = (records) => Object.values(records).map((r) => r.state).join(",");

export function renderDateline(records) {
  const c = chainView(records.chain);
  return c.chain ? esc(c.chain.name + " · id " + c.chain.chainId + " · exce.trade") : "Chain not stated · exce.trade";
}

export function renderRpcCard(records) {
  const c = chainView(records.chain);
  if (c.chain) {
    return '<li><b>' + c.chain.chainId + '</b> chain id, ' + esc(c.chain.chainIdHex) + '</li><li>One public endpoint, copied as written</li>';
  }
  return "<li>Chain record is " + esc(stateWord(c.state).toLowerCase()) + ", " + esc(when(c.asOf)) + "</li>";
}
export function renderRpcButton(records) {
  const c = chainView(records.chain);
  return c.chain
    ? '<button type="button" class="btn" data-copy="' + esc(c.chain.rpc) + '" data-copy-label="Copy RPC URL">Copy RPC URL</button>'
    : '<button type="button" class="btn" disabled aria-disabled="true">Copy RPC URL</button>';
}

export function renderFootChain(records) {
  const c = chainView(records.chain);
  return c.chain ? esc(c.chain.name + ", chain id " + c.chain.chainId + " (" + c.chain.chainIdHex + "), " + when(c.asOf)) : "Chain " + esc(stateWord(c.state).toLowerCase()) + ", " + esc(when(c.asOf));
}
export function renderFootSocials(records) {
  return ["x", "github"].map((id) => {
    const v = socialView(id, records[id]);
    const label = id === "x" ? "X" : "GitHub";
    return v.href
      ? '<a class="fl" href="' + esc(v.href) + '" target="_blank" rel="noopener">' + ICONS[id] + esc(v.handle + " on " + label) + "</a>"
      : '<span class="fl inert">' + ICONS[id] + esc(label + " · not stated, " + when(v.asOf)) + "</span>";
  }).join("");
}

// regions: element id -> renderer. The build fills them into the template; app.js refreshes them from records.json.
export const REGIONS = {
  "ca": renderCA, "socials": renderSocials, "status": renderStatus, "tiles": renderTiles, "log": renderLog,
  "log-count": renderLogCount, "fig-caption": renderFigureCaption, "dateline-mid": renderDateline,
  "rpc-list": renderRpcCard, "rpc-btn": renderRpcButton, "foot-chain": renderFootChain, "foot-social": renderFootSocials,
};
