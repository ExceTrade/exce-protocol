# Exce: design notes

Status: working draft. This document records what is stated. Where something has not been stated, it says so and
leaves the space empty rather than filling it with a guess.

## 1. Purpose

Exce is a trading protocol deployed on Robinhood Chain (chain id 4663, `0x1237`). Public trust in a young protocol
usually breaks in the gap between what a page implies and what has been published. These notes describe how Exce
closes that gap on its own surfaces: nothing is presented as fact until it is written down, dated and sourced.

## 2. The register

Every outside fact about the project is a **record** with:

- a `state`: `stated`, `absent` or `unconfirmed`;
- an `asOf` date, the day it was last checked;
- a `source`, naming where the statement came from;
- a payload (an address, a URL, a network description) that exists only when the state is `stated`.

State transitions:

| From | To | Cause |
| --- | --- | --- |
| absent | stated | the team provides the fact |
| stated | unconfirmed | the statement is questioned or superseded |
| unconfirmed | stated | the team restates it |
| any | absent | the fact is withdrawn |

A record that is not stated renders as inert and dated. It carries no link, offers no copy action and displays no
value, so a visitor cannot mistake a placeholder for a commitment.

## 3. Address gate

Exce publishes one contract address, once it exists. The page treats address checking as a comparison, not a
validation: any string of `0x` plus forty hex digits is address-shaped and is compared with the stated registry.
Outcomes are *match*, *not in the register* and, while the registry is empty, *nothing to compare against*. No
well-formed address is ever labelled invalid for simply being unknown.

## 4. Network

The stated network is Robinhood Chain, chain id 4663 (`0x1237`), with the public RPC endpoint recorded in
`src/records.json`. The source of record is a client statement dated 2026-09-02.

## 5. Protocol mechanics

Not yet stated. Order types, matching, settlement, fees, custody model and risk parameters have not been published
and are deliberately not described here. When they are stated they will be added to this document with a date and a
source, and the page will be updated through the register.

## 6. Verification

The repository ships a gate suite (`npm run gates`) that rebuilds the page from altered registers to check that each
slot behaves correctly in every state. It is the project's guard against a page that claims more than the register
holds.

## 7. Open items

- Contract address: absent.
- Protocol specification: absent.
- Channel records (X, GitHub): see `src/records.json` for their current state.
