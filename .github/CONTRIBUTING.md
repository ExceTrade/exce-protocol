# Contributing

Thanks for looking at Exce. This repository is the public page and its tooling.

## Ground rules

- **State facts, do not imply them.** A new outside fact (address, link, number, date) goes into
  `src/records.json` with a state, an `asOf` date and a `source`. Do not hard-code it into the template or the copy.
- **No invented numbers.** If a figure has not been stated by the team, it does not appear on the page or in `docs/`.
- **Colours live in `src/tokens.json`.** Do not write colour values anywhere else.
- **Keep motion optional.** Anything animated must stop under `prefers-reduced-motion`.

## Workflow

1. Fork and branch from `main`.
2. Make a focused change.
3. Run both commands and make sure they exit 0:

   ```bash
   npm run build
   npm run gates
   ```

4. Open a pull request describing what changed and, for any fact, where it was stated.

## Reporting problems

Wrong or stale information on the page: open an issue with the record name and the source that contradicts it.
Security problems: do not open a public issue; follow [SECURITY.md](SECURITY.md).

## Style

Match the surrounding code: small modules, plain JavaScript modules, no dependencies unless there is a strong reason.
Write copy in plain language and keep it original.
