# Developer prompt: build and validate the unified TradingView MCP

Copy the prompt below to the developer responsible for continuing this project.

---

## Mandatory first task: security review before execution or reuse

Before installing, running, importing, merging, or updating any upstream MCP server, inspect its source at a pinned commit. **Verify that it does not extract my TradingView authentication cookies or forward cookies, session IDs, authorization headers, browser profile data, Pine source, alert JSON, webhook secrets, or screenshots to a third-party service.** Do not assume a README claim, MIT badge, local MCP transport, or disabled telemetry flag proves this.

Review every network client and destination; cookie/storage/CDP APIs; launchers; install hooks; updater/download paths; environment variables; proxy support; analytics/crash reporting; dashboards; cloud synchronization; Redis/Supabase integrations; external LLM calls; logs; screenshots; exports; and dependency manifests/locks. Search source for Cookie, Set-Cookie, Authorization, sessionid, sessionid_sign, storageState, document.cookie, Network.getCookies, browser profile copying, fetch/HTTP/WebSocket calls, telemetry, sync, and external AI SDKs. Follow each relevant data flow to its destination. Inspect encoded or dynamically constructed destinations too.

Produce a written PASS / FAIL / NOT VERIFIED result per source and pin the exact reviewed commit. A source may have useful API ideas while its credential or cloud layer fails this project's requirements. Do not execute unreviewed upstream code. Keep license notices for permitted source reuse; if a license is absent or unconfirmed, do not copy its implementation. Independently implement the required behavior instead.

Use synthetic canary secrets in controlled tests. Assert that no cookie canary appears in Node requests, MCP responses, logs, exported files, checkpoints, third-party collectors, or error messages. Authenticated requests must run inside a signed-in TradingView browser page with browser-managed credentials and approved first-party destinations. Never read or serialize the browser cookie jar. A separate public-market adapter may make tightly restricted **unauthenticated** requests to TradingView's public scanner, with credentials omitted, no caller headers, and redirects rejected. The MCP process must never send a test webhook or an authentication cookie to the user's webhook URL.

Only proceed to an authenticated live pilot after source review and controlled security tests pass. If a check cannot be performed, explicitly mark it NOT VERIFIED. Do not describe a mock test as live validation or describe a source audit as proof about every dependency, browser extension, or future version.

## Product objective

Build one coherent, browser-only TradingView MCP server, using the supplied implementation as the starting point and the attached SPEC.md as the acceptance contract. **TradingView Desktop is not permitted.** Support Chrome, Chromium and Edge through local CDP, with a dedicated browser profile and manual sign-in. Do not copy an existing profile or ask for cookies in configuration.

The priority workflow is:

1. Identify the exact current browser target and native saved-layout ID.
2. Inspect the chart, source strategy/indicator identity and inputs, dirty state, panes and drawings.
3. Make a genuine independent saved chart copy with a unique name.
4. Confirm the new saved layout has a different stable ID and that the intended chart configuration was copied. Opening another tab to the same saved ID is not a copy.
5. Optionally change the copied chart's symbol and timeframe and verify the resolved instrument and timeframe.
6. Save and verify the destination chart.
7. Create a price, supported strategy, or supported indicator alert with the exact requested webhook URL and exact JSON body, preserving TradingView placeholders.
8. Independently re-read the saved alert and verify its ID, name, condition, symbol, timeframe, Pine identity/version/inputs where exposed, webhook, message hash, and active/paused state.
9. Return a receipt containing source/copy/alert IDs and field-by-field verification. Unknown fields remain unknown. A configured webhook does not prove delivery.

Also implement complete paginated alert listing, exact-ID get, pause/resume, clone, update, deletion, firing history, bulk creation, reconciliation and recovery. Pausing or resuming must be verified from the observed server state. Do not claim atomic paused creation/update if a native API briefly activates the alert.

## Source projects to compare and reconcile

- https://github.com/FerroxLabs/tvcontrol
- https://github.com/JostQQ/tradingview-mcp
- https://github.com/pbajkovic-hub/tv-cdp-mcp
- https://github.com/firyomaefx/tradingview-chrome-mcp
- https://github.com/tradesdontlie/tradingview-mcp
- https://github.com/Chefy3x/tradingview-mcp-chefy
- https://github.com/iliaal/tradingview-mcp
- https://github.com/daviddme/tradingview-alerts-mcp-server

Use docs/UPSTREAMS.json for exact commits and reviewed-file evidence. Read docs/UPSTREAM_SECURITY_REVIEW.md and THIRD_PARTY_NOTICES.md before adapting code. Ferrox is the broad feature reference, pbajkovic supplies the strongest native copy semantics, JostQQ supplies detailed Strategy Tester/Pine interfaces, and the dedicated alerts project supplies useful data-only strategy payload construction. Do not import whole upstream runtimes.

## Engineering requirements

- One tool registry, one schema convention, one target-binding model, one error model, one shared browser queue, and one local audit/checkpoint format.
- JSON-RPC MCP stdio with no nonprotocol stdout. Optional Streamable HTTP must bind only to loopback, require a strong bearer secret, validate Host and Origin, reject redirects and unknown paths, and never embed the token in an HTML dashboard.
- Browser mutations require `target_id` and `expected_layout_id`. Read the native widget identity; the URL alone is not sufficient during navigation. Resolve cloned study entities again because source entity IDs may change.
- Every operation must be implemented or clearly listed as an unimplemented gap. Do not register stub tools that return successful acknowledgements. Do not inflate feature counts with unsupported aliases.
- Calls must fail closed if an internal API, entitlement, field, or identity cannot be established. Do not silently choose the first strategy, pane, script, alert, drawing, or same-name layout.
- JSON arguments remain data. No caller-supplied JavaScript, arbitrary CDP commands, shell commands, URLs, filesystem paths, cookie import/export, or unrestricted network clients.
- Generic UI mutation tools are optional and off by default. They must return dispatch/effect-unknown receipts rather than claiming business success. Keep authentication fields, external navigation and broker actions outside those tools.
- Use durable idempotency keys for native copy/create operations and exact IDs for lifecycle operations. Record the submitted stage before sending. After timeout, reconcile before retrying; never blindly create a second chart or alert.
- Store only what is necessary for recovery. No webhook URLs, alert message bodies, cookies or Pine source in routine metadata logs or copy/alert checkpoints. Explicit source/strategy exports are sensitive user artifacts and must be local and owner-only.
- Preserve action results when logging fails. Report a logging warning rather than presenting a completed mutation as unexecuted.
- Batches are bounded and sequential. Return partial progress and per-step failures. Cancellation cannot undo already submitted TradingView writes.
- Strategy results must identify the strategy, symbol, timeframe, chart type, tested range and available settings. Extract the full native trade ledger through pagination; do not substitute a short recent-order cache or DOM summary.
- Require evidence of fresh strategy computation after changes. Equal metrics across polls are not evidence of freshness. Do not reuse a cache without a complete context/version key. If the native model cannot provide enough evidence, return uncertainty.
- Distinguish per-trade equity from a per-bar equity curve. Never claim Deep Backtesting, lower-timeframe fills, every layout property, real-time quotes, complete depth, or a delivered webhook without direct evidence.
- Local paper simulation must be clearly labeled and must not connect to a broker. Its calculations are not TradingView Strategy Tester or native TradingView Paper Trading.

## Full feature-union requirement

Review every row in the full upstream semantic inventory and every actual tool declaration in SPEC.md / docs/UPSTREAM_FEATURES.md. Implement the safe, relevant browser capabilities across layouts, chart controls, symbols, studies, drawings, pane synchronization, watchlists, templates, Pine source/library/compiler lifecycle, native strategy reports/trades/equity/orders, replay, alerts, public market data, screeners, diagnostics, screenshots, exports, batches, jobs, polling streams, local research and simulations.

Maintain a traceability table that maps each semantic feature to the actual new tool(s), a concrete test, a live validation status, or an explicit exclusion/gap with a reason. Security exclusions include cookie extraction, desktop launchers, remote self-updaters, arbitrary evaluation, third-party telemetry/cloud synchronization, external Pine uploads and uncontrolled live-broker execution. Preserve useful product behavior through a safe independent implementation where possible.

## Required acceptance tests and deliverables

Run the source security gate before tests. Then run schema/catalog, MCP protocol, malicious input, network allowlist, cookie-canary, wrong-target, wrong-layout, duplicate/idempotency, lost acknowledgement, alert JSON/webhook, pause/resume, backtest freshness, full-history, partial-failure, cancellation, storage, and end-to-end controlled-browser fixtures. Record real counts and the tested source fingerprint. Keep tests that prove behavior, not tests that merely assert a function exists.

Perform a final live browser pilot on a disposable copy in the operator's account using the operator's actual strategy, plan and language. Start with read-only discovery. Then copy, verify, configure, save, create a test alert with explicitly supplied URL/body, re-read it, pause, list again, resume, list again, and reconcile all objects by ID. A real alert firing and receipt at the operator-controlled endpoint is a separate delivery test; do not fabricate it or send an unsolicited webhook from the MCP process.

Deliver complete source, SPEC.md, README.md, DEVELOPER_PROMPT.md, generated machine-readable tool schemas, the huge feature inventory, pinned source/license/security records, meaningful tests and their results, setup examples, recovery instructions and a candid live-compatibility/gap report. Do not publish to npm, push a repository, deploy a public service, or alter my actual charts/alerts simply to demonstrate the build unless I separately request that action.

The result should be a maintainable, reviewable implementation with truthful receipts. Continue through defects and integration testing; do not stop at a proposal or an untested collection of copied tools.

---

Prepared 2026-10-19. This prompt accompanies the source build; it is not a claim that every upstream feature or live TradingView interface has already been verified.
