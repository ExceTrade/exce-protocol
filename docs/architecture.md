# Architecture

The site is a static page. There is no server component and no runtime dependency.

## Data flow

```
src/records.json ──► tools/build.mjs ──► dist/index.html   (every region pre-rendered)
                                     └─► dist/records.json (read again by the page at load)
src/register.js  ── shared by the build (node) and the page (browser)
```

`src/register.js` is the single source of truth for how a record becomes markup. The build calls its renderers to
pre-render the page, so the page is complete without JavaScript. In the browser, `src/app.js` fetches
`records.json` (no cache) and calls the same renderers again, so a restated record shows without a rebuild and the
two paths cannot drift.

## Modules

| File | Role |
| --- | --- |
| `src/index.html` | template; `{{slot}}` markers filled by the build |
| `src/records.json` | the register |
| `src/register.js` | record views, renderers, address matching, handle derivation |
| `src/app.js` | copy-to-clipboard, matcher, scroll state, section walk, block-stack figure |
| `src/styles.css` | layout and motion; no colour literals |
| `src/tokens.json` | the only file holding colour values (sampled palette with pixel provenance) |
| `src/theme.css` | colour roles derived with `color-mix()`; no literals |
| `tools/brand.mjs` | premultiplied logo resizes; favicon and mark traced from the logo's pixel grid |
| `tools/build.mjs` | `src/` to `dist/` |
| `tools/gates.mjs` | checks; exits non-zero on any failure |
| `tools/serve.mjs` | local static server for measurement |

## Rules the code enforces

- **Link rule.** A URL is stored; the handle is derived from it. A record that is not stated yields no `href`.
- **Address gate.** An address-shaped string is compared with the stated registry; it is never rejected only for being hex.
- **Palette.** Colour literals live in `src/tokens.json` only; the build writes them to `dist/tokens.css`.
- **Motion.** Animations respect `prefers-reduced-motion`.
- **Touch targets.** Interactive elements are at least 44 by 44 CSS pixels.

## Gates and mutation

`npm run gates` rebuilds the page from copies of the register in which each record is forced into each state. Each
expectation is derived from the mutated record itself, never from a fixed assumption about today's state, so the
checks keep working as records change.

## Deploy

`dist/` is the whole deploy output. Upload or drag the folder to a static host. `dist/_headers` sets no-cache on
`index.html` and `records.json` for hosts that read it.
