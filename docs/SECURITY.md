# Release security review — 2026-10-21

This review covers the authored runtime and its public-release files. It combines source inspection, regression tests, controlled browser/CDP fixtures, real transport tests, and limited live TradingView testing. It is not an independent certification or a guarantee that arbitrary content, Chrome, TradingView, or an MCP client cannot disclose data.

## Findings and changes

| Finding | Change | Verification |
| --- | --- | --- |
| Some diagnostics returned raw chart query strings/fragments. | Session health and layout metadata now sanitize chart URLs; layout snapshots omit query/fragment data. New-target discovery validates returned origin and sanitizes its URL. | Canary URLs, native metadata, session diagnostics, and malicious discovery responses. |
| Chrome inherited unrelated environment secrets and process injection flags. | The launcher now forwards an explicit allowlist of platform/session settings. Unrelated API keys, bearer tokens, Node options, dynamic-library injection settings, and TLS key-log paths are excluded. | Synthetic environment tests; actual dedicated Chrome launch. |
| Quoted/serialized JSON and cookie-export name/value records bypassed some known-secret redaction. | Recursive redaction handles serialized JSON, quoted fields, session/device credentials, and credential records with separate `name`/`value` fields. Harmless JSON text keeps its original bytes. | Nested object, escaped string, source-like text, serialized cookie-array, and preservation tests. |
| CSV formula handling missed leading whitespace and minus-prefixed formulas that began with digits. | Values and headers are escaped for those forms; strict negative numbers remain numeric text. | Exported file contents, dangerous prefixes, headers, confinement, and owner-only file permissions. |
| CDP discovery read complete bodies before enforcing its limit. | Discovery is now bounded during streaming and oversized bodies are cancelled. | Oversized stream fixture with cancellation assertion. |
| Debugger connection closure before `open` retained a pending timeout. | Early close promptly rejects the connection and clears state. Synchronous send failure also clears its pending command. | Early-disconnect regression test and live debugger connection. |
| Resource/prompt lookups could resolve inherited object properties. | Lookups require a string and an own property. | Prototype-name and non-string JSON-RPC cases. |
| A storage containment check assumed POSIX separators. | Containment uses platform-aware relative paths. | Existing traversal/symlink tests. Windows behavior remains unverified. |
| Test reports embedded absolute local user paths; release exclusions were narrow. | Reports use repository-relative paths. Ignore rules cover browser/runtime data, environment variants, credential files, logs, and archives. A release scanner audits the exact staged Git blobs and reports rule names, never matched secret values. Commit authorship uses a GitHub noreply address. | Scanner fixture proves an unsafe staged blob is detected even if the working file has been cleaned. Candidate-tree scan is required before publication. |
| Alert serialization differed from current native client conventions. | Preserve actual symbol modifiers rather than inventing currency conversion; keep simple symbols plain; use native disabled-webhook representation; use alert-level resolution; honor the native expiration-format flag; include bounded first-party build/account routing metadata inside Chrome. Preserve redacted submission diagnostics and uncertainty guards. | Offline regression tests and native interface inspection. **Live alert creation remains unverified/failed in the tested session**, including a control using TradingView's own request API. |

The last row is a compatibility finding, not a claim of a successful alert-creation fix. No uncertain alert creation was automatically repeated by the server. Audit attempts used distinct names and explicit reconciliation. No audit alerts or saved audit layouts remained in the completed reconciliation.

## Enforced data paths

- Node CDP discovery is restricted to a literal approved loopback endpoint. Discovery redirects and mismatched debugger origins/ports are rejected.
- Browser targets must be exact HTTPS TradingView chart origins. Fixed page wrappers recheck the origin before execution.
- No caller-authored JavaScript, generic CDP dispatch, cookie getter/exporter, storage-state reader, shell tool, updater, external AI provider, or telemetry SDK is exposed.
- Authenticated first-party requests execute in Chrome. The server does not replay extracted cookies in Node. Current alert POST routing uses the web build and account username only within the browser-to-TradingView request; neither the session object nor authentication headers are returned.
- A separate public scanner adapter has fixed TradingView destinations and request families, omitted credentials, no caller-supplied authentication headers, refused redirects, bounded responses, and timeouts.
- Webhook URLs are configuration values. This MCP process does not contact them for test delivery.
- Mutation tools bind explicit targets and native saved-layout identities. Copy/alert creation uses durable checkpoints and uncertainty reconciliation. Report freshness is separate from stable values.
- Audit logs record operation metadata. Checkpoints, exports, Pine backups, watchlist recovery entries, and simulator records can contain sensitive user content. Newly created files/directories use restrictive modes where the OS supports them.

## Test scope

The machine-readable reports are [TEST_RESULTS.json](TEST_RESULTS.json), [SECURITY_TEST_RESULTS.json](SECURITY_TEST_RESULTS.json), [LIVE_VALIDATION.json](LIVE_VALIDATION.json), and [LIVE_MUTATION_VALIDATION.json](LIVE_MUTATION_VALIDATION.json).

Tests cover credential canaries, malicious URLs, request destinations, authenticated/unauthenticated transport behavior, local HTTP/stdio processes, inert caller text, wrong-layout guards, lost acknowledgements, idempotency, cancellation, emergency-stop timing, exports, and the implemented feature adapters.

Live checks established Chrome launch/debugger access and read access to the selected account's chart, layouts, alerts, watchlists, Pine list, templates, and public market endpoints. Temporary copies demonstrated distinct saved identities and source metadata preservation. Symbol/timeframe changes and save verified on a temporary copy. Some source/copy comparisons reported differing study inputs; the strict guard remained in place. TradingView substituted a different chart venue for a requested NASDAQ instrument, and the exact-symbol guard refused success.

Alert creation was not established: the tested request and a native request-API control returned `invalid_request`. Therefore alert creation/activation/delivery and the complete combined copy-and-alert workflow are not certified as working on a live account by this review.

## Remaining boundaries

A trusted client can deliberately request private Pine source, chart/account text, screenshots, and alert configuration. Its model provider can receive those outputs. Redaction cannot identify every secret or remove text from screenshots. Read-only mode limits state-changing tools; it is not an information-disclosure sandbox and does not suppress audit records or requested exports.

A trusted installed server can access its own process environment. Function-source checks are defense in depth, not a sandbox against malicious replacement source. Loopback CDP itself has powerful browser privileges; protect the machine and dedicated profile. Browser-managed login data is stored by Chrome in that profile and is outside the public release.

The browser and TradingView run their own network code, which this server does not firewall. Third-party service behavior, future source revisions, complete saved-chart fidelity, every optional account capability, and Windows execution remain outside the proven scope. Private API changes can break adapters. Keep failed/unknown verification visible and reconcile before retrying a submitted write.

See [the security policy](../SECURITY.md) to report vulnerabilities and [the separate upstream review](UPSTREAM_SECURITY_REVIEW.md) for pinned third-party research findings.
