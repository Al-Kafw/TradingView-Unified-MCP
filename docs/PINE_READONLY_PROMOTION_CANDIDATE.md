# Read-only Pine provenance promotion candidate — 27 October 2026

This is **not** a production merge. The accepted MCP remains at `2a5fb76`.

## Source basis

- Read-only source at `f495669` consists of line-ending provenance, one composite `pine_get_editor_provenance_qa` tool, and visible same-widget title observation.
- Existing exact raw-source mutation guards remain unchanged from the accepted branch.
- Disposable Pine compilation hardening at `3ccdeff` remains separately **offline-only** and is intentionally NOT included here.

## Evidence

- Published Mac tests at source `f495669`: **532/532**; source and release audits passed.
- Direct local TradingView live acceptance: `PINE_SPLIT_EDITOR_TITLE_LIVE` PASS on `DobiYFrf` ES1! 5M, saved Pine version 4.0.
- Native editor ID/version was stable; saved-library source and editor source matched after CRLF-to-LF normalization; exact raw hashes differed.
- Exactly one visible title above the unique Monaco editor within the same `.tv-script-widget` matched the saved **library name**. Native `scriptTitle` was different and not used as a substitute.
- Composite provenance `PASS_CLEAN_LAYOUT`, read-only, non-atomic; source content not returned; chart changes zero.

## Gates remaining

1. Review this candidate independently; preserve accepted protected charts and the existing tunnel.
2. Run the full offline test suite and source/release audits on the candidate (installer enforces this).
3. After a separately authorized candidate deployment, verify direct ChatGPT callability of `pine_get_editor_provenance_qa` on an approved read-only chart, then update the capability status to approved for consumer.
4. Do not combine the separately unverified disposable compiler guard without its own QA. No live Pine compilation or writes have been authorized.

Do not interpret matched source text as successful compilation or chart signal correctness.
