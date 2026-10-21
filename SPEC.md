# SPEC — TradingView Unified MCP

**Version:** 0.1.0

**Prepared:** 2026-10-19

**Environment:** browser only; Chrome, Chromium or Edge through local CDP
**Delivery:** a new source implementation, offline tests, developer prompt, source security review, pinned provenance and complete feature inventory

## Delivered build status

The complete generated registry contains **185 implemented tools** (180 enabled by default; 101 in read-only mode). The final offline suite passed **199/199 tests across 11 files**, with no failures or skips. The actual stdio entry point also passed a four-request smoke check without a browser connection. Full results and limits are recorded in docs/VALIDATION.md and docs/TEST_RESULTS.json. No live TradingView or real webhook claim is made.

## 1. Security gate — must precede upstream execution or reuse

**Before installing, running, importing, merging or updating any upstream MCP server, verify that it does not forward my TradingView cookies, session IDs, authorization headers or browser profile data to a third-party service.** Review source, dependencies, startup/install hooks, cookie/storage APIs, network clients, telemetry, error reporting, remote configuration, cloud sync, dashboards, updater paths, external AI calls, screenshots, exports and logs. Follow the data flow; a local MCP endpoint or a disabled telemetry flag is not proof.

Do not execute unreviewed upstream code with a real session. Pin the reviewed commit. Record PASS / FAIL / NOT VERIFIED for each relevant data path. Reuse permitted, understood API patterns through a fresh adapter; do not import the upstream runtime and its credential/cloud layer. Retain required licenses and notices. If a source has no confirmed license, use independent implementation and public behavior ideas only.

Run controlled cookie-canary and network-boundary tests before a signed-in pilot. A synthetic cookie must never appear in Node requests, MCP output, logs, checkpoints, exports, third-party collectors or error messages. Authenticate first-party chart/alert requests inside TradingView's browser session without extracting the cookie jar. Restrict public-market Node requests to the fixed TradingView scanner host with credentials omitted, no caller-controlled headers and no redirects. The configured alert webhook is stored by TradingView; this MCP server does not call that URL.

### Completed source audit and its limits

The supplied audit reviewed **492 selected source paths / 433 unique blobs** at eight pinned commits. No upstream executable, installer, dependency package or release binary was executed. The result supports independently reimplementing selected behavior after excluding the problematic data paths; it is not a clean bill of health for every source repository.

The material findings are:

| Source | Finding | Decision in this build |
|---|---|---|
| iliaal/tradingview-mcp | A watchlist removal path extracts browser cookies through CDP and constructs a Node Cookie header, although the inspected destination is TradingView. | Exclude cookie extraction entirely. Use browser-managed first-party requests. |
| firyomaefx/tradingview-chrome-mcp | Optional cloud sync and external AI source-upload paths exist; a dashboard exposes its bearer value in HTML; the reviewed tree lacks a confirmed license despite its README badge. | No source code copied. Exclude cloud/LLM/dashboard layers; independently implement relevant product ideas. |
| daviddme/tradingview-alerts-mcp-server | Useful strategy payload construction is coupled to cookie environment/config-file and Node Cookie-header paths. | Reimplement the data-only payload logic. No cookie configuration or raw Cookie header. |
| FerroxLabs/tvcontrol | Broad useful chart interfaces coexist with desktop launchers, updater and raw-evaluation surfaces; inspected telemetry is local, not evidence of a third-party cookie sink. | Reimplement selected chart behavior. Exclude desktop, self-update and caller JavaScript. |
| pbajkovic-hub/tv-cdp-mcp | Native copy semantics are useful; some alert modifications re-arm a paused alert before it is stopped. | Verify independent IDs and report activation windows; never promise atomic paused updates. |
| JostQQ/tradingview-mcp and related forks | Full strategy-report interfaces are useful, but some selection/freshness/short-history paths can produce misleading results. | Exact entity selection, full pagination, current-context checks and explicit freshness evidence. |

The full findings, file-level evidence, exclusions and confidence limits are in `docs/UPSTREAM_SECURITY_REVIEW.md`. `docs/UPSTREAMS.json` records every reviewed file and blob identifier. The deterministic security tests apply to the new implementation, not to unexecuted upstream packages.

## 2. The developer prompt

The complete ready-to-send prompt is included in **DEVELOPER_PROMPT.md**. Its first task is the mandatory security gate above. It directs the developer to continue the supplied source, reconcile the full feature union, repair defects, perform a live browser pilot and return truthful verification receipts. It forbids Desktop, cookie import/export, third-party Pine uploads, raw JavaScript tools, and false claims of complete copying or webhook delivery.

The rest of this specification is its acceptance contract. The huge inventory in the appendix is required reading; the inventory does not imply that every upstream declaration has already been implemented or validated in the new server.

## 3. Product goals and priorities

### Priority 0 — the exact requested workflow

Take the current chart, make an independent saved copy, confirm the copy, optionally change its symbol/timeframe, save it, create the requested alert with a webhook URL and JSON body, and confirm the alert exists with the intended configuration. Then list all alerts and pause/resume selected IDs with read-back verification.

### Priority 1 — broad research and chart automation

Provide coherent controls for charts, panes, symbols, studies, drawings, watchlists, templates, Pine editing/library/compiler lifecycle, Strategy Tester reports, full trades, equity, replay, screenshots, public market data, exports, batches and research sweeps. Consolidate overlapping upstream tools into one naming/schema/error convention instead of loading several inconsistent servers.

### Priority 2 — operational reliability

Provide capability discovery, wrong-target guards, durable idempotency, partial-progress receipts, local metadata audits, cancellation, emergency stop, bounded jobs and polling streams, reproducible exports and meaningful tests. Expose uncertainty and compatibility gaps clearly. A large advertised tool count is not the acceptance criterion.

### Explicit environment constraint

**Do not use TradingView Desktop.** The runtime connects only to eligible HTTPS TradingView Superchart tabs in a dedicated locally controlled Chrome-based browser. The operator signs in manually. The launcher does not read or duplicate another browser profile.

## 4. Source MCP servers — complete adopted research set

| Repository | Pinned commit | Principal contribution |
|---|---|---|
| [FerroxLabs/tvcontrol](https://github.com/FerroxLabs/tvcontrol) | [a8d3dfc97621e22b8b7c71e617b134c5e35882ee](https://github.com/FerroxLabs/tvcontrol/tree/a8d3dfc97621e22b8b7c71e617b134c5e35882ee) | Broad chart/study/Pine/pane/data/replay/watchlist/diagnostic patterns. |
| [JostQQ/tradingview-mcp](https://github.com/JostQQ/tradingview-mcp) | [4d9b440935d5e8b862ab61a72812adf801684564](https://github.com/JostQQ/tradingview-mcp/tree/4d9b440935d5e8b862ab61a72812adf801684564) | Native detailed Strategy Tester and Pine lifecycle. |
| [pbajkovic-hub/tv-cdp-mcp](https://github.com/pbajkovic-hub/tv-cdp-mcp) | [dd0fd3c07ad10ea6151fc21aeff3791db7cb7219](https://github.com/pbajkovic-hub/tv-cdp-mcp/tree/dd0fd3c07ad10ea6151fc21aeff3791db7cb7219) | Native independent layout copying, saved identity verification, alert/template interfaces. |
| [firyomaefx/tradingview-chrome-mcp](https://github.com/firyomaefx/tradingview-chrome-mcp) | [d20f0acf7a2d888ef7fe9304178fae35c233c42c](https://github.com/firyomaefx/tradingview-chrome-mcp/tree/d20f0acf7a2d888ef7fe9304178fae35c233c42c) | Browser workflow, jobs, emergency-stop and local simulation ideas only; code reuse excluded. |
| [tradesdontlie/tradingview-mcp](https://github.com/tradesdontlie/tradingview-mcp) | [c05b8f5755ed8e64ea242de88ddbf46aa24d56a4](https://github.com/tradesdontlie/tradingview-mcp/tree/c05b8f5755ed8e64ea242de88ddbf46aa24d56a4) | Original shared chart/CDP/Pine API lineage. |
| [Chefy3x/tradingview-mcp-chefy](https://github.com/Chefy3x/tradingview-mcp-chefy) | [abcad6c6a49a89a99f700abacffa2cdb61883fe7](https://github.com/Chefy3x/tradingview-mcp-chefy/tree/abcad6c6a49a89a99f700abacffa2cdb61883fe7) | Aggregation and local research-session workflow concepts. |
| [iliaal/tradingview-mcp](https://github.com/iliaal/tradingview-mcp) | [233f29e180031291dacac4c4cc2736a8dde161be](https://github.com/iliaal/tradingview-mcp/tree/233f29e180031291dacac4c4cc2736a8dde161be) | Pane batches, drawings, scanner and deep-backtest UI research; cookie layer excluded. |
| [daviddme/tradingview-alerts-mcp-server](https://github.com/daviddme/tradingview-alerts-mcp-server) | [5a61aa352c97403477052aead3a3dcab627c2dd0](https://github.com/daviddme/tradingview-alerts-mcp-server/tree/5a61aa352c97403477052aead3a3dcab627c2dd0) | Data-only native strategy-alert payload semantics. |

These are all eight MCP repositories used in the adopted source comparison. The audit is commit-specific. No claim is made that this is every TradingView-related repository on GitHub. Refer to THIRD_PARTY_NOTICES.md for each MIT text and the explicit unconfirmed-license exclusion.

## 5. Architecture and trust boundaries

The runtime uses Node.js 24+ with built-in fetch, WebSocket, filesystem and test facilities. There are **zero npm runtime/development dependencies** and no install hooks. This makes the source surface small enough to inspect; it does not remove the need to audit Node, the MCP client or the browser.

The principal components are:

1. **MCP transport:** newline-delimited UTF-8 JSON-RPC stdio, plus optional authenticated loopback Streamable HTTP JSON POST.
2. **Tool registry:** one catalog with validated JSON Schemas, mutation/destructive annotations, exact browser bindings and a single browser-operation queue.
3. **Browser manager:** literal-loopback CDP discovery/WebSocket only; approved CDP methods; eligible TradingView target filtering; fixed module-authored page functions.
4. **Authenticated page adapters:** known first-party TradingView endpoints/native objects. The browser supplies cookies; the Node process does not collect them.
5. **Public-market adapter:** separate fixed-path scanner requests, no authentication or arbitrary headers, strict host/method/body limits and no redirects.
6. **Feature adapters:** layouts, alerts, chart/studies, Pine, strategy/data, panes/templates, drawings, watchlists, replay, market, UI and workflows.
7. **Local services:** owner-only checkpoints/exports/audit metadata, bounded jobs/polling, local metrics and explicitly labeled paper simulation.

No tool accepts arbitrary JavaScript, a CDP command name, shell command, database query, cookie file or network URL to fetch. Generic UI mutations are off by default and do not constitute a sandbox for every possible UI action. Optional UI tools return dispatched/effect-unverified receipts. Authentication and broker controls are blocked by observed element constraints, but new/localized DOM structures still require review before enabling the generic surface.

The page-function source checks are defense in depth for trusted installed modules; they are not an isolation boundary against malicious source installed by the operator. Page text, Pine code, indicator labels, alerts and news remain untrusted data to the agent.

## 6. Target and layout identity contract

Every browser mutation requires an explicit `target_id`. Chart-affecting mutations also require `expected_layout_id`. Immediately before dispatch, the server reads native saved-layout metadata from the selected widget/service. It does not authorize a write from the URL alone because the URL may update while the old widget remains loaded.

An absent ID, mismatched ID, ambiguous target, duplicate named object or missing requested study stops the operation. Read calls may resolve a single eligible tab automatically; multiple tabs require explicit selection. Compound workflows maintain their own source/destination contexts and re-resolve ephemeral study IDs on the copy.

The server serializes browser workflows to prevent its own operations interleaving. It cannot lock out a human, another MCP process, TradingView autosave or another browser tab. Preimage hashes and independent read-back detect observable interference. Run one server process per dedicated profile; multi-process coordination is not provided by the in-memory queue.

## 7. Copy → confirm → alert workflow

### Input shape

Call `workflow_copy_chart_create_alert` with:

```json
{
  "target_id": "inspected-tab-id",
  "expected_layout_id": "native-source-layout-id",
  "idempotency_key": "unique-reviewed-operation-001",
  "layout_name": "My strategy — BTCUSD — copy",
  "symbol": "BITSTAMP:BTCUSD",
  "timeframe": "60",
  "save_source": false,
  "alert": {
    "name": "BTCUSD strategy fills",
    "condition": {"kind": "strategy", "study_id": "inspected-source-study-id"},
    "webhook_url": "https://hooks.example.com/tradingview",
    "message_format": "json",
    "message": "{\"ticker\":\"{{ticker}}\",\"action\":\"{{strategy.order.action}}\",\"price\":\"{{strategy.order.price}}\"}",
    "active": false,
    "expiration_days": 30
  }
}
```

This is a schema example with placeholders, not an instruction to create a real alert. The actual target, source study, strategy, webhook and intended alert status must come from the operator. Set `active:true` when activation is intended; the default requests paused state. The root workflow requires a webhook and JSON message for this project's primary use case, while lower-level alert tools also support nonwebhook/text alerts.

### Required state machine

| Stage | Evidence required before advancing |
|---|---|
| Preflight | Exact source layout and study; condition can be built; JSON template and webhook valid; request hash stored. |
| Source saved | Source is clean, or `save_source:true` authorizes saving the inspected source. Unknown dirty state cannot prove fidelity. |
| Copy submitted | Unique destination name and before-list of saved IDs recorded before native Save-As. |
| Copy identified | A new account saved numeric ID and layout ID exist, distinct from the original. |
| Copy verified | Destination widget exposes the new ID; readable pane/study/inputs/drawing configuration is compared. Unreadable fields are listed. |
| Destination configured | Optional new symbol is resolved by the instrument metadata, timeframe read back, copied study identity re-resolved. |
| Destination saved | Actual destination ID/name/state confirm saving; the source is not used for the alert write. |
| Alert prepared | Exact destination symbol/timeframe/Pine identity and current inputs form the desired configuration. |
| Alert submitted | Submitted stage and before-list of alert IDs recorded before the native creation request. |
| Alert verified | Independently returned alert ID/configuration match exact webhook, JSON bytes/hash, condition and lifecycle state. |
| Complete | Receipt identifies original, copy and alert, with verified/unknown fields and delivery status explicitly separate. |

Native copy may navigate the current tab or open another one. The workflow discovers where the destination loaded and returns its target ID. A second tab showing the source saved ID is never accepted as an independent copy. Shared read-only charts and account plan constraints may block a native copy; the server reports the observed blocker rather than silently reconstructing a partial chart.

### Idempotency and ambiguous acknowledgements

Checkpoints record the operation hash, submitted stage, known IDs, created IDs and verification hashes. They do not store the alert JSON body, webhook token or Pine source. Reusing a key with a different definition yields an idempotency conflict.

If a clone/create response is lost, the server reconciles newly observed IDs against both the before-list and desired configuration. It does not assume a concurrent same-name object belongs to this operation. If ownership cannot be proven, return `UNCERTAIN_MUTATION` and enough IDs/stage information for inspection. Do not automatically submit another create request. A rerun with the original key uses the recorded IDs and re-verifies them.

### What copy confirmation means

Independent saved-layout identity and the readable intended chart configuration can be confirmed. **Full serialized layout fidelity remains unverified.** Some internal chart properties, all strategy execution settings, hidden state, account-specific script permissions or every drawing property may be unavailable. The receipt's `full_fidelity_verified`/equivalent field remains false unless a future implementation actually proves complete equivalence. Native copying is still stronger than a partial snapshot rebuild.

## 8. Alerts: JSON, webhooks and lifecycle

Supported native creation modes are price threshold/crossing conditions, attached Pine strategy **order fills**, and discovered indicator `alertcondition` IDs with valid plot offsets. Arbitrary strategy `alert()` modes and every possible TradingView condition type are not implied by a generic “strategy” label. Missing exact Pine ID/version, required input values or indicator condition metadata fails closed.

The JSON validator preserves the supplied message byte-for-byte. It parses a surrogate only to validate template structure; it does not replace placeholders, reserialize the message or invent values. Strings containing placeholders are retained exactly. A template can be structurally valid while a future placeholder substitution produces invalid JSON; the result distinguishes those claims.

The webhook validator accepts a public HTTPS endpoint on port 443, with no embedded username/password or IPv6 literal. This is intentionally stricter than TradingView's general acceptance of ports 80/443. It rejects obvious private/local destinations but performs no DNS request or test delivery. A URL query/path may carry the operator's webhook token; ordinary logs/checkpoints must use hashes or redacted summaries.

TradingView's official documentation states that valid JSON is delivered with `application/json`, that webhooks require two-factor authentication, that only ports 80/443 are supported, and that a slow endpoint can time out after three seconds. See [TradingView webhook configuration](https://www.tradingview.com/support/solutions/43000529348-how-to-configure-webhook-alerts/). Account entitlements and browser/API behavior are validated during the live pilot.

### List all alerts

`alert_list` is paginated. Start with `{"limit":500,"offset":0}` and continue with each returned `next_offset` until `has_more:false`. Filters apply before pagination. The result reports total/matched/returned counts; there is no 500-alert total cap. Deduplicate IDs or repeat the inventory if alerts change while pages are read. `alert_fires` has analogous pagination over the history TradingView actually retains/returns.

### Pause, resume and update

`alert_pause` and `alert_resume` require explicit alert ID arrays and poll actual server state; an accepted request alone is not confirmation. Bulk creation preflights all definitions, uses per-item idempotency and reports partial progress. `alert_delete` confirms exact IDs disappeared.

Some native update/clone/create paths may temporarily activate an alert. Paused creation requests paused state, then checks it and stops an acknowledged owned alert if necessary; the receipt reports any possible activation window. A paused alert's configuration update is refused unless `allow_temporary_activation:true` explicitly accepts native re-arming. Pause is not a guarantee that an already queued trigger or webhook is withdrawn.

`alert_get` can return requested configuration; defaults are redacted summaries. `alert_verify` performs independent comparisons against the desired definition, including exact body/webhook hashes. “Alert exists,” “configuration verified,” “active verified,” “fire observed” and “webhook received” are distinct outcomes. Only the first four are available from these server interfaces; actual endpoint delivery requires separate operator-controlled evidence.

## 9. Strategy Tester, Pine and research requirements

Use native report objects and exact attached strategy entity IDs. Full trades are paginated from the actual trade ledger; a 20-order cache, rendered summary or aggregate equity point is not a full backtest. Return requested/actual strategy, symbol, timeframe, chart type, tested period and whichever settings the native report exposes. Report missing fields, sampling, pagination and source paths.

Freshness checks must relate an observed report change/event to the requested context. Stable repeated metrics alone are insufficient. An identical strategy result can be legitimate, but if no generation/recalculation evidence exists the tool must state uncertainty instead of treating stability as freshness. The current implementation cannot promise an authoritative server-issued report revision or atomic cross-field report provenance.

Sweeps and symbol/timeframe scans are sequential, bounded and uncached by default. Store per-case parameters, context, evidence, duration and failures. Restore original state where promised and verify restoration; preserve a partial result if restoration fails. Do not claim optimization establishes out-of-sample profitability. Local numeric metrics are transparent calculations over supplied samples and are labeled separately from TradingView's native report.

Pine source editing uses a uniquely identified visible editor/facade, exact title/ID/version/source hashes where available, preimage guards and independently observed results. Detached or ambiguous editors are rejected. Same-length source changes require a full-content comparison. Compile/save claims require positive scoped evidence; a click or silent absence of console errors is not sufficient. Explicit Pine backups/exports are local sensitive artifacts, not telemetry.

Deep Backtesting, the exact fill engine, lower-timeframe reconstruction and every historical equity sample remain capability gaps unless separately established in the account. Bar Replay controls are distinct from a historical strategy recalculation and from paper/live order execution.

## 10. Feature families in the source build

The authoritative current tool names, schemas, bounds, descriptions and mutation flags are generated directly from code into **docs/TOOLS.json** and **docs/FEATURES.md**. The appended inventory contains the entire surveyed upstream feature union. Overlapping legacy names are consolidated; an upstream declaration is not automatically a separate new tool.

| Family | Delivered behavior | Important limit |
|---|---|---|
| Browser and diagnostics | Eligible tabs, open/activate/close/navigate, screenshots, health, capabilities, catalog, audits, emergency stop. | No Desktop, remote CDP, raw JavaScript or broker gateway. |
| Saved layouts | List/get/save/native copy/open/new/rename/delete and configuration snapshots. | Complete serialized copy fidelity is not provable from exposed fields. |
| Charts and studies | State, exchange-qualified symbols, resolved instrument checks, timeframe/type/range controls, study list/add/remove/inputs/visibility. | Native methods and account entitlements may differ. |
| Panes | Layout options, visible pane counts, focus identity, per-pane symbol/timeframe, synchronization read/set. | Hidden retained widgets are not counted as visible panes; linked changes must be reported. |
| Templates | Native indicator template list/get/snapshot/save/apply/delete/export. | Indicator templates are not complete saved layouts; backups/partial fidelity are explicit. |
| Drawings | Enumerate/get/create/update/remove/clear/export/import with exact IDs, preimages, all available points and partial receipts. | Shape aliases are checked; snapped time/price coordinates are reported. |
| Watchlists | Exact-ID lists, symbols/sections, create, add/remove/bulk, import preview/merge/replace, export, reorder and reconciliation. | Reorder uses verified clear/append and temporarily empties the list; no fabricated rename/delete-list endpoint. |
| Pine | Editor status/source/edit/analyze, compiler/diagnostics, saved library/version lifecycle where native binding is verified. | No external AI upload, ambiguous title fallback or automatic public publishing. |
| Native strategy/data | Report, trades, orders, per-trade equity, status/freshness, inputs, scans, sweeps, comparisons, OHLCV and Pine graphics. | Loaded-data/account limits and report provenance are explicit; no Deep Backtesting promise. |
| Alerts | Complete pagination, detail/sources/prepare/validate, native create/update/clone, pause/resume/delete, history, bulk/reconcile/verify. | Supported condition modes are explicit; no proof of endpoint delivery. |
| Replay | Observed status, start/step/play/pause/stop and supported native controls. | WatchedValue false is not truthy-active; no blind toggle or live trade. |
| Public market | Restricted public TradingView scans/technical summaries/hotlists and available chart quote/depth observations. | No third-party feed; CORS-aware public transport contains no session credentials. |
| UI | Bounded visible controls, selectors, dialogs and panel inspection; optional click/type/key/hover/scroll. | Generic mutations off by default; dispatch is not business success. |
| Jobs/streams | Bounded sequential batches, in-process background jobs/status/cancel, read-only polling/buffer/stop. | No automatic job restart or exactly-once distributed scheduler; polling is not a tick feed. |
| Local research/paper | CSV/JSON, trade/equity metrics, ranking, local simulation accounts/fills/marks/exports. | Paper is a supplied-price arithmetic simulator, with no native or live broker connection. |

### Remaining gaps and deliberate exclusions

Do not claim this build already implements literally every capability in every upstream project. The full inventory is a specification and research record. The generated catalog is the actual implemented surface. In particular, watchlist rename/delete-list, Deep Backtesting controls, complete serialized chart backup/restore, native broker order execution, real webhook delivery measurement, native alert `alert()` variants beyond supported modes, arbitrary external news/sentiment feeds, and platform-specific UI variations require additional implementations or live evidence. Per-case sweep duration and chart type embedded directly in strategy report records are remaining metadata requirements; overall audit duration and the separate chart state tool are currently available. Pine editing is a guarded full-buffer replacement, not a dedicated patch engine.

Deliberate exclusions are TradingView Desktop launchers, cookie/session/profile extraction, Node authenticated cookie requests, third-party telemetry/cloud sync, external Pine-source AI uploads, remote self-update/install, arbitrary evaluation/CDP/shell tools, unlicensed source copying and uncontrolled public deployment. These exclusions preserve the requested security properties; they are not hidden successful tools.

## 11. Errors, receipts and recovery

Tool errors are MCP results with `isError:true` and a structured code/message/details envelope. Invalid MCP methods/params retain JSON-RPC error codes. Representative domain errors include layout/target mismatch, ambiguous source, preimage mismatch, unsupported capability, unverifiable state, idempotency conflict, uncertain mutation, partial import/bulk failure, cancellation and emergency stop.

Receipts distinguish attempted, submitted, observed, verified, failed and unknown. Partial errors retain already-created IDs, failed item indexes and relevant reconciliation evidence. Logging failure must not mask a successful action: return the action receipt with `audit_warning`. Cancellation is cooperative and cannot undo writes already accepted by TradingView.

Local storage uses bounded area names, hashed internal keys, owner-only files, atomic replacement, symlink rejection and path confinement. CSV exports escape spreadsheet-formula prefixes. Redaction covers known secrets but does not certify arbitrary user content as secret-free. Routine audit records include operation ID, tool, target, outcome/code and duration, not full arguments or payloads.

## 12. Setup and MCP compatibility

1. Extract the source package and inspect SPEC.md, the source audit, notices and configuration.
2. Run `node scripts/security-audit.mjs`, `node scripts/check.mjs`, then `node scripts/test.mjs`.
3. Run `node src/cli.mjs launch` with a dedicated empty browser profile. Manually sign in and open a saved Superchart.
4. Run `node src/cli.mjs doctor` and configure the client with `node /absolute/path/src/server.mjs` and an absolute `TV_DATA_DIR`.
5. Begin with read-only discovery. The MCP `tools/list` response is paginated; clients must follow `nextCursor` to see the entire catalog.
6. Perform the live acceptance pilot below before relying on mutations in valuable layouts.

Chrome's remote-debugging behavior requires a nondefault profile: [Chrome remote debugging change](https://developer.chrome.com/blog/remote-debugging-port). The generic client config is in examples/mcp-config.json. No npm install or `npx` remote execution is necessary.

MCP protocol versions are negotiated from the implemented version set, with UTF-8 newline stdio, initialized/ping/tool/resource/prompt methods, cancellation and structured tool output. Optional HTTP binds literal loopback, requires a strong bearer token, checks Host/Origin and supports JSON POST only. GET/SSE, a public OAuth gateway and hosted multi-user isolation are not implemented. See [MCP transport specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports).

## 13. Acceptance and validation

### Offline gates

- Source gate rejects forbidden credential extraction, external AI imports and unreviewed runtime dependencies.
- Schemas/catalog have unique names, closed top-level arguments, valid definitions and real handlers.
- Protocol tests cover initialization/version negotiation, pagination, UTF-8 fragmentation, malformed requests, tool errors, cancellation and HTTP handler gates.
- Security tests cover remote-CDP/host/userinfo/path bypasses, third-party page fetches, redirects, auth headers, inert caller strings, origin changes, known-secret redaction, storage paths/symlinks and cookie canaries.
- Main acceptance fixture exercises the real registry/context/browser-manager/CDP wrapper and real layout/chart/alert/workflow adapters across separate controlled chart tabs.
- Core workflow tests include wrong native IDs, input mismatch, duplicate names/keys, lost acknowledgements, concurrent unrelated alerts, complete alert pagination, missing webhook data, exact JSON bytes, pause/resume and replay without duplicate writes.
- Research fixtures cover exact strategy selection, full ledgers/large loaded datasets, freshness failures, Pine preimages/editor binding, pane visibility/focus, template identity, backups and input changes. The complete sweep restoration loop still requires a dedicated acceptance test and live verification.
- Operational tests cover partial receipts, emergency-stop races, bounded jobs, local paper arithmetic/idempotency and the public-market no-cookie boundary.

The delivered test results are in docs/TEST_RESULTS.json, with the exact scope and individual outcomes. They are controlled offline fixtures. Browser launching, a listening HTTP socket, real account permissions, actual TradingView internals and webhook receipt were not established by these tests.

### Live browser pilot — required before production reliance

Use a disposable source layout in the operator's dedicated browser profile. The operator supplies the actual source, target symbol/timeframe, alert condition, webhook URL and JSON message. The pilot must:

1. Inventory eligible tabs, layout IDs, account-visible studies and alert conditions.
2. Inspect and save the intended source or explicitly accept its saved-state copy semantics.
3. Copy using one idempotency key and verify independent numeric/layout IDs and readable configuration.
4. Change the copy's symbol/timeframe and verify resolved instrument metadata and destination save state.
5. Create the intended alert, re-read its exact ID/configuration and record verified/unknown fields.
6. List every alert page and ensure the created ID is present exactly once.
7. Pause the exact ID, re-read paused state; resume it only when activation is intended, and re-read active state.
8. Repeat the workflow with the same key and prove no duplicate chart or alert is created.
9. Switch a target to the wrong layout and prove the guard refuses the next write.
10. Run a strategy report/readback before and after a controlled parameter change; examine freshness and full-trade coverage.
11. Separately observe a real TradingView alert fire and endpoint receipt if delivery testing is requested. Do not substitute an MCP-originated request.
12. Reconcile and clean up only the exact disposable objects created by the pilot.

Record browser/TradingView interface version where exposed, OS, plan, locale, strategy version, tested date and outcomes. Do not repeat security or production-readiness claims after updating source without rerunning the relevant gates.

## 14. Delivery manifest

- SPEC.md and DEVELOPER_PROMPT.md.
- Complete independently written Node source, launcher and MCP runtime.
- README.md and copy-alert/MCP configuration examples.
- Actual generated tool schemas and implementation inventory.
- Huge semantic upstream inventory and literal tool registration appendix.
- Pinned source audit, per-file provenance and third-party notices.
- Offline unit, security, protocol and end-to-end controlled-CDP tests with recorded results.
- Explicit gaps and live validation requirements.

The accompanying package is a substantive implementation, not a claim of universal compatibility. No real user chart, alert, broker order, browser cookie or webhook was used to demonstrate it during this build.

---

# Appendix A — Complete upstream feature union

The following appendix is copied from the audited inventory included in this package. “Required unified behavior” describes the target specification and adoption decision. Use docs/FEATURES.md to distinguish the source build's registered implementations from unimplemented or excluded upstream features.

# Upstream feature inventory and adoption map
**Reviewed: 2026-10-19 UTC. All findings apply to the pinned revisions in [UPSTREAMS.json](UPSTREAMS.json).**

This is the research catalog behind the combined browser MCP. It describes features present or attempted in the reviewed upstream sources, plus the requirements needed to combine them reliably. It is **not an implementation status report**. Use the project's SPEC.md and generated tool catalog for the current implementation. A function definition, successful unit test and successful live TradingView operation are different kinds of evidence.

The static registration inventory contains **599 tool declarations across eight repositories and 280 distinct literal tool names**. Many names overlap or wrap the same capability. Counts include conditional, optional, desktop-only, unsafe and excluded tools. They must not be presented as 599 working features in one server. The full per-repository lists below preserve exact names for traceability.

## Sources and roles
| Code | Repository / pinned revision | Static declarations | Primary contribution |
| --- | --- | --- | --- |
| F | [FerroxLabs/tvcontrol](https://github.com/FerroxLabs/tvcontrol) at [a8d3dfc97621](https://github.com/FerroxLabs/tvcontrol/commit/a8d3dfc97621e22b8b7c71e617b134c5e35882ee) | 114 | Broad chart control, studies, Pine, snapshots, batches, watchlists and diagnostics |
| J | [JostQQ/tradingview-mcp](https://github.com/JostQQ/tradingview-mcp) at [4d9b440935d5](https://github.com/JostQQ/tradingview-mcp/commit/4d9b440935d5e8b862ab61a72812adf801684564) | 104 | Native Strategy Tester report, trade ledger and Pine lifecycle reference |
| P | [pbajkovic-hub/tv-cdp-mcp](https://github.com/pbajkovic-hub/tv-cdp-mcp) at [dd0fd3c07ad1](https://github.com/pbajkovic-hub/tv-cdp-mcp/commit/dd0fd3c07ad10ea6151fc21aeff3791db7cb7219) | 29 | Native independent layout copy, saved-layout verification and alert/template control |
| R | [firyomaefx/tradingview-chrome-mcp](https://github.com/firyomaefx/tradingview-chrome-mcp) at [d20f0acf7a2d](https://github.com/firyomaefx/tradingview-chrome-mcp/commit/d20f0acf7a2d888ef7fe9304178fae35c233c42c) | 65 | Browser-first workflow and feature ideas only |
| T | [tradesdontlie/tradingview-mcp](https://github.com/tradesdontlie/tradingview-mcp) at [c05b8f5755ed](https://github.com/tradesdontlie/tradingview-mcp/commit/c05b8f5755ed8e64ea242de88ddbf46aa24d56a4) | 84 | Original shared chart/CDP/Pine API reference |
| C | [Chefy3x/tradingview-mcp-chefy](https://github.com/Chefy3x/tradingview-mcp-chefy) at [abcad6c6a49a](https://github.com/Chefy3x/tradingview-mcp-chefy/commit/abcad6c6a49a89a99f700abacffa2cdb61883fe7) | 83 | Aggregation and local research-session workflow ideas |
| I | [iliaal/tradingview-mcp](https://github.com/iliaal/tradingview-mcp) at [233f29e18003](https://github.com/iliaal/tradingview-mcp/commit/233f29e180031291dacac4c4cc2736a8dde161be) | 111 | Pane batches, drawings, deep-backtest UI and scanner concepts |
| D | [daviddme/tradingview-alerts-mcp-server](https://github.com/daviddme/tradingview-alerts-mcp-server) at [5a61aa352c97](https://github.com/daviddme/tradingview-alerts-mcp-server/commit/5a61aa352c97403477052aead3a3dcab627c2dd0) | 9 | Native strategy-alert payload construction |

Ferrox has 113 ordinary tool registrations plus the opt-in ui_evaluate declaration. firy has 65 top-level definitions at this revision, with backend, news and edition gating; its README's headline count is not the source count. Other README counts also differ from current declarations. The inventory is static and does not instantiate any upstream server.

## The user's core workflow
| Step | Strongest reviewed implementation reference | Material requirement |
| --- | --- | --- |
| Copy an existing chart/layout to an independent saved layout | P: tv_copy_layout | Native Save-As operation; verify a new saved ID and intended name; retain source identity. |
| Work on the correct copy | P: explicit layout binding; F/J/I: tab and pane control | Bind the new target and re-check ID after navigation; an extra tab of the same layout is not a copy. |
| Change symbol and timeframe | F/J/T/I chart_set_symbol/chart_set_timeframe; P tv_set_symbol/tv_set_resolution | Verify actual chart state, including target pane and canonical exchange-qualified symbol. |
| Preserve or change the strategy inputs | J strategy_get_inputs/strategy_set_inputs; F/J indicator inputs | Match the requested entity precisely; inspect and read back inputs; never silently fall back to another strategy. |
| Wait for backtest computation | J strategy_wait and strategy_scan | Calculation freshness must match layout, strategy, symbol, timeframe and inputs; a visible panel or stable old metrics is insufficient. |
| Read metrics, trades and equity | J strategy_get_report/strategy_get_trades/strategy_get_equity | Keep native source metadata; distinguish closed trades, orders and open trades, and per-trade versus per-bar equity. |
| Save and export the result | P tv_export_data; J write_file support; F batch/snapshot patterns | Safe output directory, bounded data, provenance and explicit partial/unavailable status. |

P is the strongest native-copy reference. J is the strongest native report/trade-ledger reference. F supplies broad chart controls and diagnostics. No reviewed project provides verified, complete coverage of the whole workflow on an authenticated Chrome session. This build combines selected patterns and adds verification requirements; it does not inherit an upstream live-test claim.

## Important semantic distinctions
- A new tab opening the same saved layout is another view of that layout. It does not produce an independent saved layout.
- A blank layout plus manually re-added studies does not prove preservation of drawings, study properties, private-script bindings, pane configuration or unsaved edits.
- A state snapshot can be useful without being a full-fidelity saved-layout clone. Ferrox captures active-chart state and pane metadata, but restoration is partial; inspect its skipped/unapplied fields.
- TradingView Strategy Tester reports, recent strategy orders, Replay trades, broker paper orders and an independent fixture simulator are different datasets.
- Jost reads native reportData().trades. Ferrox data_get_trades reads ordersData() and hard-caps results at 20 recent orders. These tools do not promise the same output.
- Jost's equity series is built from per-trade account values plus the available buy-and-hold series. It is not automatically a per-bar mark-to-market equity curve.
- A function returning success after triggering a click is evidence of an attempted action. A verified new layout ID, changed input value or matching calculation is stronger evidence.

Source evidence: [src/tools/layouts.mjs](https://github.com/pbajkovic-hub/tv-cdp-mcp/blob/dd0fd3c07ad10ea6151fc21aeff3791db7cb7219/src/tools/layouts.mjs); [src/core/state.js](https://github.com/FerroxLabs/tvcontrol/blob/a8d3dfc97621e22b8b7c71e617b134c5e35882ee/src/core/state.js); [src/core/data.js](https://github.com/FerroxLabs/tvcontrol/blob/a8d3dfc97621e22b8b7c71e617b134c5e35882ee/src/core/data.js); [src/core/strategy.js](https://github.com/JostQQ/tradingview-mcp/blob/4d9b440935d5e8b862ab61a72812adf801684564/src/core/strategy.js); [src/adapters/tradingview/adapter.ts](https://github.com/firyomaefx/tradingview-chrome-mcp/blob/d20f0acf7a2d888ef7fe9304178fae35c233c42c/src/adapters/tradingview/adapter.ts).

## Session health and capabilities
Source modules: [F — src/tools/health.js](https://github.com/FerroxLabs/tvcontrol/blob/a8d3dfc97621e22b8b7c71e617b134c5e35882ee/src/tools/health.js); [J — src/tools/health.js](https://github.com/JostQQ/tradingview-mcp/blob/4d9b440935d5e8b862ab61a72812adf801684564/src/tools/health.js); [I — src/tools/health.js](https://github.com/iliaal/tradingview-mcp/blob/233f29e180031291dacac4c4cc2736a8dde161be/src/tools/health.js).

| ID | Feature | Reviewed tool / source basis | Adoption requirement |
| --- | --- | --- | --- |
| UF-001 | CDP connection health | F/J/T/I tv_health_check | Return connection and selected target status without credentials. |
| UF-002 | Current chart health | F tv_chart_health | Detect unavailable chart model, feed and study states. |
| UF-003 | Known internal APIs | F/J/T/I tv_discover | Return fixed capability booleans; avoid arbitrary object dumps. |
| UF-004 | Compatibility check | F tv_compatibility_check | Report unavailable private APIs without assuming a stable contract. |
| UF-005 | Capability matrix | F tv_capability_matrix | Expose available operations, supported outputs and blockers. |
| UF-006 | UI state inspection | F/J/T/I tv_ui_state; R tv_status | Report panel/dialog readiness with bounded text. |
| UF-007 | Compatibility snapshot | F tv_compatibility_snapshot | Local, sanitized inspection artifact; no automatic upload. |
| UF-008 | Repair a chart | F tv_repair_chart | Run only scoped recovery with a receipt; avoid changing the original unexpectedly. |
| UF-009 | Reconnect | I tv_reconnect | Reconnect to an explicitly validated browser target. |
| UF-010 | Ensure ready | I tv_ensure; R tv_ensure_chart | Separate API-ready, chart-ready and feed-ready states. |
| UF-011 | Watchdog sampling | F tv_watchdog_sample/status/history | Adapt on-demand health observations; exclude OS background services. |
| UF-012 | Emergency stop concept | R emergency_stop/emergency_clear | Implement independently as cooperative job cancellation; no copied firy service layer. |

## Tabs and target binding
Source modules: [F — src/tools/tab.js](https://github.com/FerroxLabs/tvcontrol/blob/a8d3dfc97621e22b8b7c71e617b134c5e35882ee/src/tools/tab.js); [I — src/tools/tab.js](https://github.com/iliaal/tradingview-mcp/blob/233f29e180031291dacac4c4cc2736a8dde161be/src/tools/tab.js); [P — src/cdp.mjs](https://github.com/pbajkovic-hub/tv-cdp-mcp/blob/dd0fd3c07ad10ea6151fc21aeff3791db7cb7219/src/cdp.mjs).

| ID | Feature | Reviewed tool / source basis | Adoption requirement |
| --- | --- | --- | --- |
| UF-013 | List chart tabs | F/J/T/I tab_list; R browser_list_tabs | Return only approved TradingView chart tabs with sanitized metadata. |
| UF-014 | Switch target | F/J/T/I tab_switch | Use exact target identity; do not rely on a mutable active window. |
| UF-015 | Open chart tab | F/J/T/I tab_new | Validate chart URL and return new target ID; do not describe this as cloning. |
| UF-016 | Close a tab | F/J/T/I tab_close | Identify target and check unsaved work before closing. |
| UF-017 | Switch by layout name | I tab_switch_by_name | Fail on duplicate names; resolved IDs are authoritative. |
| UF-018 | Pin a target | I tab_pin | Explicit persistent target preference, without browser credential state. |
| UF-019 | Unpin a target | I tab_unpin | Remove only the selected binding. |
| UF-020 | Target registry | I tab_registry | List registered local target associations; no cross-account discovery. |
| UF-021 | Expected layout precondition | P shared layout/expect_layout arguments | Refuse a mutation if the target no longer shows the expected layout. |
| UF-022 | Handle navigation reload | P tv_open_chart_url/copy implementation | Await target context replacement and revalidate the new document. |

## Saved layouts and chart copy
Source modules: [P — src/tools/layouts.mjs](https://github.com/pbajkovic-hub/tv-cdp-mcp/blob/dd0fd3c07ad10ea6151fc21aeff3791db7cb7219/src/tools/layouts.mjs); [F — src/tools/ui.js](https://github.com/FerroxLabs/tvcontrol/blob/a8d3dfc97621e22b8b7c71e617b134c5e35882ee/src/tools/ui.js); [J — src/core/layouts.js](https://github.com/JostQQ/tradingview-mcp/blob/4d9b440935d5e8b862ab61a72812adf801684564/src/core/layouts.js).

| ID | Feature | Reviewed tool / source basis | Adoption requirement |
| --- | --- | --- | --- |
| UF-023 | List saved layouts | P tv_list_saved_layouts; F/J layout_list | Read saved account layouts, IDs and names. |
| UF-024 | Read current layout | F layout_get_active; J layout_current | Include saved ID, name, dirty/read-only status where exposed. |
| UF-025 | Open saved layout | F/J/T/I layout_switch; P tv_open_chart_url | Bind exact layout; check for unsaved work. |
| UF-026 | Open a shared chart | P tv_open_chart_url | Allow genuine TradingView chart links only; report view-only status. |
| UF-027 | Native independent copy | P tv_copy_layout | Use Save-As controller and verify a new account saved ID. |
| UF-028 | Copy with explicit source URL | P tv_copy_layout(source_url) | Navigate to validated source, then bind the resulting copy. |
| UF-029 | Name collision check | P tv_copy_layout allow_duplicate_name | Prefer unique names; if allowed, still identify output by new ID. |
| UF-030 | Read-only chart copy | P tv_copy_layout | Report unsupported when ownership/plan/private-script constraints block it. |
| UF-031 | Preserve source | New unification requirement | Capture source ID and metadata before mutation; verify it remains intact. |
| UF-032 | Unsaved-edit copy policy | Gap in P native server clone flow | Save source explicitly or report that clone reflects saved state; never claim unsaved fidelity without evidence. |
| UF-033 | New blank layout | F/J layout_create; J layout_new | Advertise as blank creation, distinct from full copy. |
| UF-034 | Save current layout | F/J layout_save; R tv_layout_save | Verify saved identity/name after save. |
| UF-035 | Rename layout | P tv_rename_layout; J layout_rename | Exact target, nonblank name and read-back. |
| UF-036 | Delete saved layout | P tv_delete_layout; J layout_delete | Precisely targeted deletion with protected/current-layout handling. |
| UF-037 | Layout export | R tv_layout_export; F state_snapshot | Independently implement a documented partial snapshot schema. |
| UF-038 | Copy fidelity receipt | New unification requirement | Compare panes, symbols, resolutions, study IDs/inputs and drawings; list fields not checked. |

## Panes and multichart work
Source modules: [F — src/tools/pane.js](https://github.com/FerroxLabs/tvcontrol/blob/a8d3dfc97621e22b8b7c71e617b134c5e35882ee/src/tools/pane.js); [I — src/tools/pane.js](https://github.com/iliaal/tradingview-mcp/blob/233f29e180031291dacac4c4cc2736a8dde161be/src/tools/pane.js).

| ID | Feature | Reviewed tool / source basis | Adoption requirement |
| --- | --- | --- | --- |
| UF-039 | List panes | F/J/T/I pane_list | Stable pane indices/IDs and each pane's symbol/timeframe. |
| UF-040 | Set pane layout | F/J/T/I pane_set_layout | Validate supported arrangement and plan limits; verify pane count. |
| UF-041 | Focus pane | F/J/T/I pane_focus | Read back focused identity. |
| UF-042 | Set pane symbol | F/J/T/I pane_set_symbol | Do not inadvertently change every synchronized pane. |
| UF-043 | Set pane timeframe | I pane_set_timeframe | Address the intended pane explicitly. |
| UF-044 | Read multiple panes | I pane_read_batch | Return per-pane provenance, errors and partial results. |
| UF-045 | Pane synchronization awareness | New unification requirement | Report observed linked-symbol/timeframe settings and side effects. |
| UF-046 | Restore pane arrangement | F state_restore | Do not collapse a multipane layout using an unreliable layout code. |

## Chart, symbol and timeframe controls
Source modules: [F — src/tools/chart.js](https://github.com/FerroxLabs/tvcontrol/blob/a8d3dfc97621e22b8b7c71e617b134c5e35882ee/src/tools/chart.js); [J — src/tools/chart.js](https://github.com/JostQQ/tradingview-mcp/blob/4d9b440935d5e8b862ab61a72812adf801684564/src/tools/chart.js); [P — src/tools/chart.mjs](https://github.com/pbajkovic-hub/tv-cdp-mcp/blob/dd0fd3c07ad10ea6151fc21aeff3791db7cb7219/src/tools/chart.mjs).

| ID | Feature | Reviewed tool / source basis | Adoption requirement |
| --- | --- | --- | --- |
| UF-047 | Read chart state | F/J/T/I chart_get_state; P tv_get_chart_state | Return exact symbol, interval, chart type, pane and layout. |
| UF-048 | Change symbol | F/J/T/I chart_set_symbol; P tv_set_symbol | Use exchange-qualified symbol where possible; verify result. |
| UF-049 | Change timeframe | F/J/T/I chart_set_timeframe; P tv_set_resolution | Normalize TradingView intervals and verify actual resolution. |
| UF-050 | Change chart style | F/J/T/I chart_set_type | Map allowed styles; synthetic styles need explicit report context. |
| UF-051 | Select session | J chart_set_session | Expose regular/extended session when the chart supports it. |
| UF-052 | Symbol search | F/J/T/I symbol_search; R tv_search_symbols | Fixed TradingView symbol-search adapter; bounded results. |
| UF-053 | Symbol metadata | F/J/T/I symbol_info | Include exchange, description, type, timezone and supported fields. |
| UF-054 | Canonical symbol/currency | D resolve_symbol | Use TradingView's canonical token and currency-id for alerts. |
| UF-055 | Visible time range | F/J/T/I chart_get_visible_range | Return range with time units and timezone context. |
| UF-056 | Set visible range | F/J/T/I chart_set_visible_range | Wait until requested range is reflected; bound arguments. |
| UF-057 | Scroll to date | F/J/T/I chart_scroll_to_date | Do not claim deeper bar data was loaded solely because viewport moved. |
| UF-058 | Chart zoom | J chart_zoom | Target-specific scale operation with a bounded amount. |

## Studies and indicator templates
Source modules: [F — src/tools/indicators.js](https://github.com/FerroxLabs/tvcontrol/blob/a8d3dfc97621e22b8b7c71e617b134c5e35882ee/src/tools/indicators.js); [J — src/tools/indicators.js](https://github.com/JostQQ/tradingview-mcp/blob/4d9b440935d5e8b862ab61a72812adf801684564/src/tools/indicators.js); [P — src/tools/templates.mjs](https://github.com/pbajkovic-hub/tv-cdp-mcp/blob/dd0fd3c07ad10ea6151fc21aeff3791db7cb7219/src/tools/templates.mjs).

| ID | Feature | Reviewed tool / source basis | Adoption requirement |
| --- | --- | --- | --- |
| UF-059 | List attached studies | F/J chart_get_state; P tv_list_studies | Return stable entity ID and strategy/indicator classification. |
| UF-060 | Search indicators | F/J/T indicator_search | Handle saved/public/library categories without arbitrary navigation. |
| UF-061 | Add study | F indicator_add_from_search; J/T indicator_add; P template apply | Verify attached entity; no success on mere search click. |
| UF-062 | Remove study | F/J/T/I chart_manage_indicator; R tv_indicator_remove | Use entity ID; support clear error when missing. |
| UF-063 | Remove by title | I chart_remove_studies_by_title | Resolve all matches explicitly; ambiguity must be visible. |
| UF-064 | Read input definitions | F/J/P indicator_get_inputs or tv_get_study_inputs | Preserve types, defaults, min/max/options and current values. |
| UF-065 | Set typed inputs | F/J/T/I indicator_set_inputs; P tv_set_study_inputs | Validate identifiers and ranges, then read back. |
| UF-066 | Toggle visibility | F/J/T/I indicator_toggle_visibility | Keep visibility distinct from remove/re-add. |
| UF-067 | Snapshot study template | P tv_study_template(action=snapshot) | Return documented template contents without session state. |
| UF-068 | Save/list/apply/delete templates | P tv_study_template | Verify named template identity and resulting attached studies. |

## Market and study data
Source modules: [F — src/tools/data.js](https://github.com/FerroxLabs/tvcontrol/blob/a8d3dfc97621e22b8b7c71e617b134c5e35882ee/src/tools/data.js); [J — src/tools/data.js](https://github.com/JostQQ/tradingview-mcp/blob/4d9b440935d5e8b862ab61a72812adf801684564/src/tools/data.js); [P — src/tools/data.mjs](https://github.com/pbajkovic-hub/tv-cdp-mcp/blob/dd0fd3c07ad10ea6151fc21aeff3791db7cb7219/src/tools/data.mjs); [I — src/tools/data.js](https://github.com/iliaal/tradingview-mcp/blob/233f29e180031291dacac4c4cc2736a8dde161be/src/tools/data.js).

| ID | Feature | Reviewed tool / source basis | Adoption requirement |
| --- | --- | --- | --- |
| UF-069 | OHLCV bars | F/J/T/I data_get_ohlcv; P tv_get_bars | Bound count; identify loaded range and timestamps. |
| UF-070 | OHLCV summary | F data_get_ohlcv(summary) | Aggregate in page and label statistics/coverage. |
| UF-071 | Current quote | F/J/T/I quote_get | State timestamp and available fields, not fabricated real-time assurance. |
| UF-072 | Batch quotes | F quote_batch | Return per-symbol status and bounded batches. |
| UF-073 | Market depth | F/J/T/I depth_get | Capability-gate; distinguish unavailable subscription/feed. |
| UF-074 | Latest indicator values | F/J/T/I data_get_indicator | Include study/plot identity and bar timestamp. |
| UF-075 | Study values over bars | F/J/T/I data_get_study_values; P tv_get_study_values | Preserve nulls, gaps and series labels. |
| UF-076 | Pine-generated lines | F/J/T/I data_get_pine_lines | These are script outputs, distinct from user drawings. |
| UF-077 | Pine labels/tables/boxes | F/J/T/I data_get_pine_labels/tables/boxes | Bound text and treat as untrusted content. |
| UF-078 | Pine shapes | I data_get_pine_shapes | Capability-gate actual exposed shape data. |
| UF-079 | Multiple timeframe snapshot | I data_get_multi_timeframe | Record actual symbol/timeframe for each sample. |
| UF-080 | Candlestick patterns | I data_detect_candlestick_patterns | Deterministic pattern labels over stated bars; no trading recommendation. |

## Pine editor and script library
Source modules: [F — src/tools/pine.js](https://github.com/FerroxLabs/tvcontrol/blob/a8d3dfc97621e22b8b7c71e617b134c5e35882ee/src/tools/pine.js); [J — src/tools/pine.js](https://github.com/JostQQ/tradingview-mcp/blob/4d9b440935d5e8b862ab61a72812adf801684564/src/tools/pine.js); [I — src/tools/pine.js](https://github.com/iliaal/tradingview-mcp/blob/233f29e180031291dacac4c4cc2736a8dde161be/src/tools/pine.js); [C — src/tools/pine.js](https://github.com/Chefy3x/tradingview-mcp-chefy/blob/abcad6c6a49a89a99f700abacffa2cdb61883fe7/src/tools/pine.js).

| ID | Feature | Reviewed tool / source basis | Adoption requirement |
| --- | --- | --- | --- |
| UF-081 | Editor status | J pine_status; R tv_open_pine_editor | Distinguish bound document, open editor and chart strategy. |
| UF-082 | Read editor source | F/J/T/I pine_get_source; R tv_read_pine_source | Requested source only; no hidden upload or automatic log copy. |
| UF-083 | Replace source | F/J/T/I pine_set_source | Validate size/type and verify actual editor contents. |
| UF-084 | Patch source | R tv_pine_patch concept | Independent deterministic patch with before/after checksum. |
| UF-085 | Create indicator/strategy | F/J/T/I pine_new; R tv_pine_create | Preserve new document semantics; avoid overwriting an open script. |
| UF-086 | Compile/update chart | F/J/T/I pine_compile | Wait for compile result and intended chart entity. |
| UF-087 | Read compile errors | F/J/T/I pine_get_errors | Bound errors; do not confuse stale diagnostics with new compile. |
| UF-088 | Read console | F/J/T/I pine_get_console | Requested bounded log entries with timestamp/provenance. |
| UF-089 | Console error filter | C pine_console_errors | Separate filter from assurance that execution has no errors. |
| UF-090 | Smart compile | F/T/I/C pine_smart_compile | Keep deterministic state machine; no opaque external code repair. |
| UF-091 | Static Pine analysis | F/J/T/I pine_analyze | Label syntactic heuristics and limitations. |
| UF-092 | Compile check without editor | F/J/T/I pine_check | Use approved TradingView compile adapter; no external compiler promise. |
| UF-093 | List saved scripts | F/J/T/I pine_list_scripts; D list_saved_strategies | Script ID/version/title and strategy classification. |
| UF-094 | Open saved script | F/J/T/I pine_open; I pine_switch_script | Verify editor binds requested script rather than first name match. |
| UF-095 | Read saved source | F pine_get_script_source; J pine_get_version | Keep version identity; source is explicitly requested data. |
| UF-096 | Save current script | F/T/I/C pine_save | Verify save result and script version. |
| UF-097 | Save as a new script | J pine_save_new; C/I pine_save_as | Independent ID/name; retain previous script. |
| UF-098 | Save next version | J pine_save_next | Return resulting revision/version. |
| UF-099 | Rename script | J/I pine_rename; R tv_rename_script | Exact script identity and read-back. |
| UF-100 | List versions | J pine_versions; I pine_version_history | Preserve returned ordering and version IDs. |
| UF-101 | Delete saved script | J/I pine_delete | Specific target and explicit destructive semantics; protected scripts. |
| UF-102 | Local backup/restore | R tv_pine_backup/list_backups/restore concepts | Independent safe files; no profile/cookie export. |
| UF-103 | Deploy source file | I pine_deploy | Prefer explicit source content or safe workspace file, not arbitrary disk path. |
| UF-104 | Publishing dialog inspection | I pine_publish_dialog_inspect | Read-only readiness is distinct from publishing; no hidden publish action. |

## Native Strategy Tester and backtests
Source modules: [J — src/tools/strategy.js](https://github.com/JostQQ/tradingview-mcp/blob/4d9b440935d5e8b862ab61a72812adf801684564/src/tools/strategy.js); [J — src/core/strategy.js](https://github.com/JostQQ/tradingview-mcp/blob/4d9b440935d5e8b862ab61a72812adf801684564/src/core/strategy.js); [F — src/core/data.js](https://github.com/FerroxLabs/tvcontrol/blob/a8d3dfc97621e22b8b7c71e617b134c5e35882ee/src/core/data.js); [I — src/tools/strategy.js](https://github.com/iliaal/tradingview-mcp/blob/233f29e180031291dacac4c4cc2736a8dde161be/src/tools/strategy.js).

| ID | Feature | Reviewed tool / source basis | Adoption requirement |
| --- | --- | --- | --- |
| UF-105 | Enumerate strategies | J strategy_list | Return IDs and exact names; do not equate all studies with strategies. |
| UF-106 | Read strategy properties | I data_get_strategy_info | Expose capital, commission, slippage and available calculation settings. |
| UF-107 | Headline backtest summary | F/J/T/I data_get_strategy_results; R tv_read_strategy_tester | Native report preferred; DOM summaries explicitly tagged as fallback. |
| UF-108 | Full native report | J strategy_get_report | Metrics plus long/short splits, currency and actual tested range. |
| UF-109 | Complete native trade ledger | J strategy_get_trades | Use report trades; distinguish closed and open rows. |
| UF-110 | Recent strategy orders | F/T/C data_get_trades | Name output as orders/recent limited data; never promote to full ledger. |
| UF-111 | Trade pagination | J strategy_get_trades offset/limit/order | Stable total count, truncation and same-report identity. |
| UF-112 | Trade economics | J strategy_get_trades | Entry/exit, P&L, fees, size, cumulative P&L, run-up and drawdown. |
| UF-113 | Trade duration | J strategy_get_trades | Use explicit timestamp units and available bar indices. |
| UF-114 | Per-trade account values | J strategy_get_equity | Label sampling basis; include initial/final capital when present. |
| UF-115 | Buy-and-hold comparison | J strategy_get_equity/report | Preserve available baseline and series basis. |
| UF-116 | Downsampled equity | F/C data_get_equity | Bound output and disclose downsampling; summary fallback is not a curve. |
| UF-117 | Strategy input inspection | J strategy_get_inputs | Exact entity and typed values. |
| UF-118 | Strategy input mutation | J strategy_set_inputs | Read-back plus fresh report wait, not just attached study existence. |
| UF-119 | Calculation wait | J strategy_wait | Expose stale/unchanged/timeout states; stable metrics alone are not proof. |
| UF-120 | Parameter scan | J strategy_scan; F strategy_sweep | Run bounded variants, retain baseline and restore deliberately. |
| UF-121 | Deep backtest date range | I strategy_set_deep_bt_range | Gate on plan/UI capability and report actual range; no deep-backtest promise when unsupported. |
| UF-122 | Reproducibility receipt | New unification requirement | Include layout, strategy, source/version when available, symbol, interval, input fingerprint and capture time. |
| UF-123 | Backtest mode distinction | R tv_paper_trade is a fixture simulator | Never substitute simulated fixture results for TradingView Strategy Tester. |

## Batch research and job control
Source modules: [F — src/tools/batch.js](https://github.com/FerroxLabs/tvcontrol/blob/a8d3dfc97621e22b8b7c71e617b134c5e35882ee/src/tools/batch.js); [F — src/tools/sweep.js](https://github.com/FerroxLabs/tvcontrol/blob/a8d3dfc97621e22b8b7c71e617b134c5e35882ee/src/tools/sweep.js); [J — src/core/batch.js](https://github.com/JostQQ/tradingview-mcp/blob/4d9b440935d5e8b862ab61a72812adf801684564/src/core/batch.js); [J — src/core/strategy.js](https://github.com/JostQQ/tradingview-mcp/blob/4d9b440935d5e8b862ab61a72812adf801684564/src/core/strategy.js).

| ID | Feature | Reviewed tool / source basis | Adoption requirement |
| --- | --- | --- | --- |
| UF-124 | Symbols by timeframes matrix | F/J/T/I batch_run | Bound Cartesian product and bind a working copy. |
| UF-125 | Batch quotes/bars | F batch_run/quote_batch | Per-item status; preserve symbol/timeframe provenance. |
| UF-126 | Batch study values | F/J/T batch_run | Read actual target study and sample range. |
| UF-127 | Batch strategy reports | J batch_run(strategy_report) | Require fresh matching calculation for each cell. |
| UF-128 | Batch trade exports | J batch_run(strategy_trades) | Report full-versus-partial semantics and file identity. |
| UF-129 | Batch screenshots | F/T/I batch_run | Explicitly requested images only, safe filenames. |
| UF-130 | Parameter sweep | F strategy_sweep; J strategy_scan | Grid/list bounds, valid types and deterministic execution order. |
| UF-131 | Cancellation/status | New unification requirement; R emergency_stop concept | Cooperative cancellation between steps; never imply rollback of already sent changes. |
| UF-132 | Restore baseline | F/J sweep patterns | Track original state and report any restore failure. |
| UF-133 | Aggregate comparison | R tv_backtest_compare concept | Compare compatible units/ranges; show failed/stale runs separately. |

## Bar Replay
Source modules: [F — src/tools/replay.js](https://github.com/FerroxLabs/tvcontrol/blob/a8d3dfc97621e22b8b7c71e617b134c5e35882ee/src/tools/replay.js); [J — src/tools/replay.js](https://github.com/JostQQ/tradingview-mcp/blob/4d9b440935d5e8b862ab61a72812adf801684564/src/tools/replay.js); [I — src/tools/replay.js](https://github.com/iliaal/tradingview-mcp/blob/233f29e180031291dacac4c4cc2736a8dde161be/src/tools/replay.js).

| ID | Feature | Reviewed tool / source basis | Adoption requirement |
| --- | --- | --- | --- |
| UF-134 | Replay status | F/J/T/I replay_status | Report actual active state and available point/resolution. |
| UF-135 | Start replay | F/J/T/I replay_start | Validate start date and available history. |
| UF-136 | Step bars | F/J/T/I replay_step | Bound count and verify moved replay position. |
| UF-137 | Autoplay/pause | F/J/T/I replay_autoplay | Explicit speed/state; cancellation must stop automation. |
| UF-138 | Stop replay | F/J/T/I replay_stop | Verify return to live chart mode. |
| UF-139 | Replay resolution | I replay_set_resolution | Do not confuse with visible chart resolution. |
| UF-140 | Replay trade | F/J/T/I replay_trade | Separate optional scope; not live broker execution or Strategy Tester history. |

## Drawings and chart annotations
Source modules: [F — src/tools/drawing.js](https://github.com/FerroxLabs/tvcontrol/blob/a8d3dfc97621e22b8b7c71e617b134c5e35882ee/src/tools/drawing.js); [I — src/tools/drawing.js](https://github.com/iliaal/tradingview-mcp/blob/233f29e180031291dacac4c4cc2736a8dde161be/src/tools/drawing.js); [R — src/tools/registry.ts](https://github.com/firyomaefx/tradingview-chrome-mcp/blob/d20f0acf7a2d888ef7fe9304178fae35c233c42c/src/tools/registry.ts).

| ID | Feature | Reviewed tool / source basis | Adoption requirement |
| --- | --- | --- | --- |
| UF-141 | List user drawings | F/J/T/I draw_list | Stable drawing IDs and known types. |
| UF-142 | Create generic shape | F/J/T/I draw_shape | Typed points and styles; allowlist supported shape types. |
| UF-143 | Horizontal line | R tv_drawing_add_horizontal_line concept; draw_shape | Price is numeric and target chart/pane explicit. |
| UF-144 | Trendline | R tv_drawing_add_trendline concept; draw_shape | Explicit time/price endpoints. |
| UF-145 | Rectangle | R tv_drawing_add_rectangle concept; draw_shape | Typed corners; avoid arbitrary property injection. |
| UF-146 | Fibonacci retracement | R tv_drawing_add_fib_retracement concept | Use known chart primitive; verify entity creation. |
| UF-147 | Position/risk drawing | I draw_position | A drawing does not place a broker order. |
| UF-148 | Read properties | F/J/T/I draw_get_properties | Project supported fields only. |
| UF-149 | Move drawing | I draw_move | Identify drawing and read back points. |
| UF-150 | Set drawing style | I draw_set_properties | Allowlisted property names and values. |
| UF-151 | Show/hide drawing | I draw_set_visible | Verify visibility without deleting entity. |
| UF-152 | Remove one drawing | F/J/T/I draw_remove_one | Fail for missing identity rather than deleting another. |
| UF-153 | Clear drawings | F/J/T/I draw_clear | Explicit broad mutation; report count and targeted pane. |

## Alerts and notifications
Source modules: [P — src/tools/alerts.mjs](https://github.com/pbajkovic-hub/tv-cdp-mcp/blob/dd0fd3c07ad10ea6151fc21aeff3791db7cb7219/src/tools/alerts.mjs); [D — src/alerts.js](https://github.com/daviddme/tradingview-alerts-mcp-server/blob/5a61aa352c97403477052aead3a3dcab627c2dd0/src/alerts.js); [D — src/tools.js](https://github.com/daviddme/tradingview-alerts-mcp-server/blob/5a61aa352c97403477052aead3a3dcab627c2dd0/src/tools.js); [F — src/tools/alerts.js](https://github.com/FerroxLabs/tvcontrol/blob/a8d3dfc97621e22b8b7c71e617b134c5e35882ee/src/tools/alerts.js).

| ID | Feature | Reviewed tool / source basis | Adoption requirement |
| --- | --- | --- | --- |
| UF-154 | List alerts | F/J/T/I alert_list; P tv_list_alerts; D list_alerts | Redact webhook/message secrets; return IDs/status. |
| UF-155 | Inspect alert condition | P tv_get_alert | Typed condition details and safe metadata. |
| UF-156 | Create price alert | F/J/T/I alert_create; R tv_alert_create | Explicit condition and paused default in unified design. |
| UF-157 | Create indicator alert | I alert_create_indicator | Verify study/plot identity and exposed alert condition. |
| UF-158 | Create native strategy alert | D create_strategy_alert | Use compiled Pine inputs and canonical symbol metadata; browser-managed auth only. |
| UF-159 | Clone alert template | P tv_create_alert | Known template as source; distinguish from general creation. |
| UF-160 | Bulk create | F alert_create_bulk | Bound batch and receipt per symbol. |
| UF-161 | Change alert condition | P tv_set_alert_condition | Preserve unrelated properties; read back target. |
| UF-162 | Pause alerts | P tv_pause_alerts; D pause_alerts | Target exact IDs or resolved nonempty selector. |
| UF-163 | Resume alerts | P tv_resume_alerts; D resume_alerts | Affects future notifications; explicit operation and result. |
| UF-164 | Delete alerts | F/J/T/I alert_delete; P tv_delete_alerts; D delete_alerts | No unscoped deletion; precise identifiers. |
| UF-165 | Delete by exact ID | F alert_delete_by_id | Do not use row index as persistent identity. |
| UF-166 | Firing history | D list_alert_fires | Bounded event history, timestamp and payload redaction. |
| UF-167 | Webhook configuration | D strategy alert payload; P alert tools | Explicit user setting; never copy session data; avoid returning secret URL. |
| UF-168 | Notification channels | D strategy alert payload | Popup/email/push flags; do not send test messages automatically. |
| UF-169 | Alert verification | New unification requirement | Read back active state, symbol, timeframe, Pine version and condition after mutation. |

## Watchlists
Source modules: [F — src/tools/watchlist.js](https://github.com/FerroxLabs/tvcontrol/blob/a8d3dfc97621e22b8b7c71e617b134c5e35882ee/src/tools/watchlist.js); [F — src/core/watchlist.js](https://github.com/FerroxLabs/tvcontrol/blob/a8d3dfc97621e22b8b7c71e617b134c5e35882ee/src/core/watchlist.js); [I — src/core/watchlist.js](https://github.com/iliaal/tradingview-mcp/blob/233f29e180031291dacac4c4cc2736a8dde161be/src/core/watchlist.js).

| ID | Feature | Reviewed tool / source basis | Adoption requirement |
| --- | --- | --- | --- |
| UF-170 | List saved watchlists | F watchlist_list | Include exact IDs, names and availability. |
| UF-171 | Read active watchlist | F/J/T/I watchlist_get; R tv_watchlist_read | Expose order, section markers and symbol count. |
| UF-172 | Read by ID | F watchlist_get_by_id | Exact numeric/string identifier according to observed API. |
| UF-173 | Create named watchlist | F watchlist_create | Reject blank names and verify new ID/name. |
| UF-174 | Add one symbol | F/J/T/I watchlist_add | Canonical symbols and membership read-back. |
| UF-175 | Add several symbols | F/J/T/I watchlist_add_bulk | Preserve ordering and explicit duplicates policy. |
| UF-176 | Remove one symbol | F/J/T/I watchlist_remove | In-page request only; iliaal cookie extraction excluded. |
| UF-177 | Remove several symbols | F watchlist_remove_bulk | Nonempty target set and membership verification. |
| UF-178 | Export watchlist | F watchlist_export | CSV/JSON or documented text; no browser session data. |
| UF-179 | Import watchlist | F watchlist_import; R tv_watchlist_sync concept | Validate format, bound size and preserve sections deliberately. |
| UF-180 | Rename/reorder/delete list | New integration requirement where known endpoints exist | Do not guess undocumented mutation endpoints. Return unsupported until source-backed and verified. |
| UF-181 | Section/order fidelity | F import/export patterns | Specify how separators, duplicates and order are preserved. |

## Screeners, technical summaries and news
Source modules: [R — src/tools/registry.ts](https://github.com/firyomaefx/tradingview-chrome-mcp/blob/d20f0acf7a2d888ef7fe9304178fae35c233c42c/src/tools/registry.ts); [I — src/tools/screener.js](https://github.com/iliaal/tradingview-mcp/blob/233f29e180031291dacac4c4cc2736a8dde161be/src/tools/screener.js); [I — src/tools/hotlist.js](https://github.com/iliaal/tradingview-mcp/blob/233f29e180031291dacac4c4cc2736a8dde161be/src/tools/hotlist.js); [I — src/tools/news.js](https://github.com/iliaal/tradingview-mcp/blob/233f29e180031291dacac4c4cc2736a8dde161be/src/tools/news.js).

| ID | Feature | Reviewed tool / source basis | Adoption requirement |
| --- | --- | --- | --- |
| UF-182 | TradingView screener scan | I screener_scan; R tv_screener | Fixed TradingView scanner adapter, typed filters and result bounds. |
| UF-183 | Hotlists | I hotlist_get | Use known preset IDs and state market scope. |
| UF-184 | TA summary | R tv_ta_summary concept | Return TradingView fields with timeframe and source; no recommendation. |
| UF-185 | News headlines | I news_get_ticker; R tv_financial_news | Upstream uses external providers; excluded from browser-only runtime. |
| UF-186 | News sentiment | I signal_get_snapshot; R tv_market_sentiment | Heuristic metadata, not TradingView backtest output; excluded cloud/news path. |
| UF-187 | Mock data backend | R TOOL_BACKEND=mock | Useful for offline tests only; results must be labeled fixtures. |

## Screenshots and scoped UI operations
Source modules: [F — src/tools/capture.js](https://github.com/FerroxLabs/tvcontrol/blob/a8d3dfc97621e22b8b7c71e617b134c5e35882ee/src/tools/capture.js); [F — src/tools/vision.js](https://github.com/FerroxLabs/tvcontrol/blob/a8d3dfc97621e22b8b7c71e617b134c5e35882ee/src/tools/vision.js); [J — src/tools/ui.js](https://github.com/JostQQ/tradingview-mcp/blob/4d9b440935d5e8b862ab61a72812adf801684564/src/tools/ui.js); [I — src/tools/ui.js](https://github.com/iliaal/tradingview-mcp/blob/233f29e180031291dacac4c4cc2736a8dde161be/src/tools/ui.js).

| ID | Feature | Reviewed tool / source basis | Adoption requirement |
| --- | --- | --- | --- |
| UF-188 | Chart screenshot | F/T/I capture_screenshot; P/R tv_screenshot | Explicit capture, target-bound, bounded image and safe path. |
| UF-189 | Structured chart vision read | F chart_vision_read | Separate extracted chart/study data from any image interpretation. |
| UF-190 | Find element | F/T/I ui_find_element; J ui_find | Bounded selectors/text; no caller code. |
| UF-191 | Click element | F/T/I ui_click; J ui_click | Scoped TradingView DOM action with clear target. |
| UF-192 | Keyboard action | F/T/I ui_keyboard; J ui_key | Allowlisted keys/modifiers; no browser-address-bar escape. |
| UF-193 | Type text | F/T/I ui_type_text; J ui_type | Only designated form/editor targets; size bounds. |
| UF-194 | Hover and scroll | F/T/I/J ui_hover/ui_scroll | Bound coordinates and selected pane. |
| UF-195 | Coordinate click | F/T/I ui_mouse_click | Explicit fallback with image/target context; avoid blind interactions. |
| UF-196 | Panel open/close | F/T/I ui_open_panel | Named panels rather than arbitrary menu labels. |
| UF-197 | Menu and dialog actions | J ui_menu/ui_dialog_scan/click/dismiss; I ui_dismiss_dialogs | Whitelist dialog actions; do not auto-accept destructive confirmations. |
| UF-198 | Fullscreen | F/T/I ui_fullscreen | Chart UI action, distinct from operating-system window control. |
| UF-199 | Raw evaluation | F/T/C ui_evaluate; J tv_eval | Excluded regardless of availability upstream. |

## Snapshots, exports and research sessions
Source modules: [F — src/tools/state.js](https://github.com/FerroxLabs/tvcontrol/blob/a8d3dfc97621e22b8b7c71e617b134c5e35882ee/src/tools/state.js); [P — src/tools/export.mjs](https://github.com/pbajkovic-hub/tv-cdp-mcp/blob/dd0fd3c07ad10ea6151fc21aeff3791db7cb7219/src/tools/export.mjs); [J — src/core/workspace.js](https://github.com/JostQQ/tradingview-mcp/blob/4d9b440935d5e8b862ab61a72812adf801684564/src/core/workspace.js); [C — src/tools/morning.js](https://github.com/Chefy3x/tradingview-mcp-chefy/blob/abcad6c6a49a89a99f700abacffa2cdb61883fe7/src/tools/morning.js).

| ID | Feature | Reviewed tool / source basis | Adoption requirement |
| --- | --- | --- | --- |
| UF-200 | Named chart snapshot | F state_snapshot | Versioned schema and explicit skipped fields. |
| UF-201 | Restore snapshot | F state_restore | Partial restoration receipt; never represent as an independent clone. |
| UF-202 | List/delete snapshots | F state_list/state_delete | Dedicated directory and safe names. |
| UF-203 | Export bars/study data | P tv_export_data; R tv_chart_data_export | Format, row count, coverage and safe file identity. |
| UF-204 | Export backtest report/trades | J strategy tools write_file | Full ledger vs inline limit clearly separated. |
| UF-205 | Morning brief | C morning_brief | Independent workflow over approved local/TradingView data. |
| UF-206 | Save/read research session | C session_save/session_get | Optional local artifacts with explicit content and redaction. |
| UF-207 | Support/diagnostic artifact | F tv_support_bundle | Independent sanitized schema; never collect environment, cookies or profiles. |

## Explicitly excluded upstream capabilities
Source modules: [F — src/core/update.js](https://github.com/FerroxLabs/tvcontrol/blob/a8d3dfc97621e22b8b7c71e617b134c5e35882ee/src/core/update.js); [R — src/sync/sync-manager.ts](https://github.com/firyomaefx/tradingview-chrome-mcp/blob/d20f0acf7a2d888ef7fe9304178fae35c233c42c/src/sync/sync-manager.ts); [R — src/llm/client.ts](https://github.com/firyomaefx/tradingview-chrome-mcp/blob/d20f0acf7a2d888ef7fe9304178fae35c233c42c/src/llm/client.ts); [P — src/tools/trading.mjs](https://github.com/pbajkovic-hub/tv-cdp-mcp/blob/dd0fd3c07ad10ea6151fc21aeff3791db7cb7219/src/tools/trading.mjs).

| ID | Feature | Reviewed tool / source basis | Adoption requirement |
| --- | --- | --- | --- |
| UF-208 | Desktop process management | F/J/T/I tv_launch and related launchers | Browser-only project does not discover, launch, kill or copy desktop apps. |
| UF-209 | OS watchdog service | F watchdog start/stop | No launchd/systemd/Windows scheduled task installation. |
| UF-210 | Runtime update | F/T tv_update | No git fetch/merge/npm execution through MCP. |
| UF-211 | Arbitrary JavaScript/REPL | ui_evaluate, tv_eval and terminal REPLs | No caller execution escape hatch. |
| UF-212 | Cookie import/export | I removal path; D auth.json/env loader | No raw cookie reading, copying, persisting or forwarding. |
| UF-213 | Cloud sync and telemetry | R sync_status and Supabase modules | No server-owned third-party metadata upload. |
| UF-214 | Embedded LLM provider | R tv_pine_autofix | No direct server OpenAI/Anthropic client or provider credential config. |
| UF-215 | Licensing/hosted SaaS | R licence_status/activate_licence/edition_limits | No edition gate, Supabase login or Redis service dependency. |
| UF-216 | Live or paper broker execution | P tv_place_order/close/cancel/brackets | Excluded unless separately scoped and designed; never required for backtests. |
| UF-217 | Independent fixture simulator | R tv_paper_trade | Do not market as TradingView Strategy Tester. |
| UF-218 | External exchange bridge | P separate examples/alert-to-order-bridge | Not imported or reviewed as part of the new runtime. |

## Source-specific limitations to keep visible
**Ferrox:** no dedicated saved-layout clone. tab_new can reopen the same saved layout; layout_create is blank creation; state_restore is partial. data_get_trades is capped at 20 recent orders. data_get_equity may return only a summary when the full curve is unavailable. Its local telemetry is not a cloud uploader, but desktop launch/update/OS service paths are excluded.
**Jost:** native Strategy Tester extraction is the best reviewed report reference, but exact requested strategy selection must be repaired because a miss can fall back to the first strategy. Preserve wait status; a metric fingerprint cannot prove fresh recalculation. Batch source uses fixed waits and has success-reporting gaps. Per-trade account values are not a continuous equity curve. Claimed Windows live results are the author's observations, not this project's tests.
**pbaj:** strong native Make-a-copy and saved-ID verification, but no Strategy Tester/Pine lifecycle reader. Saved server-side copying does not automatically establish unsaved-edit fidelity. Strict URL validation must replace loose matching. Alert projections can expose webhook/message secrets. The small data reader only exposes loaded bars (a 500-bar cap in its implementation), not unrestricted history.
**firy:** browser/extension concept coverage is broad, but source license provenance is unresolved. The duplicate handler can report a triggered action without a new-ID postcondition; Strategy Tester extraction is a DOM summary rather than a complete report/trade export. The fixture simulator is independent of TradingView. Cloud sync, LLM, licensing, dashboard and bridge code are excluded.
**Original and Chefy:** preserve upstream lineage. Recent orders and summary metrics are not full paired-trade history. Chefy's current source has equity downsampling even though some roadmap prose still describes it as planned; source behavior takes precedence over the roadmap.
**iliaal:** useful pane/drawing/scanner/deep-backtest concepts, but watchlist removal extracts raw cookies. News tools contact third parties. A tool named for a deep-backtest date range does not prove the user's plan supports it.
**daviddme:** useful data-only strategy-alert construction and precise alert selection, but its cookie loader/Node HTTP auth is excluded. New alert creation's active/ignore-warnings defaults must be changed in a separate implementation.

## Exact tool registration appendix
Names below are extracted from source tool registrations or top-level tool definitions at the pinned commits. They are grouped by source file; conditional exposure and backend/edition gates still apply. The table is intentionally exhaustive for the selected registration files, including excluded declarations, so future changes can be traced to their source rather than inferred from marketing counts.

### F — FerroxLabs/tvcontrol (114 declarations)

| Pinned source | Literal tool names |
| --- | --- |
| [src/tools/alerts.js](https://github.com/FerroxLabs/tvcontrol/blob/a8d3dfc97621e22b8b7c71e617b134c5e35882ee/src/tools/alerts.js#L6-L51) | `alert_create`, `alert_create_bulk`, `alert_list`, `alert_delete`, `alert_delete_by_id` |
| [src/tools/batch.js](https://github.com/FerroxLabs/tvcontrol/blob/a8d3dfc97621e22b8b7c71e617b134c5e35882ee/src/tools/batch.js#L6-L6) | `batch_run` |
| [src/tools/capture.js](https://github.com/FerroxLabs/tvcontrol/blob/a8d3dfc97621e22b8b7c71e617b134c5e35882ee/src/tools/capture.js#L6-L6) | `capture_screenshot` |
| [src/tools/chart.js](https://github.com/FerroxLabs/tvcontrol/blob/a8d3dfc97621e22b8b7c71e617b134c5e35882ee/src/tools/chart.js#L7-L71) | `chart_get_state`, `chart_set_symbol`, `chart_set_timeframe`, `chart_set_type`, `chart_manage_indicator`, `chart_get_visible_range`, `chart_set_visible_range`, `chart_scroll_to_date`, `symbol_info`, `symbol_search` |
| [src/tools/data.js](https://github.com/FerroxLabs/tvcontrol/blob/a8d3dfc97621e22b8b7c71e617b134c5e35882ee/src/tools/data.js#L6-L99) | `data_get_ohlcv`, `data_get_indicator`, `data_get_strategy_results`, `data_get_trades`, `data_get_equity`, `quote_get`, `depth_get`, `quote_batch`, `data_get_pine_lines`, `data_get_pine_labels`, `data_get_pine_tables`, `data_get_pine_boxes`, `data_get_study_values` |
| [src/tools/drawing.js](https://github.com/FerroxLabs/tvcontrol/blob/a8d3dfc97621e22b8b7c71e617b134c5e35882ee/src/tools/drawing.js#L6-L34) | `draw_shape`, `draw_list`, `draw_clear`, `draw_remove_one`, `draw_get_properties` |
| [src/tools/health.js — 1](https://github.com/FerroxLabs/tvcontrol/blob/a8d3dfc97621e22b8b7c71e617b134c5e35882ee/src/tools/health.js#L11-L98) | `tv_health_check`, `tv_chart_health`, `tv_repair_chart`, `tv_discover`, `tv_compatibility_check`, `tv_capability_matrix`, `tv_support_bundle`, `tv_compatibility_snapshot`, `tv_watchdog_sample`, `tv_watchdog_start`, `tv_watchdog_stop`, `tv_watchdog_status`, `tv_watchdog_history`, `tv_ui_state` |
| [src/tools/health.js — 2](https://github.com/FerroxLabs/tvcontrol/blob/a8d3dfc97621e22b8b7c71e617b134c5e35882ee/src/tools/health.js#L103-L111) | `tv_launch`, `tv_update` |
| [src/tools/indicators.js](https://github.com/FerroxLabs/tvcontrol/blob/a8d3dfc97621e22b8b7c71e617b134c5e35882ee/src/tools/indicators.js#L6-L38) | `indicator_search`, `indicator_add_from_search`, `indicator_get_inputs`, `indicator_set_inputs`, `indicator_toggle_visibility` |
| [src/tools/pane.js](https://github.com/FerroxLabs/tvcontrol/blob/a8d3dfc97621e22b8b7c71e617b134c5e35882ee/src/tools/pane.js#L6-L25) | `pane_list`, `pane_set_layout`, `pane_focus`, `pane_set_symbol` |
| [src/tools/pine.js](https://github.com/FerroxLabs/tvcontrol/blob/a8d3dfc97621e22b8b7c71e617b134c5e35882ee/src/tools/pine.js#L6-L83) | `pine_get_source`, `pine_set_source`, `pine_compile`, `pine_get_errors`, `pine_save`, `pine_get_console`, `pine_smart_compile`, `pine_new`, `pine_open`, `pine_get_script_source`, `pine_list_scripts`, `pine_analyze`, `pine_check` |
| [src/tools/replay.js](https://github.com/FerroxLabs/tvcontrol/blob/a8d3dfc97621e22b8b7c71e617b134c5e35882ee/src/tools/replay.js#L6-L39) | `replay_start`, `replay_step`, `replay_autoplay`, `replay_stop`, `replay_trade`, `replay_status` |
| [src/tools/state.js](https://github.com/FerroxLabs/tvcontrol/blob/a8d3dfc97621e22b8b7c71e617b134c5e35882ee/src/tools/state.js#L6-L26) | `state_snapshot`, `state_restore`, `state_list`, `state_delete` |
| [src/tools/sweep.js](https://github.com/FerroxLabs/tvcontrol/blob/a8d3dfc97621e22b8b7c71e617b134c5e35882ee/src/tools/sweep.js#L10-L10) | `strategy_sweep` |
| [src/tools/tab.js](https://github.com/FerroxLabs/tvcontrol/blob/a8d3dfc97621e22b8b7c71e617b134c5e35882ee/src/tools/tab.js#L6-L27) | `tab_list`, `tab_new`, `tab_close`, `tab_switch` |
| [src/tools/ui.js — 1](https://github.com/FerroxLabs/tvcontrol/blob/a8d3dfc97621e22b8b7c71e617b134c5e35882ee/src/tools/ui.js#L6-L105) | `ui_click`, `ui_open_panel`, `ui_fullscreen`, `layout_create`, `layout_save`, `layout_list`, `layout_get_active`, `layout_switch`, `ui_keyboard`, `ui_type_text`, `ui_hover`, `ui_scroll`, `ui_mouse_click`, `ui_find_element` |
| [src/tools/ui.js — 2](https://github.com/FerroxLabs/tvcontrol/blob/a8d3dfc97621e22b8b7c71e617b134c5e35882ee/src/tools/ui.js#L122-L122) | `ui_evaluate` |
| [src/tools/vision.js](https://github.com/FerroxLabs/tvcontrol/blob/a8d3dfc97621e22b8b7c71e617b134c5e35882ee/src/tools/vision.js#L11-L11) | `chart_vision_read` |
| [src/tools/watchlist.js](https://github.com/FerroxLabs/tvcontrol/blob/a8d3dfc97621e22b8b7c71e617b134c5e35882ee/src/tools/watchlist.js#L6-L76) | `watchlist_list`, `watchlist_create`, `watchlist_get_by_id`, `watchlist_get`, `watchlist_add`, `watchlist_add_bulk`, `watchlist_remove`, `watchlist_remove_bulk`, `watchlist_export`, `watchlist_import` |

### J — JostQQ/tradingview-mcp (104 declarations)

| Pinned source | Literal tool names |
| --- | --- |
| [src/tools/alerts.js](https://github.com/JostQQ/tradingview-mcp/blob/4d9b440935d5e8b862ab61a72812adf801684564/src/tools/alerts.js#L6-L20) | `alert_create`, `alert_list`, `alert_delete` |
| [src/tools/batch.js](https://github.com/JostQQ/tradingview-mcp/blob/4d9b440935d5e8b862ab61a72812adf801684564/src/tools/batch.js#L6-L6) | `batch_run` |
| [src/tools/chart.js](https://github.com/JostQQ/tradingview-mcp/blob/4d9b440935d5e8b862ab61a72812adf801684564/src/tools/chart.js#L6-L90) | `chart_get_state`, `chart_set_symbol`, `chart_set_timeframe`, `chart_set_type`, `chart_set_session`, `chart_get_visible_range`, `chart_set_visible_range`, `chart_scroll_to_date`, `chart_zoom`, `chart_manage_indicator`, `indicator_get_inputs`, `symbol_info`, `symbol_search` |
| [src/tools/data.js](https://github.com/JostQQ/tradingview-mcp/blob/4d9b440935d5e8b862ab61a72812adf801684564/src/tools/data.js#L7-L91) | `data_get_ohlcv`, `quote_get`, `data_get_indicator`, `data_get_study_values`, `data_get_pine_lines`, `data_get_pine_labels`, `data_get_pine_tables`, `data_get_pine_boxes`, `depth_get`, `data_get_strategy_results`, `data_get_trades`, `data_get_equity` |
| [src/tools/drawing.js](https://github.com/JostQQ/tradingview-mcp/blob/4d9b440935d5e8b862ab61a72812adf801684564/src/tools/drawing.js#L6-L34) | `draw_shape`, `draw_list`, `draw_clear`, `draw_remove_one`, `draw_get_properties` |
| [src/tools/health.js](https://github.com/JostQQ/tradingview-mcp/blob/4d9b440935d5e8b862ab61a72812adf801684564/src/tools/health.js#L7-L31) | `tv_health_check`, `tv_launch`, `tv_discover`, `tv_ui_state`, `tv_eval` |
| [src/tools/indicators.js](https://github.com/JostQQ/tradingview-mcp/blob/4d9b440935d5e8b862ab61a72812adf801684564/src/tools/indicators.js#L6-L30) | `indicator_set_inputs`, `indicator_toggle_visibility`, `indicator_search`, `indicator_add` |
| [src/tools/layouts.js](https://github.com/JostQQ/tradingview-mcp/blob/4d9b440935d5e8b862ab61a72812adf801684564/src/tools/layouts.js#L6-L45) | `layout_list`, `layout_current`, `layout_switch`, `layout_save`, `layout_rename`, `layout_delete`, `layout_create` |
| [src/tools/pane.js](https://github.com/JostQQ/tradingview-mcp/blob/4d9b440935d5e8b862ab61a72812adf801684564/src/tools/pane.js#L6-L25) | `pane_list`, `pane_set_layout`, `pane_focus`, `pane_set_symbol` |
| [src/tools/pine.js — 1](https://github.com/JostQQ/tradingview-mcp/blob/4d9b440935d5e8b862ab61a72812adf801684564/src/tools/pine.js#L6-L90) | `pine_get_source`, `pine_set_source`, `pine_compile`, `pine_get_errors`, `pine_get_console`, `pine_check`, `pine_analyze`, `pine_status`, `pine_new`, `pine_list_scripts`, `pine_open`, `pine_save_new`, `pine_save_next`, `pine_rename` |
| [src/tools/pine.js — 2](https://github.com/JostQQ/tradingview-mcp/blob/4d9b440935d5e8b862ab61a72812adf801684564/src/tools/pine.js#L99-L121) | `pine_delete`, `pine_versions`, `pine_get_version` |
| [src/tools/replay.js](https://github.com/JostQQ/tradingview-mcp/blob/4d9b440935d5e8b862ab61a72812adf801684564/src/tools/replay.js#L6-L37) | `replay_start`, `replay_step`, `replay_autoplay`, `replay_stop`, `replay_trade`, `replay_status` |
| [src/tools/strategy.js](https://github.com/JostQQ/tradingview-mcp/blob/4d9b440935d5e8b862ab61a72812adf801684564/src/tools/strategy.js#L6-L62) | `strategy_list`, `strategy_get_report`, `strategy_get_trades`, `strategy_get_equity`, `strategy_get_inputs`, `strategy_set_inputs`, `strategy_wait`, `strategy_scan` |
| [src/tools/tab.js](https://github.com/JostQQ/tradingview-mcp/blob/4d9b440935d5e8b862ab61a72812adf801684564/src/tools/tab.js#L6-L31) | `tab_list`, `tab_new`, `layout_new`, `tab_close`, `tab_switch` |
| [src/tools/ui.js](https://github.com/JostQQ/tradingview-mcp/blob/4d9b440935d5e8b862ab61a72812adf801684564/src/tools/ui.js#L6-L88) | `ui_find`, `ui_click`, `ui_type`, `ui_key`, `ui_hover`, `ui_scroll`, `ui_menu`, `ui_dialog_scan`, `ui_dialog_click`, `ui_dialog_dismiss` |
| [src/tools/watchlist.js](https://github.com/JostQQ/tradingview-mcp/blob/4d9b440935d5e8b862ab61a72812adf801684564/src/tools/watchlist.js#L6-L34) | `watchlist_get`, `watchlist_add`, `watchlist_add_bulk`, `watchlist_remove` |

### P — pbajkovic-hub/tv-cdp-mcp (29 declarations)

| Pinned source | Literal tool names |
| --- | --- |
| [src/tools/alerts.mjs](https://github.com/pbajkovic-hub/tv-cdp-mcp/blob/dd0fd3c07ad10ea6151fc21aeff3791db7cb7219/src/tools/alerts.mjs#L737-L888) | `tv_list_alerts`, `tv_get_alert`, `tv_set_alert_condition`, `tv_pause_alerts`, `tv_resume_alerts`, `tv_create_alert`, `tv_delete_alerts` |
| [src/tools/chart.mjs](https://github.com/pbajkovic-hub/tv-cdp-mcp/blob/dd0fd3c07ad10ea6151fc21aeff3791db7cb7219/src/tools/chart.mjs#L135-L327) | `tv_list_layouts`, `tv_get_chart_state`, `tv_set_symbol`, `tv_set_resolution`, `tv_screenshot` |
| [src/tools/data.mjs](https://github.com/pbajkovic-hub/tv-cdp-mcp/blob/dd0fd3c07ad10ea6151fc21aeff3791db7cb7219/src/tools/data.mjs#L153-L179) | `tv_get_bars`, `tv_get_study_values` |
| [src/tools/export.mjs](https://github.com/pbajkovic-hub/tv-cdp-mcp/blob/dd0fd3c07ad10ea6151fc21aeff3791db7cb7219/src/tools/export.mjs#L153-L153) | `tv_export_data` |
| [src/tools/layouts.mjs](https://github.com/pbajkovic-hub/tv-cdp-mcp/blob/dd0fd3c07ad10ea6151fc21aeff3791db7cb7219/src/tools/layouts.mjs#L251-L436) | `tv_list_saved_layouts`, `tv_open_chart_url`, `tv_copy_layout`, `tv_rename_layout`, `tv_delete_layout` |
| [src/tools/studies.mjs](https://github.com/pbajkovic-hub/tv-cdp-mcp/blob/dd0fd3c07ad10ea6151fc21aeff3791db7cb7219/src/tools/studies.mjs#L281-L326) | `tv_list_studies`, `tv_get_study_inputs`, `tv_set_study_inputs` |
| [src/tools/templates.mjs](https://github.com/pbajkovic-hub/tv-cdp-mcp/blob/dd0fd3c07ad10ea6151fc21aeff3791db7cb7219/src/tools/templates.mjs#L245-L245) | `tv_study_template` |
| [src/tools/trading.mjs](https://github.com/pbajkovic-hub/tv-cdp-mcp/blob/dd0fd3c07ad10ea6151fc21aeff3791db7cb7219/src/tools/trading.mjs#L462-L562) | `tv_trading_status`, `tv_place_order`, `tv_close_position`, `tv_cancel_order`, `tv_set_position_brackets` |

### R — firyomaefx/tradingview-chrome-mcp (65 declarations)

| Pinned source | Literal tool names |
| --- | --- |
| [src/tools/registry.ts — 1](https://github.com/firyomaefx/tradingview-chrome-mcp/blob/d20f0acf7a2d888ef7fe9304178fae35c233c42c/src/tools/registry.ts#L183-L373) | `ping`, `mcp_client_info`, `emergency_stop`, `emergency_clear`, `browser_status`, `browser_list_tabs`, `tv_status`, `tv_read_chart`, `tv_get_ohlcv`, `tv_screenshot`, `tv_open_pine_editor`, `tv_read_pine_source`, `tv_pine_create`, `tv_pine_patch` |
| [src/tools/registry.ts — 2](https://github.com/firyomaefx/tradingview-chrome-mcp/blob/d20f0acf7a2d888ef7fe9304178fae35c233c42c/src/tools/registry.ts#L390-L645) | `tv_pine_compile_errors`, `tv_pine_save`, `tv_pine_add_to_chart`, `tv_rename_script`, `tv_change_symbol`, `tv_change_timeframe`, `tv_read_strategy_tester`, `tv_backtest_compare`, `tv_dismiss_dialogs`, `tv_layout_list`, `tv_layout_switch`, `tv_alert_create`, `tv_alert_list`, `tv_alert_delete` |
| [src/tools/registry.ts — 3](https://github.com/firyomaefx/tradingview-chrome-mcp/blob/d20f0acf7a2d888ef7fe9304178fae35c233c42c/src/tools/registry.ts#L662-L878) | `tv_watchlist_read`, `tv_watchlist_add_symbol`, `tv_watchlist_sync`, `tv_chart_metadata`, `tv_ensure_chart`, `tv_chart_data_export`, `tv_drawing_add_trendline`, `tv_drawing_add_horizontal_line`, `tv_drawing_add_rectangle`, `tv_drawing_add_fib_retracement`, `tv_layout_save`, `tv_layout_duplicate`, `tv_layout_rename`, `tv_layout_reset` |
| [src/tools/registry.ts — 4](https://github.com/firyomaefx/tradingview-chrome-mcp/blob/d20f0acf7a2d888ef7fe9304178fae35c233c42c/src/tools/registry.ts#L892-L1138) | `tv_layout_export`, `tv_indicator_add`, `tv_indicator_remove`, `tv_indicator_hide`, `tv_indicator_show`, `tv_indicator_settings`, `tv_chart_verify`, `tv_pine_backup`, `tv_pine_list_backups`, `tv_pine_restore`, `tv_pine_quick_fix`, `tv_pine_autofix`, `licence_status`, `activate_licence` |
| [src/tools/registry.ts — 5](https://github.com/firyomaefx/tradingview-chrome-mcp/blob/d20f0acf7a2d888ef7fe9304178fae35c233c42c/src/tools/registry.ts#L1152-L1334) | `edition_limits`, `audit_verify`, `sync_status`, `tv_search_symbols`, `tv_screener`, `tv_ta_summary`, `tv_market_sentiment`, `tv_financial_news`, `tv_paper_trade` |

### T — tradesdontlie/tradingview-mcp (84 declarations)

| Pinned source | Literal tool names |
| --- | --- |
| [src/tools/alerts.js](https://github.com/tradesdontlie/tradingview-mcp/blob/c05b8f5755ed8e64ea242de88ddbf46aa24d56a4/src/tools/alerts.js#L6-L20) | `alert_create`, `alert_list`, `alert_delete` |
| [src/tools/batch.js](https://github.com/tradesdontlie/tradingview-mcp/blob/c05b8f5755ed8e64ea242de88ddbf46aa24d56a4/src/tools/batch.js#L6-L6) | `batch_run` |
| [src/tools/capture.js](https://github.com/tradesdontlie/tradingview-mcp/blob/c05b8f5755ed8e64ea242de88ddbf46aa24d56a4/src/tools/capture.js#L6-L6) | `capture_screenshot` |
| [src/tools/chart.js](https://github.com/tradesdontlie/tradingview-mcp/blob/c05b8f5755ed8e64ea242de88ddbf46aa24d56a4/src/tools/chart.js#L6-L69) | `chart_get_state`, `chart_set_symbol`, `chart_set_timeframe`, `chart_set_type`, `chart_manage_indicator`, `chart_get_visible_range`, `chart_set_visible_range`, `chart_scroll_to_date`, `symbol_info`, `symbol_search` |
| [src/tools/data.js](https://github.com/tradesdontlie/tradingview-mcp/blob/c05b8f5755ed8e64ea242de88ddbf46aa24d56a4/src/tools/data.js#L6-L82) | `data_get_ohlcv`, `data_get_indicator`, `data_get_strategy_results`, `data_get_trades`, `data_get_equity`, `quote_get`, `depth_get`, `data_get_pine_lines`, `data_get_pine_labels`, `data_get_pine_tables`, `data_get_pine_boxes`, `data_get_study_values` |
| [src/tools/drawing.js](https://github.com/tradesdontlie/tradingview-mcp/blob/c05b8f5755ed8e64ea242de88ddbf46aa24d56a4/src/tools/drawing.js#L6-L34) | `draw_shape`, `draw_list`, `draw_clear`, `draw_remove_one`, `draw_get_properties` |
| [src/tools/health.js](https://github.com/tradesdontlie/tradingview-mcp/blob/c05b8f5755ed8e64ea242de88ddbf46aa24d56a4/src/tools/health.js#L7-L30) | `tv_health_check`, `tv_discover`, `tv_ui_state`, `tv_launch`, `tv_update` |
| [src/tools/indicators.js](https://github.com/tradesdontlie/tradingview-mcp/blob/c05b8f5755ed8e64ea242de88ddbf46aa24d56a4/src/tools/indicators.js#L6-L30) | `indicator_set_inputs`, `indicator_toggle_visibility`, `indicator_search`, `indicator_add` |
| [src/tools/pane.js](https://github.com/tradesdontlie/tradingview-mcp/blob/c05b8f5755ed8e64ea242de88ddbf46aa24d56a4/src/tools/pane.js#L6-L25) | `pane_list`, `pane_set_layout`, `pane_focus`, `pane_set_symbol` |
| [src/tools/pine.js](https://github.com/tradesdontlie/tradingview-mcp/blob/c05b8f5755ed8e64ea242de88ddbf46aa24d56a4/src/tools/pine.js#L6-L69) | `pine_get_source`, `pine_set_source`, `pine_compile`, `pine_get_errors`, `pine_save`, `pine_get_console`, `pine_smart_compile`, `pine_new`, `pine_open`, `pine_list_scripts`, `pine_analyze`, `pine_check` |
| [src/tools/replay.js](https://github.com/tradesdontlie/tradingview-mcp/blob/c05b8f5755ed8e64ea242de88ddbf46aa24d56a4/src/tools/replay.js#L6-L37) | `replay_start`, `replay_step`, `replay_autoplay`, `replay_stop`, `replay_trade`, `replay_status` |
| [src/tools/tab.js](https://github.com/tradesdontlie/tradingview-mcp/blob/c05b8f5755ed8e64ea242de88ddbf46aa24d56a4/src/tools/tab.js#L6-L31) | `tab_list`, `tab_new`, `layout_new`, `tab_close`, `tab_switch` |
| [src/tools/ui.js](https://github.com/tradesdontlie/tradingview-mcp/blob/c05b8f5755ed8e64ea242de88ddbf46aa24d56a4/src/tools/ui.js#L6-L88) | `ui_click`, `ui_open_panel`, `ui_fullscreen`, `layout_list`, `layout_switch`, `ui_keyboard`, `ui_type_text`, `ui_hover`, `ui_scroll`, `ui_mouse_click`, `ui_find_element`, `ui_evaluate` |
| [src/tools/watchlist.js](https://github.com/tradesdontlie/tradingview-mcp/blob/c05b8f5755ed8e64ea242de88ddbf46aa24d56a4/src/tools/watchlist.js#L6-L34) | `watchlist_get`, `watchlist_add`, `watchlist_add_bulk`, `watchlist_remove` |

### C — Chefy3x/tradingview-mcp-chefy (83 declarations)

| Pinned source | Literal tool names |
| --- | --- |
| [src/tools/alerts.js](https://github.com/Chefy3x/tradingview-mcp-chefy/blob/abcad6c6a49a89a99f700abacffa2cdb61883fe7/src/tools/alerts.js#L6-L20) | `alert_create`, `alert_list`, `alert_delete` |
| [src/tools/batch.js](https://github.com/Chefy3x/tradingview-mcp-chefy/blob/abcad6c6a49a89a99f700abacffa2cdb61883fe7/src/tools/batch.js#L6-L6) | `batch_run` |
| [src/tools/capture.js](https://github.com/Chefy3x/tradingview-mcp-chefy/blob/abcad6c6a49a89a99f700abacffa2cdb61883fe7/src/tools/capture.js#L6-L6) | `capture_screenshot` |
| [src/tools/chart.js](https://github.com/Chefy3x/tradingview-mcp-chefy/blob/abcad6c6a49a89a99f700abacffa2cdb61883fe7/src/tools/chart.js#L6-L67) | `chart_get_state`, `chart_set_symbol`, `chart_set_timeframe`, `chart_set_type`, `chart_manage_indicator`, `chart_get_visible_range`, `chart_set_visible_range`, `chart_scroll_to_date`, `symbol_info`, `symbol_search` |
| [src/tools/data.js](https://github.com/Chefy3x/tradingview-mcp-chefy/blob/abcad6c6a49a89a99f700abacffa2cdb61883fe7/src/tools/data.js#L6-L87) | `data_get_ohlcv`, `data_get_indicator`, `data_get_strategy_results`, `data_get_trades`, `data_get_equity`, `quote_get`, `depth_get`, `data_get_pine_lines`, `data_get_pine_labels`, `data_get_pine_tables`, `data_get_pine_boxes`, `data_get_study_values` |
| [src/tools/drawing.js](https://github.com/Chefy3x/tradingview-mcp-chefy/blob/abcad6c6a49a89a99f700abacffa2cdb61883fe7/src/tools/drawing.js#L6-L34) | `draw_shape`, `draw_list`, `draw_clear`, `draw_remove_one`, `draw_get_properties` |
| [src/tools/health.js](https://github.com/Chefy3x/tradingview-mcp-chefy/blob/abcad6c6a49a89a99f700abacffa2cdb61883fe7/src/tools/health.js#L6-L21) | `tv_health_check`, `tv_discover`, `tv_ui_state`, `tv_launch` |
| [src/tools/indicators.js](https://github.com/Chefy3x/tradingview-mcp-chefy/blob/abcad6c6a49a89a99f700abacffa2cdb61883fe7/src/tools/indicators.js#L6-L14) | `indicator_set_inputs`, `indicator_toggle_visibility` |
| [src/tools/morning.js](https://github.com/Chefy3x/tradingview-mcp-chefy/blob/abcad6c6a49a89a99f700abacffa2cdb61883fe7/src/tools/morning.js#L6-L49) | `morning_brief`, `session_save`, `session_get` |
| [src/tools/pane.js](https://github.com/Chefy3x/tradingview-mcp-chefy/blob/abcad6c6a49a89a99f700abacffa2cdb61883fe7/src/tools/pane.js#L6-L25) | `pane_list`, `pane_set_layout`, `pane_focus`, `pane_set_symbol` |
| [src/tools/pine.js](https://github.com/Chefy3x/tradingview-mcp-chefy/blob/abcad6c6a49a89a99f700abacffa2cdb61883fe7/src/tools/pine.js#L6-L83) | `pine_get_source`, `pine_set_source`, `pine_compile`, `pine_get_errors`, `pine_save`, `pine_save_as`, `pine_get_console`, `pine_console_errors`, `pine_smart_compile`, `pine_new`, `pine_open`, `pine_list_scripts`, `pine_analyze`, `pine_check` |
| [src/tools/replay.js](https://github.com/Chefy3x/tradingview-mcp-chefy/blob/abcad6c6a49a89a99f700abacffa2cdb61883fe7/src/tools/replay.js#L6-L37) | `replay_start`, `replay_step`, `replay_autoplay`, `replay_stop`, `replay_trade`, `replay_status` |
| [src/tools/tab.js](https://github.com/Chefy3x/tradingview-mcp-chefy/blob/abcad6c6a49a89a99f700abacffa2cdb61883fe7/src/tools/tab.js#L6-L21) | `tab_list`, `tab_new`, `tab_close`, `tab_switch` |
| [src/tools/ui.js](https://github.com/Chefy3x/tradingview-mcp-chefy/blob/abcad6c6a49a89a99f700abacffa2cdb61883fe7/src/tools/ui.js#L6-L88) | `ui_click`, `ui_open_panel`, `ui_fullscreen`, `layout_list`, `layout_switch`, `ui_keyboard`, `ui_type_text`, `ui_hover`, `ui_scroll`, `ui_mouse_click`, `ui_find_element`, `ui_evaluate` |
| [src/tools/watchlist.js](https://github.com/Chefy3x/tradingview-mcp-chefy/blob/abcad6c6a49a89a99f700abacffa2cdb61883fe7/src/tools/watchlist.js#L6-L11) | `watchlist_get`, `watchlist_add` |

### I — iliaal/tradingview-mcp (111 declarations)

| Pinned source | Literal tool names |
| --- | --- |
| [src/tools/alerts.js](https://github.com/iliaal/tradingview-mcp/blob/233f29e180031291dacac4c4cc2736a8dde161be/src/tools/alerts.js#L7-L39) | `alert_create`, `alert_list`, `alert_delete`, `alert_create_indicator` |
| [src/tools/batch.js](https://github.com/iliaal/tradingview-mcp/blob/233f29e180031291dacac4c4cc2736a8dde161be/src/tools/batch.js#L6-L6) | `batch_run` |
| [src/tools/capture.js](https://github.com/iliaal/tradingview-mcp/blob/233f29e180031291dacac4c4cc2736a8dde161be/src/tools/capture.js#L7-L7) | `capture_screenshot` |
| [src/tools/chart.js](https://github.com/iliaal/tradingview-mcp/blob/233f29e180031291dacac4c4cc2736a8dde161be/src/tools/chart.js#L7-L80) | `chart_get_state`, `chart_set_symbol`, `chart_set_timeframe`, `chart_set_type`, `chart_manage_indicator`, `chart_remove_studies_by_title`, `chart_get_visible_range`, `chart_set_visible_range`, `chart_scroll_to_date`, `symbol_info`, `symbol_search` |
| [src/tools/data.js — 1](https://github.com/iliaal/tradingview-mcp/blob/233f29e180031291dacac4c4cc2736a8dde161be/src/tools/data.js#L7-L105) | `data_get_ohlcv`, `data_get_indicator`, `data_get_strategy_results`, `data_get_trades`, `data_get_strategy_info`, `data_get_equity`, `quote_get`, `depth_get`, `data_get_pine_lines`, `data_get_pine_labels`, `data_get_pine_tables`, `data_get_pine_boxes`, `data_get_pine_shapes`, `data_get_study_values` |
| [src/tools/data.js — 2](https://github.com/iliaal/tradingview-mcp/blob/233f29e180031291dacac4c4cc2736a8dde161be/src/tools/data.js#L112-L121) | `data_get_multi_timeframe`, `data_detect_candlestick_patterns` |
| [src/tools/drawing.js](https://github.com/iliaal/tradingview-mcp/blob/233f29e180031291dacac4c4cc2736a8dde161be/src/tools/drawing.js#L6-L80) | `draw_shape`, `draw_list`, `draw_clear`, `draw_remove_one`, `draw_get_properties`, `draw_position`, `draw_move`, `draw_set_properties`, `draw_set_visible` |
| [src/tools/health.js](https://github.com/iliaal/tradingview-mcp/blob/233f29e180031291dacac4c4cc2736a8dde161be/src/tools/health.js#L7-L36) | `tv_health_check`, `tv_discover`, `tv_ui_state`, `tv_launch`, `tv_ensure`, `tv_reconnect` |
| [src/tools/hotlist.js](https://github.com/iliaal/tradingview-mcp/blob/233f29e180031291dacac4c4cc2736a8dde161be/src/tools/hotlist.js#L6-L6) | `hotlist_get` |
| [src/tools/indicators.js](https://github.com/iliaal/tradingview-mcp/blob/233f29e180031291dacac4c4cc2736a8dde161be/src/tools/indicators.js#L7-L15) | `indicator_set_inputs`, `indicator_toggle_visibility` |
| [src/tools/news.js](https://github.com/iliaal/tradingview-mcp/blob/233f29e180031291dacac4c4cc2736a8dde161be/src/tools/news.js#L6-L19) | `news_get_ticker`, `signal_get_snapshot` |
| [src/tools/pane.js](https://github.com/iliaal/tradingview-mcp/blob/233f29e180031291dacac4c4cc2736a8dde161be/src/tools/pane.js#L8-L43) | `pane_list`, `pane_set_layout`, `pane_focus`, `pane_set_symbol`, `pane_set_timeframe`, `pane_read_batch` |
| [src/tools/pine-deploy.js](https://github.com/iliaal/tradingview-mcp/blob/233f29e180031291dacac4c4cc2736a8dde161be/src/tools/pine-deploy.js#L6-L6) | `pine_deploy` |
| [src/tools/pine-publish.js](https://github.com/iliaal/tradingview-mcp/blob/233f29e180031291dacac4c4cc2736a8dde161be/src/tools/pine-publish.js#L5-L5) | `pine_publish_dialog_inspect` |
| [src/tools/pine.js — 1](https://github.com/iliaal/tradingview-mcp/blob/233f29e180031291dacac4c4cc2736a8dde161be/src/tools/pine.js#L7-L84) | `pine_get_source`, `pine_set_source`, `pine_compile`, `pine_get_errors`, `pine_save`, `pine_get_console`, `pine_smart_compile`, `pine_new`, `pine_open`, `pine_list_scripts`, `pine_analyze`, `pine_check`, `pine_switch_script`, `pine_save_as` |
| [src/tools/pine.js — 2](https://github.com/iliaal/tradingview-mcp/blob/233f29e180031291dacac4c4cc2736a8dde161be/src/tools/pine.js#L92-L104) | `pine_rename`, `pine_version_history`, `pine_delete` |
| [src/tools/replay.js](https://github.com/iliaal/tradingview-mcp/blob/233f29e180031291dacac4c4cc2736a8dde161be/src/tools/replay.js#L7-L46) | `replay_start`, `replay_step`, `replay_autoplay`, `replay_stop`, `replay_set_resolution`, `replay_trade`, `replay_status` |
| [src/tools/screener.js](https://github.com/iliaal/tradingview-mcp/blob/233f29e180031291dacac4c4cc2736a8dde161be/src/tools/screener.js#L6-L6) | `screener_scan` |
| [src/tools/strategy.js](https://github.com/iliaal/tradingview-mcp/blob/233f29e180031291dacac4c4cc2736a8dde161be/src/tools/strategy.js#L6-L6) | `strategy_set_deep_bt_range` |
| [src/tools/tab.js](https://github.com/iliaal/tradingview-mcp/blob/233f29e180031291dacac4c4cc2736a8dde161be/src/tools/tab.js#L7-L59) | `tab_list`, `tab_new`, `tab_close`, `tab_switch`, `tab_switch_by_name`, `tab_pin`, `tab_unpin`, `tab_registry` |
| [src/tools/ui.js](https://github.com/iliaal/tradingview-mcp/blob/233f29e180031291dacac4c4cc2736a8dde161be/src/tools/ui.js#L8-L89) | `ui_dismiss_dialogs`, `ui_click`, `ui_open_panel`, `ui_fullscreen`, `layout_list`, `layout_switch`, `ui_keyboard`, `ui_type_text`, `ui_hover`, `ui_scroll`, `ui_mouse_click`, `ui_find_element` |
| [src/tools/watchlist.js](https://github.com/iliaal/tradingview-mcp/blob/233f29e180031291dacac4c4cc2736a8dde161be/src/tools/watchlist.js#L6-L42) | `watchlist_get`, `watchlist_add`, `watchlist_remove`, `watchlist_add_bulk` |

### D — daviddme/tradingview-alerts-mcp-server (9 declarations)

| Pinned source | Literal tool names |
| --- | --- |
| [src/server.js](https://github.com/daviddme/tradingview-alerts-mcp-server/blob/5a61aa352c97403477052aead3a3dcab627c2dd0/src/server.js#L61-L171) | `list_alerts`, `create_strategy_alert`, `pause_alerts`, `resume_alerts`, `delete_alerts`, `list_saved_strategies`, `list_alert_fires`, `resolve_symbol`, `check_auth` |

## Evidence and adoption rule
Prefer the strongest verified semantic implementation, not the largest advertised tool count. Native copy should establish an independent saved ID. Reports should identify their source and freshness. Every operation should be attributable to a requested chart/strategy and should expose partial or unsupported states honestly. Security exclusions are recorded in [UPSTREAM_SECURITY_REVIEW.md](UPSTREAM_SECURITY_REVIEW.md); exact revisions, license status and reuse decisions are in [UPSTREAMS.json](UPSTREAMS.json).



---

# Appendix B — Complete developer prompt

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


---

# Appendix C — Implemented tools generated from source

# Implemented tool inventory

Generated from the actual registered tool descriptors. Every entry has an implementation; no placeholder tools are registered. Browser capabilities remain subject to live compatibility and account entitlements. All `live_verified` labels are false until the operator performs the acceptance procedure.

Generic UI mutation tools are available only with `TV_ENABLE_GENERIC_UI=1`. Read-only mode hides all tools marked as changes.

| Tool | Changes state | Layout guard | Description |
|---|---|---|---|
| `alert_clone` | Yes | Required | Make one native alert clone and verify its independent ID and copied configuration. Keeps the native clone name and requests paused state. |
| `alert_create` | Yes | Required | Create a native alert directly, without requiring a template. Supports price thresholds, attached Pine strategy order fills and discovered indicator alertconditions. Durable idempotency plus independent configuration verification; defaults to requesting paused state. |
| `alert_create_bulk` | Yes | Required | Preflight all requested native alert definitions, then create sequentially with per-item idempotency and an explicit partial-progress report. |
| `alert_delete` | Yes | Required | Permanently delete explicit alert IDs only after resolving them, then confirm those exact IDs disappeared. |
| `alert_fires` | No | — | Page through server-returned firing history using offset/limit. Filters apply before pagination. A fire record does not prove a webhook endpoint received a request. |
| `alert_get` | No | — | Read one alert from the server and native detail model. Unknown webhook or condition fields remain unknown, never fabricated. |
| `alert_list` | No | — | Page through the complete server-returned alert inventory by stable ID with redacted summaries. Filters apply before offset/limit. Continue with next_offset until has_more=false; no 500-alert total cap. |
| `alert_pause` | Yes | Required | Pause explicit alert IDs and independently poll their eventual server state. |
| `alert_prepare` | No | — | Build and validate a native price, strategy or indicator alert from current chart state without creating it. Returns hashes and inspectable routing metadata. |
| `alert_reconcile` | No | — | Read-only comparison of multiple desired alert definitions against their exact server IDs; no automatic deletion, recreation or webhook tests. |
| `alert_resume` | Yes | Required | Resume explicit alert IDs and independently poll their eventual server state. Does not claim a trigger or delivery occurred. |
| `alert_sources` | No | — | Discover exact attached Pine study IDs, versions, input metadata and available alertcondition IDs. Does not guess plot indices. |
| `alert_update` | Yes | Required | Update name, message, webhook or notifications through the native alert model. Refuses to re-arm a paused alert unless explicitly allowed; reports every unverified field. |
| `alert_validate_message` | No | — | Validate exact alert-message bytes and JSON template structure without substituting TradingView placeholders or sending a request. |
| `alert_verify` | No | — | Compare the independent stored alert with a desired native definition, including exact webhook URL, exact message bytes, conditions, symbol, timeframe and activation. |
| `audit_recent` | No | — | Read local operation metadata logs. Arguments, JSON bodies, cookies and webhook URLs are not logged. |
| `batch_execute` | Yes | Required | Execute up to 100 tool calls sequentially in one browser queue slot. Reports per-step results, stops on failure by default, and never marks partial success as complete. |
| `browser_activate_tab` | Yes | Required | Bring this exact TradingView chart tab to the foreground. |
| `browser_capabilities` | No | — | Probe known native browser interfaces and report actual availability separately from live validation and account entitlements. |
| `browser_close_tab` | Yes | Required | Close this exact TradingView tab and verify the target disappeared. Save work first. |
| `browser_list_tabs` | No | — | List only eligible TradingView Superchart browser targets. Never lists unrelated tabs or reads browser cookies. |
| `browser_navigate` | Yes | Required | Navigate this exact chart tab to a saved TradingView chart URL and verify the destination widget ID. Refuses navigation away from an observed dirty chart. |
| `browser_open_tab` | Yes | — | Open an HTTPS TradingView chart URL in the dedicated Chrome session. Returns the new exact target ID; opening a saved URL does not create an independent layout. |
| `browser_screenshot` | No | — | Capture the current TradingView tab as a PNG image. May contain chart/account information; images are returned to the caller and are not uploaded to an external service. |
| `chart_get_session` | No | — | Read the native trading-session ID and any symbol-advertised sessions such as regular and extended. |
| `chart_get_state` | No | — | Read the selected chart, saved layout ID and all registered study IDs. |
| `chart_get_visible_range` | No | — | Read visible time range in Unix seconds. |
| `chart_get_zoom` | No | — | Read the visible logical bar-index range, time range and bars per screen. |
| `chart_health` | No | — | Read chart capabilities, bar availability and unaddressable studies without repair mutations. |
| `chart_scroll_to_date` | Yes | Required | Centre the existing visible span on a Unix-second timestamp and verify it is visible. |
| `chart_set_session` | Yes | Required | Set an advertised native trading session, verify exact session and resolved symbol, and refuse during replay. |
| `chart_set_symbol` | Yes | Required | Set a full exchange:symbol and verify both the chart label and resolved main-series instrument identity. |
| `chart_set_timeframe` | Yes | Required | Set timeframe and verify readback; refuses during replay. |
| `chart_set_type` | Yes | Required | Set TradingView chart type numeric ID and verify readback. |
| `chart_set_visible_range` | Yes | Required | Set visible Unix-second time range and verify within the stated tolerance. |
| `chart_symbol_info` | No | — | Read symbol metadata for the selected chart. |
| `chart_symbol_search` | No | — | Search symbols through TradingView’s native browser API; no external lookup service. |
| `chart_wait_ready` | No | — | Wait for the intended symbol/timeframe and loaded bars; does not assert strategy freshness. |
| `chart_zoom` | Yes | Required | Zoom one native step in/out or to a bounded count of loaded bars, then verify actual range movement or requested bar endpoints. |
| `data_export_ohlcv` | No | — | Export all currently loaded bars into a confined JSON or CSV file; fail if the loaded range or selected market changes during pagination. |
| `data_get_last_bar` | No | — | Read the latest loaded candle; this is not a bid/ask quote. |
| `data_get_ohlcv` | No | — | Read paginated loaded OHLCV history with explicit units and coverage; no fixed 500-bar ceiling. |
| `data_get_pine_boxes` | No | — | Read Pine box primitives without confusing them with manual chart drawings. |
| `data_get_pine_labels` | No | — | Read Pine-generated label text, prices and native coordinates. |
| `data_get_pine_lines` | No | — | Read Pine-generated line primitives with per-study pagination. |
| `data_get_pine_tables` | No | — | Read Pine table cells preserving original row/column coordinates and blanks. |
| `data_get_study_values` | No | — | Read current Data Window values for all studies or one exact entity. |
| `drawing_clear` | Yes | Required | Remove only the complete set of drawing IDs supplied after inspection. Refuses if the live set has changed. |
| `drawing_create` | Yes | Required | Create a native drawing and verify a new entity ID and actual shape type. Reports coordinate/property fidelity instead of assuming it. |
| `drawing_export` | No | — | Export every available drawing point and property to local JSON. Marks missing fields; does not advertise perfect restoration. |
| `drawing_get` | No | — | Read all available points, properties, visibility, lock and selection state. Includes a preimage fingerprint and any unavailable fields. |
| `drawing_import` | Yes | Required | Create a bounded list of drawings with per-item identity verification. Stops at the first failure and returns created IDs; no claim of atomic rollback. |
| `drawing_list` | No | — | List native chart drawings with exact entity IDs and actual shape names. |
| `drawing_remove` | Yes | Required | Remove an exact drawing and verify absence; optionally guard its preimage fingerprint. |
| `drawing_update` | Yes | Required | Update a drawing only if its fingerprint still matches, then independently verify every requested property or point. |
| `emergency_clear` | Yes | — | Clear emergency stop. This does not retry or undo any previously submitted operation. |
| `emergency_status` | No | — | Read emergency-stop state. |
| `emergency_stop` | Yes | — | Stop accepting operations and cancel active browser workflows. Already submitted TradingView writes cannot be undone; reconcile them after clearing. |
| `hotlist_get` | No | — | Read a fixed US TradingView public hotlist preset with up to 20 rows. Uses only the credential-free scanner preset endpoint. |
| `indicator_add` | Yes | Required | Create a study, await its promise, and verify a new registered entity ID. |
| `indicator_get_inputs` | No | — | Read all input IDs, values and available display names for one exact study. |
| `indicator_list` | No | — | List every study on the selected pane with exact entity IDs. |
| `indicator_remove` | Yes | Required | Remove exactly one entity and verify its absence. |
| `indicator_set_inputs` | Yes | Required | Validate every input ID before changing anything; set and verify exact values. |
| `indicator_set_visibility` | Yes | Required | Set an explicit visibility target and verify it; never blindly toggle. |
| `job_cancel` | Yes | — | Request cancellation of an in-process job. Does not undo a TradingView write already submitted. |
| `job_get` | No | — | Read a submitted job and each independently returned step result. A cancelled step may already have submitted a write; reconcile it. |
| `job_list` | No | — | List in-process jobs and completion states without returning their input arguments. |
| `job_submit` | Yes | — | Start a bounded background sequence of fully specified tool calls. Arguments stay in process memory; no cookie, webhook, Pine or secret payload is written to a job database. Jobs do not resume automatically after restart. |
| `layout_copy` | Yes | Required | Native Make a copy with a unique name, new saved-ID verification, chart comparison and a durable idempotency key. Returns the destination browser target for subsequent operations. |
| `layout_create` | Yes | Required | Create a blank saved layout, open it in a browser tab and save its name only after verifying the new widget ID. |
| `layout_delete` | Yes | Required | Delete one saved layout by exact ID and verify it disappeared. Refuses the layout currently bound to this tool. |
| `layout_get` | No | — | Read the actual widget layout ID, name, dirty state, symbol and resolution. |
| `layout_list` | No | — | List saved layouts with stable IDs, symbols, resolutions and modification times. |
| `layout_open` | Yes | Required | Open an exact saved TradingView layout ID in a new browser tab and verify the widget loaded that ID. |
| `layout_rename` | Yes | Required | Rename the exact current saved layout and confirm the same ID has the new name. |
| `layout_save` | Yes | Required | Save the current layout in place, optionally renaming it. This is not a duplicate operation. |
| `layout_snapshot` | No | — | Export a bounded chart configuration snapshot. Reports properties and drawings that could not be captured; never claims complete restoration. |
| `market_depth` | No | — | Read an already visible depth panel without opening trading controls. Requires explicit bid/ask row labels and unambiguous numeric values; never guesses sides by row position. |
| `market_signal_snapshot` | No | — | Combine the current loaded candle with native Data Window study values. Reports partial collection and context changes; does not call outside news or sentiment providers. |
| `market_technical_summary` | No | — | Read TradingView scanner recommendation scores, RSI and MACD fields for specified symbols/timeframes. These are service-provided values, not locally simulated signals or backtest results. |
| `pane_focus` | Yes | Required | Focus a pane by index and verify active widget reference identity before dependent operations. |
| `pane_get_sync` | No | — | Read native symbol, timeframe, crosshair, time and date-range synchronization controls when available. |
| `pane_layout_options` | No | — | List known native layout codes and expected displayed chart counts; actual account entitlement is checked on application. |
| `pane_list` | No | — | Read all retained chart widgets, displayed pane geometry, exact active pane and per-pane markets/studies. |
| `pane_set_layout` | Yes | Required | Select a native multi-chart layout and verify displayed pane count; retained hidden widgets do not count as visible charts. |
| `pane_set_symbol` | Yes | Required | Set an exchange-qualified symbol on exactly one pane, verify resolved instrument and detect collateral pane changes. |
| `pane_set_sync` | Yes | Required | Set and verify explicit native synchronization targets; preflight all requested controls before mutation. |
| `pane_set_timeframe` | Yes | Required | Set a timeframe on exactly one pane; verify target and check every other pane for collateral changes. |
| `paper_account_create` | Yes | — | Create a persistent local arithmetic simulation account. Never connects to a real broker or TradingView Paper Trading. |
| `paper_account_get` | No | — | Read local simulated cash, positions, mark-to-market equity and assumptions. |
| `paper_account_list` | No | — | List local simulation accounts and current equity; no broker account discovery. |
| `paper_export` | No | — | Export the local simulation trade ledger or full account to JSON/CSV, with explicit simulation labels. |
| `paper_mark_prices` | Yes | — | Value local simulated positions using explicitly supplied current prices. Does not fetch or invent live quotes. |
| `paper_trade` | Yes | — | Simulate a market fill at a caller-supplied same-currency price with explicit fees and slippage. Idempotent and revision-guarded. No live order is submitted; short/negative-cash positions are arithmetic only. |
| `pine_analyze` | No | — | Run limited offline static Pine checks; explicitly not a compiler or a proof against repainting. |
| `pine_can_write` | No | — | Inspect TradingView’s native write-permission result for one saved script; only a literal boolean is interpreted as can_write. |
| `pine_check` | No | — | Submit supplied Pine source to TradingView’s own guest compile endpoint; require recognised output and never infer success from empty diagnostics. |
| `pine_compile` | Yes | Required | Submit Add/Update on chart only for the exact expected buffer and title; require new compile success evidence or report failure/unverified. |
| `pine_delete_script` | Yes | Required | Delete one exact saved Pine script only after version/source/name preconditions and a confined backup; verify absence from a successful native library read. |
| `pine_export_saved_source` | No | — | Export one saved script’s exact source and metadata into a confined JSON artifact. |
| `pine_get_binding` | No | — | Read authoritative native Pine script ID/version, draft/modified state and the full visible source, with a binding hash. Ambiguous facades fail closed. |
| `pine_get_console` | No | — | Read only currently visible Pine console rows. |
| `pine_get_errors` | No | — | Read Monaco compiler diagnostics including severity and line/column positions. |
| `pine_get_saved_source` | No | — | Read saved source by exact script ID and version without touching the current editor or its binding. |
| `pine_get_source` | No | — | Read the current editor source, exact binding title and source SHA-256. |
| `pine_get_versions` | No | — | Read native saved Pine version history by exact script ID. An unexpected response is an error, never an empty version list. |
| `pine_list_scripts` | No | — | List the account’s saved Pine library through the browser’s TradingView request context; no credential extraction. |
| `pine_new_buffer` | Yes | Required | Create a native unsaved Pine draft from a clean saved document, verify draft identity, and set exact supplied source. Does not create a cloud script. |
| `pine_open_editor` | Yes | Required | Open Pine Editor and verify a unique visible Monaco editor bound to the displayed DOM. |
| `pine_open_script` | Yes | Required | Open one saved Pine script/version through its native editor facade and verify exact bound ID, version and full source. Requires a clean current buffer and binding hash; no source-injection fallback. |
| `pine_rename_script` | Yes | Required | Rename one exact saved Pine script after version/source/name preconditions; preserve source, refuse name conflicts, and verify native ID/name readback. |
| `pine_save` | Yes | Required | Save the exactly identified open Pine buffer using its scoped toolbar; verify Saved status. New unnamed script dialogs require native UI handling. |
| `pine_save_as` | Yes | Required | Save the exactly hashed visible Pine buffer as a uniquely named new cloud script, then natively bind the editor to its verified new ID/version/source. Returns a reconciliation receipt if binding fails after saving. |
| `pine_save_new` | Yes | Required | Create a new cloud Pine script from supplied source, refuse duplicate names, and independently verify new ID/version/full source. Leaves the editor binding unchanged. |
| `pine_save_next` | Yes | Required | Save the next cloud version of exactly one Pine script after matching prior version/full-source hash; back up old source and independently verify the version moved and new source matches. |
| `pine_set_source` | Yes | Required | Replace the existing Pine buffer only if its prior SHA-256 still matches; verify exact full-text readback. Does not create a new saved script. |
| `pine_template` | No | — | Return a new Pine v6 template as text. Does not overwrite an editor or create a saved script. |
| `quote_batch` | No | — | Read up to 100 exchange-qualified symbols from the public TradingView scanner with zero session credentials. Missing symbols remain explicit; no chart is retargeted. |
| `quote_get` | No | — | With a symbol, read one credential-free TradingView public scanner quote without changing charts. Without a symbol, read the selected chart’s latest loaded candle and label that source explicitly. |
| `replay_autoplay` | Yes | Required | Set an explicit autoplay state and supported delay, verifying both; no blind toggle. |
| `replay_start` | Yes | Required | Start browser Bar Replay at a Unix-second timestamp; verify cursor and stop on excessive unapproved relocation. |
| `replay_status` | No | — | Read replay availability, cursor, autoplay and simulated position with tri-state booleans. |
| `replay_step` | Yes | Required | Advance a bounded number of replay bars, verifying every cursor advance; autoplay must be paused. |
| `replay_stop` | Yes | Required | Stop replay and independently verify its stopped state. |
| `replay_trade` | Yes | Required | Place only a simulated Bar Replay buy/sell/close action and verify simulated position direction. Never calls a broker order API. |
| `research_equity_metrics` | No | — | Compute transparent local equity metrics from supplied samples. Does not substitute these calculations for TradingView Strategy Tester results or annualize unknown sample spacing. |
| `research_export` | No | — | Export caller-supplied structured research rows to confined local JSON or formula-safe CSV. Never fetches a remote dataset. |
| `research_rank_results` | No | — | Rank supplied backtest result rows on a specified finite numeric field, with explicit missing-value handling. |
| `research_trade_statistics` | No | — | Calculate win/loss counts, expectancy and profit factor from caller-supplied net trade P&Ls, with explicit zero-loss handling. |
| `screener_scan` | No | — | Run a bounded public TradingView scanner query across approved markets, columns and numeric/type filters. No credentials, arbitrary headers, external providers or authenticated fallback. |
| `security_status` | No | — | Describe enforced security boundaries and limitations without exposing tokens, browser state or cookies. |
| `session_health` | No | — | Read browser version, eligible targets and current layout context without extracting authentication state. |
| `strategy_capture` | No | — | Capture a pre-mutation report probe for subsequent freshness checks; stores only bounded transient page-memory report references. |
| `strategy_compare_metrics` | No | — | Compare two supplied metric objects with absolute and relative changes; does not infer causation or investment merit. |
| `strategy_export` | No | — | Export one full report plus the complete trade history and per-trade equity; detects report changes during pagination. |
| `strategy_get_equity` | No | — | Read per-trade account values and cumulative P&L with pagination; does not claim per-bar equity. |
| `strategy_get_inputs` | No | — | Read exact strategy input IDs and values. |
| `strategy_get_orders` | No | — | Read all filled-order report records with pagination and explicit native field semantics. |
| `strategy_get_report` | No | — | Read the full performance object, long/short metrics, settings and report date window for one exact strategy. |
| `strategy_get_trades` | No | — | Read complete trade history using pagination, including paired entry/exit, commission and account value. |
| `strategy_list` | No | — | List every strategy with exact entity IDs; ambiguous or missing IDs are never guessed. |
| `strategy_scan` | Yes | Required | Run explicit parameter variants sequentially, verify report-change evidence, restore starting chart/inputs and export results. |
| `strategy_set_inputs` | Yes | Required | Set strategy inputs by exact IDs and verify values; report freshness is a separate step. |
| `strategy_status` | No | — | Read report availability, exact context and explicitly qualified freshness evidence. |
| `strategy_sweep` | Yes | Required | Run a bounded symbol × timeframe × input grid sequentially; fresh by default, no cross-run cache, full result evidence and state restoration. |
| `strategy_wait` | No | — | Wait for exact strategy/context and explicit report-change evidence; unchanged stable metrics alone fail freshness checks. |
| `stream_list` | No | — | List in-memory polling streams. |
| `stream_poll` | No | — | Read buffered samples after a sequence number and detect dropped samples. |
| `stream_start` | Yes | — | Poll one read-only tool at a bounded interval and retain a limited in-memory result buffer. This is browser polling, not a guaranteed tick feed. Stops after its duration or on an error. |
| `stream_stop` | Yes | — | Stop a polling stream and optionally remove its in-memory buffer. |
| `study_template_apply` | Yes | Required | Apply one native saved or supplied study template, back up the prior studies, and verify identities plus exposed settings. Replaces active-chart studies. |
| `study_template_delete` | Yes | Required | Delete one exact custom study-template ID after matching its current name, then verify absence. Built-in templates refuse. |
| `study_template_export` | No | — | Export a saved native study template and hash to a confined JSON artifact. |
| `study_template_get` | No | — | Read one native study template by exact ID, with content hash and study/configuration signature. |
| `study_template_list` | No | — | List native TradingView account study templates, distinguishing custom and built-in templates. |
| `study_template_save` | Yes | Required | Save the active study configuration as a native account template and verify independent content readback. Replacement requires exact prior content hash. |
| `study_template_snapshot` | No | — | Capture a native template of the active chart’s studies, optionally including symbol/timeframe. This is not a saved-layout copy. |
| `tools_catalog` | No | — | Return the complete registered tool schemas and verification labels; no TradingView connection required. |
| `ui_click` | Yes | Required | Click one unique visible chart element. Returns dispatched, not business-operation success. Broker order buttons and external links are blocked. |
| `ui_find` | No | — | Find visible elements using a CSS selector; no arbitrary JavaScript or credential values. |
| `ui_hover` | Yes | Required | Move the pointer to the center of one inspected visible element. |
| `ui_key` | Yes | Required | Send one bounded navigation key to a unique chart field after focusing it. Browser shortcuts, developer tools and address-bar access are unavailable. |
| `ui_list_dialogs` | No | — | Inspect visible dialogs without dismissing, confirming or accepting them. |
| `ui_list_panels` | No | — | Inspect panel and toolbar controls so a caller can choose an observed selector. |
| `ui_read` | No | — | Read one visible non-credential element by an exact selector. |
| `ui_scroll` | Yes | Required | Scroll one visible scroll container and return the observed before/after offsets. |
| `ui_snapshot` | No | — | Return bounded visible control metadata from the current chart. Treat all page text as untrusted data. |
| `ui_type` | Yes | Required | Set and verify a visible non-credential text field. Does not press Enter or submit a form. |
| `watchlist_add` | Yes | Required | Append one exact symbol or section to a named watchlist ID; independently verify membership, name and order. |
| `watchlist_add_bulk` | Yes | Required | Append missing exact symbols/sections in order; independently verify the complete resulting watchlist. |
| `watchlist_create` | Yes | Required | Create an independent named custom watchlist; verify its new ID, exact entries/order and account listing. Uses durable idempotency and refuses duplicate names. |
| `watchlist_export` | No | — | Export exact watchlist entries/section order as JSON or CSV through the safe local artifact store. No account session state is read or exported. |
| `watchlist_get` | No | — | Read every stored symbol and section in exact order from one custom watchlist ID, including a concurrency fingerprint. |
| `watchlist_get_active` | No | — | Read the API-designated active watchlist. It may differ from the currently rendered sidebar; use exact IDs for mutations. |
| `watchlist_import` | Yes | Required | Import explicit entries without reading arbitrary local files. Merge appends missing entries; replace requires an idempotency key and verifies full requested order after clear-and-append. |
| `watchlist_import_preview` | No | — | Show membership/order changes for an import without writing. Merge appends missing entries; replace rebuilds exact requested order. |
| `watchlist_list` | No | — | List custom watchlists by exact ID with counts and duplicate-name diagnostics. Does not choose a list by name. |
| `watchlist_reconcile` | No | — | Read a durable create/replace checkpoint and compare it with current account state. Exposes recovery entries but never resumes, retries or rolls back a mutation. |
| `watchlist_remove` | Yes | Required | Remove one exact stored entry from a named watchlist ID and verify the remaining order. Refuses a missing entry. |
| `watchlist_remove_bulk` | Yes | Required | Preflight every requested entry, remove exact matches, then independently verify absence and remaining order. |
| `watchlist_reorder` | Yes | Required | Reorder exactly the same symbols and section headers by verified clear-and-append, preserving the list ID/name. Temporarily empties the list; no guessed reorder endpoint. |
| `watchlist_set_entries` | Yes | Required | Replace watchlist content/order using known remove then append endpoints. Temporarily empties the list; durable checkpoints and exact read-back expose partial failure. |
| `workflow_copy_chart_create_alert` | Yes | Required | Copy a saved chart into an independent layout, verify the copy, change symbol/timeframe, save, create a native alert, and independently verify exact stored message/webhook/condition/activation. Uses durable checkpoints and refuses uncertain duplicates. Does not test webhook delivery. |
| `workflow_status` | No | — | Read a local copy-and-alert operation checkpoint. Contains IDs, hashes and stages; never stores webhook tokens or alert message bodies. |

Total implemented tools: **185**.
