# TradingView Unified MCP

A local [Model Context Protocol](https://modelcontextprotocol.io/) server that lets an MCP client work with TradingView charts in Chrome, Chromium, or Microsoft Edge. It brings saved layouts, alerts, Pine scripts, strategy reports, market data, watchlists, drawings, replay, and research tools into one browser-based integration.

**185 implemented tools · 180 enabled by default · 101 available in read-only mode · zero npm dependencies.** Five generic UI mutation tools are separately enabled. [Browse every tool](docs/FEATURES.md) or inspect its [exact input schema](docs/TOOLS.json).

This is an independent, MIT-licensed project. It is not affiliated with or endorsed by TradingView. It uses undocumented TradingView interfaces, so account features and future TradingView changes can affect compatibility.

## Validation status

The project has automated unit, security, integration, real stdio-process, and real loopback-HTTP tests. A separate live check exercises read operations through Chrome and TradingView's public market endpoints. Current evidence, scope, and remaining limitations are recorded in [validation](docs/VALIDATION.md), [test results](docs/TEST_RESULTS.json), and the [security review of this release](docs/SECURITY.md).

A successful API-presence check or read does not prove that every mutation works. Review the validation records before relying on a particular workflow. Webhook configuration verification does not prove delivery.

**Current live limitation:** alert creation returned `invalid_request` in the test session, including a control using TradingView's own request API. The combined copy-and-alert workflow is unverified live. Some copy comparisons also reported differing study inputs and correctly stopped verification. See [the detailed results](docs/VALIDATION.md).

## What it can do

| Area | Examples | Notes |
| --- | --- | --- |
| Browser and diagnostics | `browser_list_tabs`, `browser_capabilities`, `session_health`, `browser_screenshot` | Restricts targets to HTTPS TradingView chart pages. Screenshots go to your MCP client. |
| Charts and indicators | `chart_get_state`, `chart_set_symbol`, `chart_set_timeframe`, `indicator_list`, `indicator_set_inputs` | Changes require the exact browser target and saved-layout ID. |
| Saved layouts | `layout_list`, `layout_copy`, `layout_save`, `layout_snapshot` | Copy verifies an independent saved ID and compares observable chart contents. |
| Alerts | `alert_sources`, `alert_prepare`, `alert_create`, `alert_verify`, `alert_pause`, `alert_resume` | Price thresholds, attached Pine strategy order fills, and discovered indicator conditions. Requests paused creation by default. |
| Combined workflow | `workflow_copy_chart_create_alert`, `workflow_status` | Copy, configure, save, create a JSON webhook alert, and independently read it back. Durable recovery keys. |
| Chart data | `data_get_ohlcv`, `data_get_last_bar`, `data_get_study_values`, `data_export_ohlcv` | Loaded chart history, rather than a promise of unlimited historical data. |
| Strategy Tester | `strategy_list`, `strategy_capture`, `strategy_wait`, `strategy_get_report`, `strategy_scan` | Requires exact strategy identity; reports freshness evidence separately. |
| Pine | `pine_list_scripts`, `pine_get_source`, `pine_get_saved_source`, `pine_set_source`, `pine_compile` | Editor/library operations use native interfaces and source/version preconditions. No external AI provider. |
| Market data | `quote_get`, `quote_batch`, `screener_scan`, `market_technical_summary`, `hotlist_get` | Public scanner calls use no TradingView account credentials. |
| Watchlists | `watchlist_list`, `watchlist_set_entries`, `watchlist_reconcile` | Ordered edits use explicit IDs and recovery checkpoints. [Guide](docs/WATCHLISTS.md). |
| Panes, templates, drawings, replay | `pane_list`, `study_template_list`, `replay_status` | Fidelity and availability depend on the native interface. |
| Research and simulation | `research_equity_metrics`, `research_rank_results`, `paper_account_create`, `paper_trade` | Local calculations and a supplied-price simulator; no real broker execution. |
| Jobs and controls | `batch_execute`, `job_submit`, `stream_start`, `emergency_stop` | Bounded jobs/polling. Emergency stop cannot undo an already submitted action. |

## Requirements

- **Node.js 24 or later**, with `node` available to your MCP client. Check with `node --version`.
- A local Chrome, Chromium, or Edge installation. TradingView Desktop is unsupported.
- A TradingView account and the plan/data entitlements needed for your chosen account features.
- An MCP client that can launch a local stdio server. Optional authenticated local HTTP is also available.

There is no `npm install` step, no install script, and no third-party runtime or development dependency tree. This repository is distributed as source; the README does not assume an npm-published package.

## Quick start

```bash
git clone https://github.com/daviddme/TradingView-Unified-MCP.git
cd TradingView-Unified-MCP
node --version
npm run check
npm run audit:source
npm test
```

Start the dedicated browser:

```bash
node src/cli.mjs launch
```

Sign in to TradingView in that new window, open a saved Superchart, and wait for it to finish loading. Then run:

```bash
npm run doctor
```

The launcher uses a dedicated profile at `~/.tradingview-unified-mcp/browser-profile`, disables extensions for that launch, and exposes Chrome's debugger at `http://127.0.0.1:9222`. It accepts an empty directory or a profile previously created by this launcher. Chrome's remote-debugging feature requires a nondefault profile; see [Chrome's documentation](https://developer.chrome.com/blog/remote-debugging-port).

For another executable or profile:

```bash
node src/cli.mjs launch --browser "/path/to/chrome" --profile "/path/to/new-profile"
```

You can also pass `--url https://www.tradingview.com/chart/`. On macOS, normal Google Chrome and Edge installation paths are detected. On Linux, common Chrome/Chromium executable paths are checked. On Windows, standard Chrome/Edge paths are checked; pass `--browser` explicitly for other installations. Windows has not been live-tested in this release.

Close the dedicated browser when you have finished using it. Its profile contains your browser-managed login session. Anyone who can access its debugger may control that browser session; keep the debugger on loopback and use a trusted local machine.

## Connect your MCP client

Use your client's MCP configuration mechanism and replace both absolute paths below. Start in read-only mode:

```json
{
  "mcpServers": {
    "tradingview": {
      "command": "node",
      "args": ["/absolute/path/TradingView-Unified-MCP/src/server.mjs"],
      "env": {
        "TV_CDP_ENDPOINT": "http://127.0.0.1:9222",
        "TV_DATA_DIR": "/absolute/path/TradingView-Unified-MCP/runtime",
        "TV_READONLY": "1"
      }
    }
  }
}
```

If your client cannot find Node, replace `command` with the full path to your Node 24+ executable. Restart the client connection after configuration changes. Set `TV_READONLY` to `"0"` to expose mutation tools when you are ready to use them.

The client launches `src/server.mjs` as a child process; you normally do not run a second stdio server manually. For a protocol harness, `node src/server.mjs` accepts newline-delimited JSON-RPC on stdin and reserves stdout for protocol responses.

The server supports MCP protocol versions `2025-11-25`, `2025-06-18`, `2025-03-26`, and `2024-11-05`. Tool listing is paginated, with up to 100 tools per page; clients must follow `nextCursor`. Four Markdown resources and two workflow/security prompts are also discoverable through MCP.

## Configuration

| Setting | Default | Purpose |
| --- | --- | --- |
| `TV_CDP_ENDPOINT` | `http://127.0.0.1:9222` | Literal HTTP loopback Chrome debugger. `127.0.0.1` and `[::1]` are accepted; remote hosts, DNS aliases such as `localhost`, and embedded credentials are rejected. |
| `TV_DATA_DIR` | `./runtime`, relative to the server's working directory | Audit metadata, checkpoints, exports, backups, and local simulation data. Prefer an absolute path. |
| `TV_READONLY` | Unset | Set `1` to hide state-changing tools. Reads can still return private data and write audit records or requested local exports. |
| `TV_ENABLE_GENERIC_UI` | Unset | Set `1` to expose `ui_click`, `ui_type`, `ui_hover`, `ui_scroll`, and `ui_key`. Prefer domain tools with verification receipts. |
| `TV_BROWSER_PROFILE` | Dedicated profile under `~/.tradingview-unified-mcp/` | Profile used by the launcher; `--profile` takes precedence. |
| `TV_HTTP_PORT` | `3811` | Port for `node src/server.mjs --http`. |
| `TV_HTTP_TOKEN` | Unset | Required bearer secret of at least 32 characters for the HTTP transport. Use a randomly generated value. |

Settings come from the process environment. The server does **not** automatically load `.env` files. No TradingView password, cookie export, AI API key, or webhook credential is required in the server configuration.

### Optional local HTTP

```bash
export TV_HTTP_TOKEN="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))')"
export TV_READONLY=1
node src/server.mjs --http
```

Configure your HTTP-capable MCP client to use `http://127.0.0.1:3811/mcp` and supply `Authorization: Bearer <the value of TV_HTTP_TOKEN>` as a header. Keep that value in your client's secret configuration; never put it in a URL or commit it.

This transport accepts authenticated JSON `POST /mcp`. It checks Host, rejects browser Origin headers by default, bounds request sizes, and rejects redirects. GET/SSE, remote hosting, OAuth distribution, and browser-based login gateways are not implemented. Some HTTP clients insist on GET/SSE and will require stdio instead.

## First calls

In your connected assistant, ask:

> List my TradingView chart tabs. Read the selected chart's native layout ID and capabilities. Make no changes.

The assistant should call `browser_list_tabs`, choose an explicit `target_id`, and then call `layout_get`, `chart_get_state`, and `browser_capabilities`. Use `tools_catalog` with a prefix such as `"alert_"` to inspect exact schemas.

Example tool arguments:

```json
{"target_id":"TARGET_FROM_BROWSER_LIST_TABS"}
```

For mutations, supply the observed native ID as well:

```json
{
  "target_id":"TARGET_FROM_BROWSER_LIST_TABS",
  "expected_layout_id":"NATIVE_ID_FROM_LAYOUT_GET",
  "symbol":"NASDAQ:AAPL"
}
```

Those are arguments for `chart_set_symbol`, not a standalone JSON-RPC request. Re-read the chart afterward. A changed target/layout identity stops a guarded mutation. A chart URL or title alone is insufficient identity.

### Copy a chart and create a webhook alert

1. Inspect `browser_list_tabs`, `layout_get`, and `chart_get_state`. Choose a saved source with the intended studies and inputs.
2. Inspect `alert_sources` for the attached study identity and supported alert conditions. Price alerts require an explicit comparison and price.
3. Validate the exact message with `alert_validate_message` and inspect `alert_prepare` before submission.
4. Run `workflow_copy_chart_create_alert` with one durable `idempotency_key`, an unused layout name, an HTTPS webhook URL, and `message_format: "json"`.
5. Check the returned independent layout ID, chart/save verification, alert ID, exact configuration checks, and active state. Re-read with `alert_get` or `alert_verify`.
6. Resume a paused alert only when its destination, message, and trigger are the intended configuration.

[examples/copy-alert.json](examples/copy-alert.json) contains a complete argument shape for an attached strategy order-fill alert. Replace every placeholder and choose your own endpoint. The example requests `active: false`; the server never sends a webhook test request.

TradingView can momentarily activate an alert even when paused creation was requested; receipts report that possibility. Updating an already paused alert may re-arm it and requires explicit `allow_temporary_activation` when relevant. TradingView also applies account and webhook requirements, including two-factor authentication; see [its webhook instructions](https://www.tradingview.com/support/solutions/43000529348-how-to-configure-webhook-alerts/).

### Recover an uncertain operation

If you see `UNCERTAIN_MUTATION`, a timeout, cancellation, or disconnect after submission, preserve the exact request and idempotency key. Use `workflow_status`, the relevant read tools, and returned IDs to reconcile what exists before retrying. A new key can create another object.

Checkpoints prevent several classes of duplicate submission; they do not roll back server-side changes. Keep your runtime directory between reconnects. Jobs and polling streams are in memory and do not automatically resume after a process restart.

### Strategy research

Read `strategy_list` and select an exact `entity_id`. For changes to symbol, timeframe, session, or inputs, capture a probe with `strategy_capture`, perform the intended change, then use `strategy_wait` with the expected context. Stable metric values alone do not establish recalculation freshness.

`strategy_get_report` and the paginated trade/order readers expose the native available report. Deep Backtesting and every historical equity sample are not guaranteed. `strategy_scan` and `strategy_sweep` run bounded research sequences with restoration attempts; review restoration results and remaining live-test limits.

### Market data and exports

```json
{"symbols":["NASDAQ:AAPL","BITSTAMP:BTCUSD"]}
```

Use these arguments for `quote_batch`; no chart change or login is needed for the public scanner adapter. Exchange delays and quote timestamps are reported as limitations. See [market data documentation](docs/MARKET_DATA.md) for scanner filters, technical summaries, depth, and missing-data behavior.

Export tools return paths under `TV_DATA_DIR/exports`. JSON exports use hashed filenames; CSV exports use sanitized names and neutralize spreadsheet formula prefixes. Exported data and Pine backups can still be sensitive. Protect or delete them according to your own retention needs.

## Data handling and security boundaries

The reviewed runtime has no telemetry, analytics SDK, cloud synchronization, automatic updater, external AI integration, cookie getter/exporter, arbitrary JavaScript tool, shell tool, or general-purpose HTTP proxy. The launcher passes a small allowlist of platform settings to Chrome and omits unrelated environment credentials and injection flags.

| Data path | What travels | Destination |
| --- | --- | --- |
| Local CDP | Fixed page functions, typed arguments, chart data and results | Your loopback Chrome debugger. Discovery and debugger URLs are validated. |
| Browser-managed account requests | Requested account reads/changes, Pine source for requested save/compile actions | Explicit first-party TradingView services. Login cookies remain managed by Chrome. |
| Public scanner | Requested symbols, selected fields and filters | Fixed `scanner.tradingview.com` request families, with credentials omitted and redirects refused. |
| MCP output | Requested results, screenshots, source, and selected alert configuration | Your MCP client and any model/service that client uses. |
| Local storage | Operation metadata, recovery state, requested exports/backups, simulation records | `TV_DATA_DIR`. New directories/files use restrictive permissions where supported. |
| Configured webhook | Alert message when TradingView fires it | The endpoint you deliberately configure in TradingView. This server does not send test deliveries. |

Browser fetch hosts are restricted to `tradingview.com`, `www.tradingview.com`, `pricealerts.tradingview.com`, `pine-facade.tradingview.com`, `symbol-search.tradingview.com`, and `scanner.tradingview.com`. Operations use fixed authored functions. Their source checks are defense in depth, not a sandbox for untrusted server code.

Audit logs store metadata such as tool name, outcome, duration, and object bindings, rather than raw tool arguments or webhook/message bodies. Recovery records and explicitly requested backups can contain chart, watchlist, and script information. Known secret fields and text patterns are redacted; arbitrary secrets inside screenshots, source, titles, or user content cannot be universally recognized. Trust your MCP client and model provider before requesting private content.

TradingView and Chrome perform their own network activity. This server does not act as a firewall for them. The security review is scoped to this source revision and tested paths, not a guarantee that no data can ever leave your computer. See [SECURITY.md](SECURITY.md) and the [release security findings](docs/SECURITY.md).

## Troubleshooting

| Symptom | Action |
| --- | --- |
| `BROWSER_UNAVAILABLE` | Start `node src/cli.mjs launch`, keep that browser open, and check that client/server use the same `TV_CDP_ENDPOINT`. |
| `AMBIGUOUS_TARGET` | Inspect `browser_list_tabs` and pass one explicit `target_id`. |
| `EXPECTED_LAYOUT_REQUIRED` / `LAYOUT_MISMATCH` | Re-read `layout_get` in the intended saved chart. Do not substitute a title or URL fragment for the native ID. |
| `UNSAVED_SOURCE` | Review and save the intended source configuration before copying. `save_source: true` explicitly permits saving it. |
| `EXISTING_PROFILE_REFUSED` | Choose an empty profile directory or the launcher's existing dedicated profile. |
| `CAPABILITY_UNAVAILABLE` / `ADAPTER_MISMATCH` | Wait for Supercharts to load, inspect `browser_capabilities`, and verify the feature is available in that account. TradingView internals may have changed. |
| `REPORT_NOT_READY` / freshness timeout | Open Strategy Tester, confirm the exact attached strategy and context, and wait for computation. Review freshness evidence. |
| Symbol change returns `VERIFICATION_FAILED` | Read the observed symbol and resolved instrument. TradingView can substitute another venue; exact-symbol guards refuse to call that a verified match. Use an explicitly intended available venue. |
| Missing mutation tools | Set `TV_READONLY=0`. Generic UI mutations also require `TV_ENABLE_GENERIC_UI=1`. |
| HTTP 401 / 403 | Supply the matching bearer header, connect using the literal configured loopback Host, and use a local MCP client without a browser Origin header. |
| `EMERGENCY_STOP` | Reconcile submitted writes, then call `emergency_clear`. Clearing does not retry or undo anything. |
| Logging warning after success | Preserve the returned receipt and repair storage permissions/disk space. The warning alone is not a reason to repeat a mutation. |

## Development and verification

```bash
npm run check          # Parse source/scripts/tests; validate runtime and tool schemas
npm run audit:source   # Narrow static source/supply-chain gate
npm test              # Full tests, including real local HTTP and stdio processes
npm run test:security # Security and protocol regression tests
npm run catalog       # Regenerate tools, schemas, and counts
npm run test:live     # Explicit live reads; requires the dedicated browser
npm run audit:release # Scan Git-tracked release files for secrets/private artifacts
npm run manifest      # Regenerate release hashes after final validation
```

Tests use synthetic fixtures and local temporary directories. The ordinary test suite does not contact TradingView or start Chrome. `test:live` deliberately contacts the configured browser and public TradingView scanner; it saves an anonymized summary, with no raw account response, to `docs/LIVE_VALIDATION.json`. If multiple chart tabs are open, run `node scripts/live-check.mjs TARGET_ID`.

CI runs automated checks on Linux and macOS with Node 24. To contribute, add regression coverage for security-sensitive behavior, preserve exact-target and uncertainty guards, and update the generated catalog when changing tools. Do not commit browser profiles, cookies, session exports, credentials, runtime state, or account screenshots.

## Documentation map

- [Tool reference](docs/FEATURES.md) and [JSON schemas](docs/TOOLS.json)
- [Validation evidence and limitations](docs/VALIDATION.md)
- [Current release security review](docs/SECURITY.md)
- [Public market data](docs/MARKET_DATA.md) and [watchlists](docs/WATCHLISTS.md)
- [Full design and acceptance specification](SPEC.md)
- [Source provenance](SOURCES.md), [upstream inventory](docs/UPSTREAM_FEATURES.md), and [upstream security review](docs/UPSTREAM_SECURITY_REVIEW.md)
- [Third-party license notices](THIRD_PARTY_NOTICES.md)

The specification includes design goals and acceptance requirements; the generated catalog and validation records describe what is implemented and tested.

## Credits

TradingView Unified MCP is separately implemented and draws on API research, workflow patterns, and feature ideas from these projects. Their upstream servers and dependency trees are not imported into this runtime.

| Project | Contribution acknowledged |
| --- | --- |
| [FerroxLabs/tvcontrol](https://github.com/FerroxLabs/tvcontrol) | TradingView browser API and workflow patterns. |
| [JostQQ/tradingview-mcp](https://github.com/JostQQ/tradingview-mcp) | Strategy report and metadata patterns; inherited original-project attribution. |
| [pbajkovic-hub/tv-cdp-mcp](https://github.com/pbajkovic-hub/tv-cdp-mcp) | Native saved-layout copying and internal service research. |
| [tradesdontlie/tradingview-mcp](https://github.com/tradesdontlie/tradingview-mcp) | Original CDP/native-interface research underlying several forks. |
| [Chefy3x/tradingview-mcp-chefy](https://github.com/Chefy3x/tradingview-mcp-chefy) | Feature and report-aggregation ideas. Its notices also credit [LewisWJackson/tradingview-mcp-jackson](https://github.com/LewisWJackson/tradingview-mcp-jackson). |
| [iliaal/tradingview-mcp](https://github.com/iliaal/tradingview-mcp) | Public scanner and hotlist API patterns. |
| [daviddme/tradingview-alerts-mcp-server](https://github.com/daviddme/tradingview-alerts-mcp-server) | Alert payload-construction concepts. |
| [firyomaefx/tradingview-chrome-mcp](https://github.com/firyomaefx/tradingview-chrome-mcp) | Surveyed feature/workflow reference. No source reuse because license provenance was unresolved in the reviewed revision. |

Pinned revisions and reuse decisions are recorded in [SOURCES.md](SOURCES.md). Full retained MIT notices, original copyright statements, and inherited fork credits are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## License

[MIT](LICENSE), with retained third-party notices. TradingView services, data, trademarks, account entitlements, and platform terms remain separate from this source-code license.
