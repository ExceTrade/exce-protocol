# Security policy

## Scope

This repository contains the static public page for Exce and its build tooling. It holds no keys, no wallet code
and no smart contracts. No contract address has been stated yet; when one is, it will appear in `src/records.json`
and on the page. Treat any other address presented as Exce's as unverified.

## Reporting a vulnerability

Please do not file a public issue for a security problem.

Use GitHub's private vulnerability reporting on this repository (Security tab, "Report a vulnerability"). Include:

- what you found and where;
- steps to reproduce;
- the impact you expect.

You can expect an acknowledgement, and a follow-up once the report has been assessed. Good-faith research that avoids
harming users or the hosted site is welcome.

## Things worth reporting

- Cross-site scripting or injection through the record renderers.
- A path that makes the page show a copyable address or a live link for a record that is not stated.
- A look-alike or spoofed address presented as the official one.
- Supply-chain issues in the build tooling.

## Impersonation

Only channels recorded as stated in `src/records.json` are official. Anyone asking for funds or keys in the name of
Exce through another channel is not acting for the project.
