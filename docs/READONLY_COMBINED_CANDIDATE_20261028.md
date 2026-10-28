# Combined read-only MCP candidate — 28 October 2026

This is an **isolated, not-yet-approved** integration branch. It does not replace the accepted MCP, change either running tunnel, modify TradingView, compile Pine, operate Replay, or alter a protected chart.

## Exact source baselines

- Accepted MCP remains `2a5fb76f2e058d2b050ef37278dbd6f2b53f909e`.
- Candidate starts at Pine read-only `917932c1de5e1508b1e81a8a432b3c3ea38088ba` (532 offline tests; native provenance directly called once through ChatGPT; later unstable editor state correctly refused). Pine editor provenance **consumer approval remains false**.
- Copies exactly `src/features/cross-chart-sync-qa.mjs` and `tests/cross-chart-sync-qa.test.mjs` from Replay research `90d70627bb2c56364b2ca48ee77d2ef8b684feb1`. No other Replay research file is needed for the pure guard implementation.
- The Replay enhancement conservatively blocks `REPLAY_HISTORY_AHEAD_OF_CURSOR` when the newest loaded bar opens beyond a paused cursor, and retains offending loaded timestamps in its refusal. It has offline synthetic and hybrid live-data evidence but **not independent aligned two-chart paused-Replay live certification**.

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
- Pine editor/title provenance: one successful direct ChatGPT read-only saved/editor version 6.0 observation; later unstable editor states refused. Persistent stability and consumer approval are not established.
- Replay causality: `REPLAY_HISTORY_AHEAD_OF_CURSOR` is covered offline and by bounded hybrid evidence; independent aligned two-chart paused-Replay live acceptance remains outstanding.
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
