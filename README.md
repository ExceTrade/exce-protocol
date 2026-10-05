# Exce

Source for [exce.trade](https://exce.trade), the public page of Exce, a trading protocol on Robinhood Chain.

The page is built around one rule: **an outside fact is not shown as true until someone has stated it, and every
fact carries a state and a date.** The network, the contract address and the project channels each live in a single
record in `src/records.json`. A record is `stated`, `absent` or `unconfirmed`. Only a stated record lights up its slot;
the others stay inert and show the day they were last checked.

## Status

The live state of every record is in `src/records.json`; that file is the only authority. As of 2026-10-05 the
network record is stated (Robinhood Chain, chain id 4663, `0x1237`) and no contract address has been stated.

## Layout

```
src/        page source: template, styles, theme, tokens.json, script, register module, records
brand/      logo files the build resizes and traces (favicon, mark, touch icon)
tools/      build, local server, gates
dist/       deploy output (drag this folder to the host)
docs/       design notes, architecture, roadmap, tokenomics status
.github/    contributing and security policy
```

## Commands

```bash
npm run build    # src/ -> dist/
npm run gates    # rebuild, then check palette, copy, icons, motion and both branches of every gate
npm run serve    # serve dist/ on http://localhost:4173
```

Node 20 or newer. `sharp` is the only dependency, used at build time for the logo resize and trace.

## How a fact gets onto the page

1. Edit the record in `src/records.json` (state, payload, `asOf` date, `source`).
2. `npm run build`.
3. `npm run gates`. The gates rebuild the page from mutated copies of the register to prove that a record behaves
   correctly in each state, whatever state it is in today.

Links are stored as URLs and the handle is derived from them. A record that is not stated produces no `href`.

## Address matching

The matcher on the page compares any 0x string with the stated registry. It never calls a well-formed address
"invalid": an unknown address is reported as not in the register, and with an empty register it is reported as
neither matched nor ruled out.

## Documents

- [Whitepaper (design notes)](docs/whitepaper.md)
- [Architecture](docs/architecture.md)
- [Tokenomics status](docs/tokenomics.md)
- [Roadmap](docs/roadmap.md)
- [Contributing](.github/CONTRIBUTING.md)
- [Security policy](.github/SECURITY.md)

## License

MIT, see [LICENSE](LICENSE).
