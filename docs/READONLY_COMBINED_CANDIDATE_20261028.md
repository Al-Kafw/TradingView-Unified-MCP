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
