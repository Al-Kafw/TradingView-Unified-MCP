# Paused Replay causality — bounded live evidence and refusal diagnostics

This note supplements Replay research code checkpoint `4423cc2`. It does **not** certify the new branch as fully live-verified or authorize a Replay change. This evidence was collected 28 October 2026 through the already connected read-only MCP, with no chart movement or edits.

## Three independently observed paused Replay sources

Each had bracketed stable chart identity, Replay clock/autoplay state, and two identical newest-first native loaded-OHLC captures:

| Saved layout | Symbol/timeframe | Replay cursor (Unix s) | Latest loaded open (Unix s) | Cursor minus loaded open |
| --- | --- | ---: | ---: | ---: |
| `0Zi4puyi` | NQ1! / 30M | `1791483299` | `1791482400` | 899 seconds |
| `DobiYFrf` | YM1! / 5M | `1791553199` | `1791552900` | 299 seconds |
| `KrnVg2oE` | YM1! / 30M | `1791552599` | `1791550800` | 1,799 seconds |

None had loaded candle opens strictly later than its cursor. This is **positive single-source causality evidence only**, not an integrated pass of the changed multi-source evaluator. Replay times/timeframes differ, so no approved aligned paused-Replay pair was available. Never move or save those charts to force a test.

## Small fail-closed diagnostic improvement

When the evaluator returns `REPLAY_HISTORY_AHEAD_OF_CURSOR`, preserve `observations[i].latest_loaded_time_unix` before returning, without fabricating a closed-candle timestamp. The refusal/authorization behavior is unchanged. Two added synthetic regression cases assert the evidence for both first-source and second-source future-loaded failures; future-history detection itself remains synthetic until a safe live reproducer is available.

This branch remains **offline_verified_not_live**, unapproved for consumer use. The original accepted MCP and the running read-only tunnels remain unchanged.
