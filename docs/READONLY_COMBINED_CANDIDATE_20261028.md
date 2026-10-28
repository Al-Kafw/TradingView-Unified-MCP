# Combined read-only MCP candidate — 28 October 2026

This is an **isolated, not-yet-approved** integration branch. It does not replace the accepted MCP, change either running tunnel, modify TradingView, compile Pine, operate Replay, or alter a protected chart.

## Exact source baselines

- Accepted MCP remains `2a5fb76f2e058d2b050ef37278dbd6f2b53f909e`.
- Candidate starts at Pine read-only `917932c1de5e1508b1e81a8a432b3c3ea38088ba` (532 offline tests; native provenance directly called once through ChatGPT; later unstable editor state correctly refused). Pine editor provenance **consumer approval remains false**.
- Copies exactly `src/features/cross-chart-sync-qa.mjs` and `tests/cross-chart-sync-qa.test.mjs` from Replay research `90d70627bb2c56364b2ca48ee77d2ef8b684feb1`. No other Replay research file is needed for the pure guard implementation.
- The Replay enhancement conservatively blocks `REPLAY_HISTORY_AHEAD_OF_CURSOR` when the newest loaded bar opens beyond a paused cursor, and retains offending loaded timestamps in its refusal. At initial integration, independent two-chart acceptance was outstanding; the scoped positive live acceptance is now documented below. A natural future-loaded negative case remains unverified.

## Explicit exclusions and promotion gates

- The **offline-only** disposable compilation preflight, Pine QA rollback hardening and rollback reconciliation branches are **not included**. There are no new chart mutation permissions, tool registrations or active MCP deployments.
- `src/features/pine.mjs` and `src/core/mutation-policy.mjs` remain exactly as in pinned Pine read-only candidate `917932c`.
- The existing accepted cross-chart sync capability remains only scoped live verified; the new paused-Replay causality condition must not be described as fully live certified.
- Full standalone Mac tests, schema check, source security audit and staged release audit are mandatory before committing this isolated branch. Expected total: **537 tests**, 110 registered read-only tools.
- Never merge into the accepted branch or switch/restart either tunnel without a new, separately authorized review and promotion decision.

## Evidence alignment — combined candidate

- Code checkpoint: `7f501e9910c348d5a808ea2577948f78666e5e9d`.
- Current offline results: 537/537 PASS, 39 test files, 0 failed/skipped (`docs/TEST_RESULTS.json`).
- The 532-test Pine-only checkpoint is historical and retained separately.
- Pine editor/title provenance: initial version 6.0 success followed by safe instability refusals; later three consecutive candidate-only version 14.0 checks passed. Broader stability and consumer approval remain outstanding.
- Replay causality: independent two-chart paused-Replay positive acceptance passed; both hybrid synthetic future-history refusals passed. Naturally occurring live future-loaded refusal remains unverified.
- This guard refuses unsafe comparisons; it does not correct TradingView's underlying future-loaded Replay feed.
- No Pine compilation or rollback mutation, Replay action, chart/layout mutation, protected Mentorship change, deployment, tunnel restart, production promotion, or merge is included or authorized.
- Running Pilot may remain on an older commit; this documentation alignment does not change the deployed MCP.

## Two-chart Replay acceptance — 28 October 2026

Candidate source tested: `5cb77f0df1036071ffd60009108d983eccaea9dc`.

Independent real TradingView QA sources:
- `n5CHUl8r` — ES1!, 15M, paused Replay.
- `2sPBmVxY` — ES1!, 15M, paused Replay.
- Both Replay clocks: `1791554399`, autoplay disabled.
- Both newest loaded candle opens: `1791553500`.
- Latest excluded developing candle; newest closed candidate: `1791552600`.

**Positive live acceptance — PASS:** The standalone Mac runtime executed the candidate's `data_get_cross_chart_sync_qa` against both independently loaded QA charts. Result: `aligned`, `paused_replay`, 12 common closed candles, no chart mutations.

**Two-source hybrid negative acceptance — PASS x2:** Stable native OHLC captures from both real charts were passed to the candidate evaluator. The latest timestamp was changed in memory only, separately for each source, to `1791554400` (one second beyond the Replay cursor). Both cases returned `REPLAY_HISTORY_AHEAD_OF_CURSOR`, refused comparison, preserved the offending timestamp and did not claim a closed candle.

**Limit:** Neither negative case reproduced a genuinely future-loaded TradingView feed. The guard does not detect every possible future-value leak within a candle whose opening timestamp precedes the cursor. No cross-market synchronization, broad timeframe support or Pine correctness is certified.

**Decision:** Scoped live-positive and hybrid-negative acceptance passed. Full natural future-feed negative certification, Pine consumer approval and production promotion remain outstanding. No chart edits, Replay actions, running-server changes or protected-layout changes were made by the acceptance scripts.

## Pine candidate stability — 28 October 2026

Candidate source checkpoint: `c87819da479be65fff4aa4fd341a0bcc1a67c0a1`.

**Result: PASS — three consecutive candidate-only live checks.**

- Exact QA layout: `DobiYFrf`, clean before and after every check.
- Native Pine ID: `USER;630d9b8bdd6048b4bc1bb2ab746fd583`.
- Saved version: `14.0` in all three observations.
- Editor and saved-source raw hashes identical:
  `601e57589d7ca37245b0364724358161ad6ff730dd669205c902a4008f26b17e`.
- LF-normalized source parity and uniquely visible editor title verified.
- The actual combined-candidate `pine_get_editor_provenance_qa` was exercised through a standalone read-only runtime.
- Zero Pine compilations, writes, or chart mutations.

**Scope:** Repeated stable observations on one clean layout and one saved version. This does not establish stability across editor revisions, TradingView updates, dirty layouts, or compiled runtime correctness.

**Release decision:** Scoped candidate provenance acceptance passed. Consumer approval remains false; no Pine compilation authority, accepted-branch merge, running MCP replacement, or production promotion is authorised.

## Isolated HTTP canary — 28 October 2026

Candidate source: `4ff2680f85a8a3ba792948e0b75b99f59522bf23`.

Operator-provided standalone Mac transcript:

- Authenticated loopback HTTP transport: PASS.
- Unauthenticated request rejected with HTTP 401: PASS.
- Registered read-only tools: 110; no mutating tools exposed.
- Paused Replay two-chart synchronization: PASS, 12 closed candles.
- Pine editor provenance: matched, saved version `14.0`.
- Reported chart mutations: zero.
- Temporary HTTP server exited and its temporary runtime directory was removed.

**Scope:** A standalone authenticated transport canary, not a persistent ChatGPT connector deployment. No running MCP, tunnel, accepted Git branch, protected layout or Pine source was changed by the canary.

**Decision:** GO for separately authorised, isolated read-only connection rollout. No production promotion, accepted-branch merge, Pine compilation, write permissions or full future-loaded Replay certification.
