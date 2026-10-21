# Validation — 2026-10-21

## Outcome

- 185 implemented tools; 180 exposed by default; 101 in read-only mode.
- 215/215 automated tests passed across 13 test files, with no failures or skips, on Node 24.2.0/macOS.
- 38/38 tests passed in the security/protocol subset.
- Runtime imports, unique tool names, registered schemas, and JavaScript syntax checks passed.
- The narrow static source gate found no prohibited patterns or npm dependencies.
- Real stdio-process and authenticated loopback HTTP tests passed, including readonly discovery, host/origin/auth checks, oversized request refusal, and clean shutdown.
- Hosted CI jobs did not start during this review; no hosted test pass is claimed. Linux/macOS workflow configuration is supplied for subsequent runs.

## Live evidence

The dedicated launcher and loopback debugger worked with Chrome 155 on macOS. The read-only live suite returned results for all 19 checked operations. See [the anonymized report](LIVE_VALIDATION.json). A returned list/read does not establish every optional feature, entitlement, or mutation.

Temporary-object tests verified independent saved layout IDs, source metadata preservation, symbol/timeframe changes, and persisted save readback. One copy comparison verified the observable chart contents; other comparisons reported differing study inputs and did not claim full fidelity. Exact-symbol validation refused a venue substitution when TradingView selected BATS for a requested NASDAQ instrument.

**Live alert creation remains unresolved.** Test creation and a control using TradingView's own current request API returned `invalid_request`. Alert code was updated to follow inspected current native serialization conventions and has offline regression coverage, but those changes did not establish a successful live alert creation. No webhook endpoint was configured or contacted in the live mutation checks. The combined copy-and-webhook-alert workflow is consequently unverified live.

Reconciliation found no remaining audit alerts or saved audit layouts. No existing account alert was changed or deleted. Live account responses, source code, object IDs, names, webhook URLs, and credentials are excluded from published validation reports.

## Reproduce

```bash
npm run check
npm run audit:source
npm test
npm run test:security
npm run catalog
npm run audit:release
```

For explicit live reads after launching/signing in to the dedicated browser:

```bash
npm run test:live
# Or select an exact tab when several are open:
node scripts/live-check.mjs TARGET_ID
```

The ordinary test suite uses synthetic fixtures and local sockets, with no TradingView network access. `test:live` deliberately uses the browser and public TradingView scanner. It stores pass/fail summaries, not raw account results.

## Evidence boundaries

[TEST_RESULTS.json](TEST_RESULTS.json) records individual outcomes and the SHA-256 of sorted runtime-source/package paths and bytes, along with whether that source remained unchanged during testing. [SECURITY_TEST_RESULTS.json](SECURITY_TEST_RESULTS.json) records the dedicated subset. [TOOLS.json](TOOLS.json), [FEATURES.md](FEATURES.md), and [CATALOG_COUNTS.json](CATALOG_COUNTS.json) are generated from the runtime registry. [BUILD_MANIFEST.json](../BUILD_MANIFEST.json) hashes release files, excluding itself.

The source gate and release secret scanner supplement manual review; pattern checks do not prove arbitrary content contains no secret. Tests do not certify Node, Chrome, TradingView, an MCP client/model provider, all upstream projects, Windows, or every account-dependent feature. Full serialized layout fidelity, strategy sweep restoration on live account data, live Pine edits, alert delivery, and optional platform mutations need separate acceptance testing.
