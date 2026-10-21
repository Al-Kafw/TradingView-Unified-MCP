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
