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

## Direct ChatGPT acceptance — 28 October 2026

- The separate **TradingView Pine QA Read-Only** plugin was installed and directly exposed **110 read-only MCP tools**, including `pine_get_editor_provenance_qa`. The original Read-Only Pilot and accepted Git branch were not replaced.
- Direct ChatGPT `pine_get_editor_provenance_qa` on Combined Research QA (`DobiYFrf`, ES1! 5M) returned `ok=true`, `status=matched`, native saved script version **6.0**, stable unique same-widget visual title matching the saved library name, and matching **raw and LF-normalized** hashes. Both editor and saved source used CRLF; no source contents were returned by the composite. No mutation/compile authority was granted.
- Subsequent checks returned safe refusals `LAYOUT_ID_OR_SAVED_STATE_UNVERIFIED` and `NATIVE_EDITOR_BINDING_UNVERIFIED`. Independent read-only observation later showed a version **7.0** editor binding and alternating clean/dirty layout state. The first direct success is valid only for its captured version/state and is not continuous stability certification. No source save/discard/reload was requested.
- **Approval remains false.** This documentation-only update neither merges code into `qa/mcp-safety-p2-20261024` nor authorizes compiler mutations. The separate offline-only disposable compile guard `3ccdeff` is not included in this candidate.
