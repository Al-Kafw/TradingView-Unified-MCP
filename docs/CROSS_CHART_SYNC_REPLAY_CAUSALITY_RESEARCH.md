# Cross-chart Replay cursor causality — research only

- Accepted baseline: GitHub QA checkpoint `2a5fb76` (code `6cfa766`), 510/510 offline tests, `live_verified_scoped` on its *original code*.
- Prior direct ChatGPT read-only acceptance (reported 27 Oct 2026): live YM/YM 30M pair aligned 20/20 closed candidates, NQ paused Replay versus YM live refused `MIXED_REPLAY_AND_LIVE`, and mismatched 5M/30M request refused `TIMEFRAME_REQUEST_MISMATCH`. These are evidence for the **accepted baseline**, not this branch.

## Narrow failure mode
Two charts can have identical paused Replay cursors and matching *loaded* OHLC timestamps, but the loaded series could still contain candles with opening times **later than the Replay cursor**. Previously the cross-chart gate did not explicitly reject this noncausal history.

## Research change
After verifying the loaded OHLC shape, block `REPLAY_HISTORY_AHEAD_OF_CURSOR` if the latest loaded candle open in any paused-Replay source exceeds that source's Replay cursor. Because candles are sorted newest-first, this blocks future loaded history without fabricating bar-close times or needing session calendars. This is a necessary **but not sufficient** condition for independent Replay candle finality.

## Tests and promotion rules
Three synthetic fixtures cover both sources ahead, only one source ahead, and a bar starting exactly at the cursor. The pre-existing Replay and live tests must remain green. The accepted worktree, live MCP tunnel and TradingView state are untouched. **This research branch is not live-verified or approved for consumer use.** Do not merge or promote until a deliberate scoped read-only acceptance on a disposable, user-authorised paused Replay pair is available. Never change a protected chart or move Replay merely to generate a pass.
