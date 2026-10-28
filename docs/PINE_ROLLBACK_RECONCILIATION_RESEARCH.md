# Pine QA rollback — read-only saved-baseline reconciliation (offline research)

Base: `b444d44` (551/551 offline tests). Independent research branch only; no connected MCP or accepted Pine/chart source changes.

## Why this exists

`pine_remove_qa_study` verifies an **in-memory study baseline**, not a clean saved TradingView layout. The existing read-only `verifyQaSavedBaseline` independently checks exact QA/protected tab identities, chart symbol/timeframe/type, empty drawings, Volume ID and inputs, stopped Replay, and three consecutive clean browser observations.

This research adds a *read-only reconciliation function* that accepts only an exact positive rollback receipt and a bounded RestoreLab expected baseline. It can report `clean_browser_baseline_observed` after three independent reads, but always sets `persisted_cloud_state_verified: false` and never authorizes reload, compilation, saving or any other TradingView mutation.

Synthetic negative tests require failure on dirty layout, wrong Volume inputs, unstable clean reads, partial rollback receipts, missing protected chart, or wrong QA layout name. No test pretends a cloud save occurred, and there is no new MCP tool registration or live deployment.

## Still not proven

Actual Pine draft compilation, post-compile cleanup in TradingView, remote saved-layout persistence, and independent live RestoreLab restoration. These require separate explicit authorization and live evidence. Do not treat read-only browser cleanliness as a cloud persistence receipt.
