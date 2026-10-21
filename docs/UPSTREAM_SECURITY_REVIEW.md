# Upstream security review
**Review date: 2026-10-19 UTC. Method: static source inspection before upstream execution.**

## Decision
Proceed with a separately authored, browser-only implementation and offline tests. Do not install or execute these upstream packages as a way of building the combined server. Adopt selected API patterns behind a stricter local boundary. The reviewed sources contain useful integrations, but several authentication, networking and execution paths are incompatible with the requested design.

In the inspected source paths, this review did **not identify an explicit path whose intended behavior is to forward TradingView session cookies to an unrelated third-party service**. That is a limited static finding, not a guarantee that a package is safe. Two projects explicitly move session cookies out of the browser; another contains configured cloud synchronization and LLM uploads; several expose arbitrary JavaScript in an authenticated page. Those capabilities make a blanket statement such as “these repositories cannot leak cookies” unjustified.

The essential distinction is between (a) a logged-in TradingView page issuing a fixed, approved request to TradingView with cookies attached by the browser and (b) reading cookies into Node, a configuration file, logs or MCP output. The combined server should use the first pattern. The second is prohibited. Local CDP socket identifiers and optional local transport authentication are not TradingView session credentials, but also should not be exposed unnecessarily.

The implemented public-market adapter adds one explicit unauthenticated exception to local Node CDP traffic: fixed scan and US preset requests to `https://scanner.tradingview.com`, with credentials omitted, fixed headers, redirects rejected, and bounded request/stream sizes and timeouts. This service receives symbol/filter data, not browser session secrets. Authenticated requests remain in the browser, and a failed authenticated request never falls back to cookie replay. See [MARKET_DATA.md](MARKET_DATA.md) for the boundary and its offline tests. This exception should be stated wherever the project describes its network policy; “all Node traffic is loopback” is not an accurate description of the finished feature set.

## Scope and evidence
Eight exact revisions were reviewed through read-only GitHub source retrieval. The selection contains **492 repository file paths, 433 unique blobs, approximately 3.8 million text characters**. Duplicate fork files were deduplicated by Git blob SHA. The selection covers runtime JavaScript/TypeScript under src, extension JavaScript/manifests, root manifests and lockfiles, license notices, selected startup/build scripts, and the separate hosted fork's runtime files. Exact reviewed paths and blob hashes are recorded in [UPSTREAMS.json](UPSTREAMS.json).

| Repository | Pinned commit | Selected paths |
| --- | --- | --- |
| [FerroxLabs/tvcontrol](https://github.com/FerroxLabs/tvcontrol) | [a8d3dfc97621e22b8b7c71e617b134c5e35882ee](https://github.com/FerroxLabs/tvcontrol/commit/a8d3dfc97621e22b8b7c71e617b134c5e35882ee) | 101 |
| [JostQQ/tradingview-mcp](https://github.com/JostQQ/tradingview-mcp) | [4d9b440935d5e8b862ab61a72812adf801684564](https://github.com/JostQQ/tradingview-mcp/commit/4d9b440935d5e8b862ab61a72812adf801684564) | 44 |
| [pbajkovic-hub/tv-cdp-mcp](https://github.com/pbajkovic-hub/tv-cdp-mcp) | [dd0fd3c07ad10ea6151fc21aeff3791db7cb7219](https://github.com/pbajkovic-hub/tv-cdp-mcp/commit/dd0fd3c07ad10ea6151fc21aeff3791db7cb7219) | 21 |
| [firyomaefx/tradingview-chrome-mcp](https://github.com/firyomaefx/tradingview-chrome-mcp) | [d20f0acf7a2d888ef7fe9304178fae35c233c42c](https://github.com/firyomaefx/tradingview-chrome-mcp/commit/d20f0acf7a2d888ef7fe9304178fae35c233c42c) | 95 |
| [tradesdontlie/tradingview-mcp](https://github.com/tradesdontlie/tradingview-mcp) | [c05b8f5755ed8e64ea242de88ddbf46aa24d56a4](https://github.com/tradesdontlie/tradingview-mcp/commit/c05b8f5755ed8e64ea242de88ddbf46aa24d56a4) | 63 |
| [Chefy3x/tradingview-mcp-chefy](https://github.com/Chefy3x/tradingview-mcp-chefy) | [abcad6c6a49a89a99f700abacffa2cdb61883fe7](https://github.com/Chefy3x/tradingview-mcp-chefy/commit/abcad6c6a49a89a99f700abacffa2cdb61883fe7) | 66 |
| [iliaal/tradingview-mcp](https://github.com/iliaal/tradingview-mcp) | [233f29e180031291dacac4c4cc2736a8dde161be](https://github.com/iliaal/tradingview-mcp/commit/233f29e180031291dacac4c4cc2736a8dde161be) | 88 |
| [daviddme/tradingview-alerts-mcp-server](https://github.com/daviddme/tradingview-alerts-mcp-server) | [5a61aa352c97403477052aead3a3dcab627c2dd0](https://github.com/daviddme/tradingview-alerts-mcp-server/commit/5a61aa352c97403477052aead3a3dcab627c2dd0) | 14 |

No upstream code was imported, run, installed or built. No upstream test suite or release executable was run. No browser was opened, no account was accessed, and no cookie or token was read. Source scanning and manifest parsing were performed as data-processing operations only.

This review does not cover every test, example or documentation file, downloaded npm tarball source, prebuilt executables, browser extensions already installed by a user, TradingView's own application bundles, live network traffic or package vulnerability advisories. In particular, the separate pbaj exchange bridge example was excluded from runtime review; it is not part of the proposed server. Source existence, README promises and authors' reported live tests are separate evidence classes. No live TradingView success is claimed here.

## Findings that determine the design
The severity below reflects the consequences of importing a path into this project's requested boundary. It is not an allegation of malicious intent or a published vulnerability rating.

| ID | Finding | Effect on the combined server |
| --- | --- | --- |
| SEC-01 | iliaal extracts HttpOnly session cookies through CDP and constructs a Node Cookie header. | Exclude the path. Implement watchlist changes through fixed in-page TradingView actions. |
| SEC-02 | daviddme requires session cookies in environment variables or auth.json and replays them from Node. | Exclude credential loading and transport. Use only the data-only strategy-alert payload pattern. |
| SEC-03 | firy operational sync can send queued data to configured Supabase independently of the telemetry flag. | Exclude synchronization, database bootstrap and hosted services. |
| SEC-04 | firy Pine autofix uploads complete Pine source, goal and compile messages to OpenAI or Anthropic. | Exclude embedded provider clients. The MCP client handles any requested AI editing. |
| SEC-05 | Several servers offer caller-supplied JavaScript evaluation in the authenticated page. | No raw eval, arbitrary CDP method, function body, REPL or general network tool. |
| SEC-06 | Some tab and navigation selectors use loose TradingView URL matching. | Strict URL parsing and exact host, scheme, port and target checks before connection and every operation. |
| SEC-07 | firy has a public default extension token and a dashboard whose unauthenticated HTML includes its bearer token. | Do not import the bridge, dashboard or HTTP server. |
| SEC-08 | Alert messages/webhook URLs, Pine source, screenshots and error strings can disclose user data through legitimate results. | Use typed output projections, explicit content requests and secret redaction; no hidden uploads. |
| SEC-09 | Runtime self-update can fetch new source and execute npm install scripts. | No runtime updater, shell execution or dependency bootstrap. |
| SEC-10 | Lockfile script flags are present in two development dependency trees; no tarballs were audited. | Do not inherit dependencies. Re-review any future additions separately. |
| SEC-11 | Copy and backtest handlers sometimes return success without verifying the intended result. | Require target identity and postconditions; preserve unknown/stale/partial states. |
| SEC-12 | firy has an MIT README claim but no license or notice file in the reviewed tree. | Independently implement ideas; do not copy its source. |

### SEC-01 — iliaal's authenticated watchlist removal
The remove implementation enables Network, calls Network.getCookies for https://www.tradingview.com, joins every returned cookie into a header string, and sends it from Node to a fixed TradingView watchlist endpoint. This includes HttpOnly session cookies. The fixed destination is evidence against calling this an observed third-party exfiltration path; the extraction itself still breaks the requirement that session secrets remain inside the browser. Errors also include response bodies in stderr. See [cookie extraction and Node request](https://github.com/iliaal/tradingview-mcp/blob/233f29e180031291dacac4c4cc2736a8dde161be/src/core/watchlist.js#L189-L285).

Replacement: address the named watchlist through the page's existing authenticated service or a fixed in-page request. Never fall back to cookie extraction when a browser request fails. Return a capability or session error instead. Do not enable Network cookie APIs merely to discover whether a session exists.

### SEC-02 — daviddme's cookie-based authentication
The small alerts server maps four TradingView cookies to environment variables, optionally reads an auth.json file, and returns a joined cookie string. Its HTTP wrapper places that value in a raw Cookie header. The request bases are pricealerts.tradingview.com, pine-facade.tradingview.com and symbol-search.tradingview.com. No unrelated cookie destination was found in these paths. Sources: [credential loader](https://github.com/daviddme/tradingview-alerts-mcp-server/blob/5a61aa352c97403477052aead3a3dcab627c2dd0/src/config.js#L21-L88) and [fixed bases and raw Cookie header](https://github.com/daviddme/tradingview-alerts-mcp-server/blob/5a61aa352c97403477052aead3a3dcab627c2dd0/src/http.js#L10-L51).

Its strategy payload builder is useful without the credential layer: it uses compiled positional inputs, a Pine ID/version, a strategy condition, resolution and canonical symbol/currency data. It defaults active=true and ignore_warnings=true, so those defaults must not be inherited casually. New alert creation should default to paused, preserve warnings, and make any webhook explicit. Configuring an alert webhook tells TradingView where future alert notifications go; it is not an immediate HTTP request by the MCP server. Neither a webhook field nor an alert message may be populated with session credentials. See [buildStrategyPayload](https://github.com/daviddme/tradingview-alerts-mcp-server/blob/5a61aa352c97403477052aead3a3dcab627c2dd0/src/alerts.js#L68-L123).

### SEC-03 — cloud synchronization is separate from telemetry
firy's telemetry-specific Supabase client requires telemetryEnabled, Supabase URL and service-role key. Its operational sync client has a different gate: URL plus service-role key, with no telemetryEnabled check. The main server starts the sync worker unconditionally; if configured, it drains allowed queue entities every 15 seconds. An unconfigured queue remains pending and can drain after configuration. Sources: [src/telemetry/supabase.ts](https://github.com/firyomaefx/tradingview-chrome-mcp/blob/d20f0acf7a2d888ef7fe9304178fae35c233c42c/src/telemetry/supabase.ts); [sync allowlist, gating and insert](https://github.com/firyomaefx/tradingview-chrome-mcp/blob/d20f0acf7a2d888ef7fe9304178fae35c233c42c/src/sync/sync-manager.ts#L38-L159); [startup](https://github.com/firyomaefx/tradingview-chrome-mcp/blob/d20f0acf7a2d888ef7fe9304178fae35c233c42c/src/server/index.ts#L50-L66).

The sync allowlist names telemetry.usage, licence.status, audit.summary and task.summary. This is an entity allowlist, not a schema proving every payload is harmless. Autofix enqueues task summaries containing free-form goal and sometimes error text. The redactor relies on key names and a finite set of value patterns. A secret inside arbitrary prose, a Pine comment or an unrecognized key is not guaranteed to be caught. Disabling TELEMETRY_ENABLED alone therefore does not establish “no cloud sync.” The combined implementation excludes these modules entirely. See [task summary enqueue paths](https://github.com/firyomaefx/tradingview-chrome-mcp/blob/d20f0acf7a2d888ef7fe9304178fae35c233c42c/src/llm/autofix.ts) and [heuristic redaction](https://github.com/firyomaefx/tradingview-chrome-mcp/blob/d20f0acf7a2d888ef7fe9304178fae35c233c42c/src/logging/logger.ts#L39-L125).

### SEC-04 — optional LLM and external-data egress
firy's LLM client sends a prompt containing the full Pine source, goal, errors and warnings to the configured provider. Providers are fixed to the OpenAI chat completions and Anthropic messages endpoints; API keys are taken from their expected environment variables. This is an explicit feature, not evidence of hidden cookie extraction, but it is unnecessary for a local browser control server and can export proprietary source or secrets embedded in that source. See [provider calls and full-source prompt](https://github.com/firyomaefx/tradingview-chrome-mcp/blob/d20f0acf7a2d888ef7fe9304178fae35c233c42c/src/llm/client.ts#L45-L154).

firy also fetches Yahoo Finance news and can use configured Redis for cached market data. iliaal fetches Nasdaq and Yahoo RSS for a selected ticker. A ticker is still activity metadata sent outside TradingView. These are excluded from the browser-only implementation; they should not be retained simply because they appear in a broad feature list. Sources: [src/adapters/news/rss.ts](https://github.com/firyomaefx/tradingview-chrome-mcp/blob/d20f0acf7a2d888ef7fe9304178fae35c233c42c/src/adapters/news/rss.ts); [optional cloud endpoints](https://github.com/firyomaefx/tradingview-chrome-mcp/blob/d20f0acf7a2d888ef7fe9304178fae35c233c42c/src/config.ts#L35-L49); [RSS destinations](https://github.com/iliaal/tradingview-mcp/blob/233f29e180031291dacac4c4cc2736a8dde161be/src/core/news.js#L10-L21).

### SEC-05 — arbitrary evaluation creates a broad capability
Jost registers tv_eval without an opt-in gate. Original tradesdontlie and Chefy register ui_evaluate. Ferrox gates ui_evaluate behind TV_MCP_ADVANCED=1, which is a meaningful improvement, but still offers the capability if enabled. Sources: [tv_eval](https://github.com/JostQQ/tradingview-mcp/blob/4d9b440935d5e8b862ab61a72812adf801684564/src/tools/health.js#L31-L36); [ui_evaluate](https://github.com/tradesdontlie/tradingview-mcp/blob/c05b8f5755ed8e64ea242de88ddbf46aa24d56a4/src/tools/ui.js#L88-L92); [src/tools/ui.js](https://github.com/Chefy3x/tradingview-mcp-chefy/blob/abcad6c6a49a89a99f700abacffa2cdb61883fe7/src/tools/ui.js); [opt-in gate](https://github.com/FerroxLabs/tvcontrol/blob/a8d3dfc97621e22b8b7c71e617b134c5e35882ee/src/tools/ui.js#L113-L128).

An authenticated-page eval can read page-visible data, perform authenticated actions and issue requests, subject to the browser's actual policies. This review does not repeat speculative claims that any page eval can read arbitrary local files. The concrete risk is enough: caller-supplied JavaScript defeats a typed allowlist. TradingView names, Pine code, alert text and DOM content must be treated as untrusted data, never as instructions or executable function bodies.

The combined server may internally use CDP Runtime.evaluate to run fixed, reviewed functions with JSON-serialized arguments. That is different from accepting an expression from the MCP caller. It still needs safeguards against string interpolation, hostile property paths, generic selectors that become executable code, network escape paths and new CDP methods. A read-only CDP allowlist alone is not sufficient if arbitrary evaluation remains possible.

### SEC-06 — bind only the intended TradingView browser target
pbaj normaliseChartUrl accepts any full http(s) URL containing a /chart/<id> path. Its tab filter searches for tradingview.com/chart anywhere in the URL string. Those tests do not establish that the parsed hostname is TradingView. Ferrox and other CDP implementations permit a configurable remote CDP host. Sources: [URL normalization](https://github.com/pbajkovic-hub/tv-cdp-mcp/blob/dd0fd3c07ad10ea6151fc21aeff3791db7cb7219/src/tools/layouts.mjs#L12-L23); [tab filtering](https://github.com/pbajkovic-hub/tv-cdp-mcp/blob/dd0fd3c07ad10ea6151fc21aeff3791db7cb7219/src/cdp.mjs#L12-L23); [CDP host configuration](https://github.com/FerroxLabs/tvcontrol/blob/a8d3dfc97621e22b8b7c71e617b134c5e35882ee/src/connection.js#L10-L14).

The replacement must parse URLs, permit only the intended HTTPS TradingView host(s), reject userinfo, fragments used as hidden data, nondefault ports and unexpected query fields, and validate the chart pathname. CDP discovery and the WebSocket target returned by discovery must remain on an approved loopback address and port. Redirects must not silently move an approved request to an unapproved host. Revalidate the tab after navigation and before each sensitive operation. When multiple charts exist, require an explicit target or fail on ambiguity rather than choosing an arbitrary first match.

### SEC-07 — local transport authentication is not supplied by loopback alone
firy's extension bridge uses a public constant as its default token in both the extension and server. The bridge parses a token query parameter but does not validate Origin in the inspected handshake. It exposes generic page evaluation through the extension transport. A configured strong token would improve authentication but would not justify importing the generic execution surface. Sources: [default token](https://github.com/firyomaefx/tradingview-chrome-mcp/blob/d20f0acf7a2d888ef7fe9304178fae35c233c42c/extension/background.js#L8-L23); [token and handshake](https://github.com/firyomaefx/tradingview-chrome-mcp/blob/d20f0acf7a2d888ef7fe9304178fae35c233c42c/src/browser/extension-driver.ts#L37-L38) and [handshake](https://github.com/firyomaefx/tradingview-chrome-mcp/blob/d20f0acf7a2d888ef7fe9304178fae35c233c42c/src/browser/extension-driver.ts#L419-L451); [dynamic evaluation](https://github.com/firyomaefx/tradingview-chrome-mcp/blob/d20f0acf7a2d888ef7fe9304178fae35c233c42c/extension/injected/commands.js).

The dashboard restricts /api routes with a bearer token, but its unauthenticated GET / response substitutes that same token into JavaScript in the HTML. A local client able to fetch that HTML can obtain it. The frontend also builds HTML from dynamic values with innerHTML. Browser cross-origin rules affect which remote pages can read a response; this static finding does not assert a tested remote exploit. The source contradicts treating its bearer token as a separate authentication secret against local clients. See [dashboard token and HTML route](https://github.com/firyomaefx/tradingview-chrome-mcp/blob/d20f0acf7a2d888ef7fe9304178fae35c233c42c/src/dashboard/server.ts).

The optional upstream HTTP MCP listener is loopback and checks Origin when present, but accepts no-Origin requests without a separate bearer check and buffers the body without an explicit size cap in this file. The new server does not inherit that listener: stdio is the default, and its separately implemented optional HTTP mode requires its own authentication, Host/Origin validation, strict body limits and lifecycle tests. No extension bridge is adopted. See [upstream src/server/http.ts](https://github.com/firyomaefx/tradingview-chrome-mcp/blob/d20f0acf7a2d888ef7fe9304178fae35c233c42c/src/server/http.ts).

### SEC-08 — output and local files need a deliberate data policy
pbaj's alert projection returns webhookUrl, message and nested conditions. These may contain user-supplied secrets even without any cookie API. Copying an object into an MCP result also exposes it to the user's MCP client and potentially its configured model provider. Therefore no raw page-object dump, alert webhook, authorization field or entire browser state should be returned as a convenience. See [projected alert fields](https://github.com/pbajkovic-hub/tv-cdp-mcp/blob/dd0fd3c07ad10ea6151fc21aeff3791db7cb7219/src/tools/alerts.mjs#L151-L178).

Ferrox telemetry is local JSONL, not an observed remote telemetry upload. It is normally opt-in; ui_evaluate is force-logged. The logged schema contains timestamp, tool, success, duration, category and an error string; it omits the expression and ordinary parameters. Error length is bounded, but this is not a general secret redactor. Its support bundle is locally generated with additional heuristic filtering. Sources: [local logging and schema](https://github.com/FerroxLabs/tvcontrol/blob/a8d3dfc97621e22b8b7c71e617b134c5e35882ee/src/core/telemetry.js#L1-L110) and [src/core/support.js](https://github.com/FerroxLabs/tvcontrol/blob/a8d3dfc97621e22b8b7c71e617b134c5e35882ee/src/core/support.js).

Jost's workspace path guard checks lexical relative paths, which does not itself stop symlink traversal or prove robust containment on every platform. The combined exporter should generate filenames under a fixed output directory, validate containment including filesystem resolution where needed, avoid overwriting arbitrary paths, and write only requested data. See [workspace guard](https://github.com/JostQQ/tradingview-mcp/blob/4d9b440935d5e8b862ab61a72812adf801684564/src/core/workspace.js#L19-L24).

Use bounded, typed output schemas. Strip known secret keys and token-like values from text results and errors. Default alert results to has_webhook and sanitized metadata. Include Pine source, screenshots or full trade ledgers only when the corresponding tool requests that content. Screenshots are pixels and may display private content; a text redactor cannot certify them secret-free. This review cannot guarantee that arbitrary user-authored prose never contains a credential.

### SEC-09 and SEC-10 — installation and updates change the audited code
Original tradesdontlie performs a best-effort GitHub update check from its health module. Its self-update tool fetches origin/main, fast-forwards the checkout and runs npm ci if the lockfile changed. Ferrox has a guarded self-updater with the same material installation capability. No TradingView cookie forwarding was found in these update paths, but executing a later commit invalidates this pinned review. Sources: [GitHub check](https://github.com/tradesdontlie/tradingview-mcp/blob/c05b8f5755ed8e64ea242de88ddbf46aa24d56a4/src/core/health.js#L9-L42); [fetch, merge, install](https://github.com/tradesdontlie/tradingview-mcp/blob/c05b8f5755ed8e64ea242de88ddbf46aa24d56a4/src/core/update.js#L59-L89); [src/core/update.js](https://github.com/FerroxLabs/tvcontrol/blob/a8d3dfc97621e22b8b7c71e617b134c5e35882ee/src/core/update.js).

No reviewed root package has preinstall, install, postinstall or prepare scripts. Ferrox has a prepublishOnly check. This does not prove that installing dependencies is inert: lockfiles mark install scripts on the following packages. Counts below include root-lock development and optional dependencies; a flag does not establish that a script is malicious or that it runs on every platform.

| Repository | Package version | Node requirement | Root lock package entries | Packages marked hasInstallScript |
| --- | --- | --- | --- | --- |
| FerroxLabs/tvcontrol | 2.5.3 | >=18.14.1 | 175 | None marked |
| JostQQ/tradingview-mcp | 1.0.0 | >=20 | 177 | None marked |
| pbajkovic-hub/tv-cdp-mcp | 0.1.0 | >=22 | 94 | None marked |
| firyomaefx/tradingview-chrome-mcp | 0.8.0 | >=22.5.0 | 329 | `esbuild`, `fsevents`, `tsx/node_modules/fsevents` |
| tradesdontlie/tradingview-mcp | 1.0.0 | Not declared | 173 | None marked |
| Chefy3x/tradingview-mcp-chefy | 0.1.0 | Not declared | 95 | None marked |
| iliaal/tradingview-mcp | 1.4.0 | Not declared | 176 | None marked |
| daviddme/tradingview-alerts-mcp-server | 1.0.0 | >=20.0.0 | 182 | `esbuild`, `fsevents` |

All resolved tarball URLs in these eight root lockfiles point to registry.npmjs.org. That is a destination inventory, not a supply-chain verdict. Dependency source, registry ownership, advisories, release signing and integrity verification against downloaded tarballs were not audited. The separately authored implementation currently chooses Node built-ins rather than inheriting these trees. Any later dependency requires its own review and pinned lockfile. No installer or npm command was run during this upstream review.

### SEC-11 — verify mutations and fresh results
pbaj's native copy path calls TradingView's Save-As controller, then requires a new saved account layout ID with the requested name. This is stronger evidence than a successful click. It still does not prove all unsaved edits were included. firy's DOM duplicate action catches click errors and reports that the action was triggered without a new-ID check. Sources: [native clone and saved-ID verification](https://github.com/pbajkovic-hub/tv-cdp-mcp/blob/dd0fd3c07ad10ea6151fc21aeff3791db7cb7219/src/tools/layouts.mjs#L314-L398) and [layout duplicate handler](https://github.com/firyomaefx/tradingview-chrome-mcp/blob/d20f0acf7a2d888ef7fe9304178fae35c233c42c/src/adapters/tradingview/adapter.ts#L1490-L1534).

Jost provides rich native reportData access, but selection can fall back to the first strategy when a target misses, and a stable metric fingerprint alone does not prove the report was recalculated for a new symbol. Fixed delays and an open panel are also insufficient. These are data-integrity risks: a server may return plausible results for the wrong layout, strategy or calculation. The combined workflow must bind identity, wait for matching state, expose calculation freshness, fail when a requested target is missing, and distinguish stale, unavailable and partial results. See [src/core/strategy.js](https://github.com/JostQQ/tradingview-mcp/blob/4d9b440935d5e8b862ab61a72812adf801684564/src/core/strategy.js) and [src/core/batch.js](https://github.com/JostQQ/tradingview-mcp/blob/4d9b440935d5e8b862ab61a72812adf801684564/src/core/batch.js).

### SEC-12 — licensing and attribution
MIT license texts are present for Ferrox, Jost, pbaj, original tradesdontlie, Chefy, iliaal and daviddme. Jost additionally retains the original upstream notice; Chefy's NOTICE credits the LewisWJackson and tradesdontlie lineage. These notices are retained in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).

firy's reviewed README claims MIT, but the pinned Git tree contains no LICENSE/NOTICE file and the root manifest has no license field. This is an unresolved provenance issue, not a conclusion about the author's intention. No firy source is imported. Browser workflow concepts can be implemented independently; any future source reuse must first resolve the actual grant. Evidence: [README.md](https://github.com/firyomaefx/tradingview-chrome-mcp/blob/d20f0acf7a2d888ef7fe9304178fae35c233c42c/README.md) and [package.json](https://github.com/firyomaefx/tradingview-chrome-mcp/blob/d20f0acf7a2d888ef7fe9304178fae35c233c42c/package.json), with the complete pinned tree linked in [UPSTREAMS.json](UPSTREAMS.json).

## Runtime destination map
These are observed paths in reviewed upstream source, not a list of destinations permitted in the new server.

| Destination / mechanism | Observed purpose | Authentication or data | Disposition |
| --- | --- | --- | --- |
| Loopback CDP HTTP and WebSocket | Browser or desktop control | Powerful local browser-control channel | Keep only strictly validated loopback browser control. |
| www.tradingview.com | Layouts, watchlists and chart navigation | Browser-managed session, except explicit cookie extraction in noted paths | Fixed in-page requests/actions only. |
| pine-facade.tradingview.com | Compile, scripts, inputs and versions | Pine source; authenticated script operations in page, raw cookies in daviddme | Approved browser request adapters only. |
| pricealerts.tradingview.com | Alert lifecycle | Alert payloads and browser-managed session; raw cookies in daviddme | Approved in-page adapters, paused creation, sanitized results. |
| symbol-search.tradingview.com | Symbol discovery | Symbol/query metadata | Only through deliberately included fixed TradingView adapters. |
| scanner.tradingview.com | Public quotes, scanner and hotlists | Symbol/filter metadata; no account credential in the new adapter | Explicit fixed-path Node public-data exception with credentials omitted, no caller headers, redirects refused, bounded data and timeouts. |
| api.github.com; configured Git remote | Version checking and updates | Repository/version metadata | Excluded at runtime. |
| Configured Supabase and Redis endpoints | Telemetry, sync, feature flags, cache, hosted service | Operational metadata and configured service credentials | Excluded. |
| api.openai.com; api.anthropic.com | Pine autofix | Goal, full source, errors and provider API key | Excluded from server. |
| Nasdaq and Yahoo RSS endpoints | News and sentiment | Requested ticker | Excluded. |
| User-specified alert webhook | Future alert delivery by TradingView | User's alert message when alert fires | Separate explicit alert setting; never include cookies or copy secrets into it. |

The browser itself runs TradingView and may perform its ordinary network activity, including resources chosen by TradingView or browser extensions. This design does not function as a firewall for the entire browser. The enforceable scope is that the new MCP process and reviewed adapter functions do not extract session secrets or initiate unauthorized destinations.

## Implementation acceptance requirements
The following are requirements for the new project, not claims that this upstream audit has tested its implementation:

1. Bind CDP to a literal approved loopback address and validate both discovery URLs and returned WebSocket URLs, including redirects and port.
2. Select only a genuine HTTPS TradingView chart target. Refuse ambiguous targets and revalidate after navigation.
3. Reject cookie getters/setters, cookie headers, auth.json imports, browser profile export, storageState and arbitrary storage reads.
4. Expose named operations with typed parameters. No caller expression, general function body, generic CDP dispatch, network proxy or shell tool.
5. Run only fixed page functions with serialized data arguments. Do not execute chart titles, Pine comments, alert text or DOM strings.
6. Keep authenticated requests in the browser and restrict destinations, methods and paths. Do not fall back to Node cookie replay. The separate public scanner adapter must stay credential-free, fixed to its approved TradingView host and request families, and must not become a general network proxy.
7. Exclude cloud telemetry, Supabase/Redis sync, provider SDKs, automatic updates, download-and-run setup and browser/desktop profile discovery.
8. Bound input, response and file sizes; redact errors and metadata; avoid raw page-object dumps and hidden source uploads.
9. Return identity-bearing operation receipts and verify clone, symbol, timeframe, strategy inputs and report freshness.
10. Default alert creation to paused, require a precise target for bulk mutation, preserve warnings and make webhook changes explicit.
11. Use a dedicated safe export directory and filenames; do not accept arbitrary paths for backup, source reads or support bundles.
12. Test security gates offline with hostile URLs, nested/encoded secrets, disallowed CDP methods, injected function-like input, malformed RPC and fake stale report transitions. Keep live validation separate and opt-in.

A successful offline test suite demonstrates the properties of its test cases. It cannot establish that undocumented TradingView APIs still work or that every response is current on the user's account. Live acceptance must separately verify the copied layout has a new ID, carries the expected studies/settings, leaves its source intact, changes the intended symbol, and produces matching fresh Strategy Tester results.

## Audit conclusion
The useful parts of these projects can inform a combined browser workflow without inheriting their credential handling or external services. The security gate is therefore **selective reimplementation with explicit exclusions**, followed by offline validation and a clearly labeled live acceptance step. No upstream package receives a blanket “secure” certification from this review.
