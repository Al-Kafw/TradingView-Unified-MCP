# Market data adapters

The market module provides **seven read-only tools**. Four feature families use TradingView's public scanner service with no account credentials; the native readers use the chart and visible page already selected through the local browser connection. No live TradingView endpoint or authenticated browser was exercised while implementing this module. The validation described below is offline.

## Public data transport boundary

`src/core/public-market.mjs` is a deliberate exception to the MCP process's local CDP networking: it can request public data from **`https://scanner.tradingview.com` only**. It does not alter the authenticated browser transport. Scanner POST requests have a known browser CORS limitation in the reviewed reference implementation, so the module uses a separate, credential-free Node request rather than extracting a browser cookie or bypassing browser security. The reference explicitly documents this distinction in [Ferrox data.js](https://github.com/FerroxLabs/tvcontrol/blob/a8d3dfc97621e22b8b7c71e617b134c5e35882ee/src/core/data.js#L591-L625).

The public client constructs its own URL, request body and headers. MCP arguments cannot supply a URL, port, header map, cookie, token, authentication file or environment-variable name. The only request families are:

| Family | Fixed destination | Caller-controlled data |
| --- | --- | --- |
| Scanner | `POST https://scanner.tradingview.com/<market>/scan` | An enumerated market, validated exchange-qualified symbols, approved columns, bounded filters, sort and pagination |
| US hotlist | `GET https://scanner.tradingview.com/presets/US_<preset>?label-product=right-hotlists` | One of nine enumerated presets; the row limit is applied to the result |

The transport always uses `credentials: 'omit'`, `redirect: 'error'` and `cache: 'no-store'`. It supplies fixed JSON/TradingView Origin and Referer headers. It has no cookie jar, credential loader, browser cookie call, Authorization header or authenticated retry. An unexpected final response URL is rejected. Neither response bodies from unsuccessful requests nor raw transport error messages are reflected into tool errors.

The default limits are 15 seconds, 128 KiB for a serialized request, and 4 MiB for a streamed response. A caller can cancel an outstanding query. An excessive Content-Length is rejected before reading; streamed responses are counted and cancelled once over the limit. Requests are limited to 100 symbols, 100 rows and 20 filters, with a closed list of column names and timeframe suffixes. These are implementation limits, not claims about TradingView's service quotas.

TradingView receives the requested symbols, scanner filters, ordinary connection metadata and the request's fixed headers. No session credential is collected by this adapter. The browser itself may still perform normal TradingView traffic; this module is not a firewall for the whole browser or the user's MCP client. Its output is returned to the invoking MCP client like other tool results.

## Implemented tools

| Tool | Data source and behavior | Limits and interpretation |
| --- | --- | --- |
| `quote_get` | With an explicit symbol, requests one public scanner quote without changing a chart. Without a symbol, reads the selected chart's latest loaded OHLCV candle. | Both sources are named explicitly. A loaded candle close is not a bid/ask quote or a real-time tick subscription. An unknown public symbol produces `SYMBOL_NOT_FOUND`. |
| `quote_batch` | Requests up to 100 exact symbols from the public global scanner and preserves the caller's symbol ordering. | Missing symbols and null last prices remain explicit. Numeric zero is preserved. No browser connection is needed. |
| `screener_scan` | Runs a bounded scanner query over global, america, crypto, forex, futures or cfd. | Approved fields include OHLCV, change, capitalization, instrument type/description and selected technical columns. Filters use exact equality or numeric inclusive bounds. Arbitrary API fields and destinations are refused. |
| `market_technical_summary` | Reads service-provided recommendation scores, RSI, MACD, close and change for exact symbols and approved timeframes. | Daily fields have no suffix; other fields use the selected timeframe suffix. Missing fields remain null, with `incomplete_items` and a false `complete` result. No local signal calculation or trade recommendation is inferred. |
| `hotlist_get` | Reads an enumerated US public preset and projects fields by the service's field-index mapping. | Returns up to 20 rows, with source, optional service timestamp and truncation metadata. The nine presets concern volume, percentage change, range and gaps. |
| `market_depth` | Reads one already-visible depth panel. | Requires explicit bid/ask labels and unambiguous numeric values. Does not open a trading panel or call broker methods. Instrument binding to the selected chart is explicitly unverified. |
| `market_signal_snapshot` | Sequentially combines a native loaded-candle quote with the native Data Window study reader. | Checks symbol, timeframe and layout before/after collection and against study metadata. Mismatched study results are discarded. Partial study coverage remains partial. No news or external sentiment data is included. |

### Public quote and scanner integrity

Scanner responses must contain an array of rows with an exchange-qualified symbol, exactly one value for each requested column, scalar bounded values, no duplicate symbol rows and no unrequested symbols when a symbol list was supplied. The result contains the requested column names rather than depending on a caller to remember array indexes. Missing symbols remain in `missing_symbols`; they are not synthesized as zero-price rows.

Pagination uses an end-exclusive range, `[offset, offset + limit]`, so one row starts with `[0, 1]`. The inspected upstreams disagree here: iliaal subtracts one, while [firy's request shape](https://github.com/firyomaefx/tradingview-chrome-mcp/blob/d20f0acf7a2d888ef7fe9304178fae35c233c42c/src/adapters/marketdata/screener.ts#L175-L188) uses the exclusive end. The [TradingView-Screener publisher's versioned API documentation](https://shner-elmo.github.io/TradingView-Screener/3.2.2/tradingview_screener/query.html) independently supports the exclusive boundary. That additional document was consulted only for pagination semantics; its package was not audited, installed or imported.

`quote_batch` and the explicit-symbol `quote_get` report `symbols_complete` separately from `complete`. A returned symbol with a null last price is not a complete quote. Missing optional numeric values remain null. This module does not establish the exchange's data delay, exchange timestamp, entitlement or current account-specific quote freshness. The service response's retrieval time is not relabeled as a market timestamp.

Technical summary scores are returned as numeric TradingView fields. The module does not convert them to a recommendation to buy or sell, combine them with strategy metrics, or claim they came from the Strategy Tester. The public market service and the loaded chart can have different data availability and timing.

### Native quote and depth integrity

The native quote uses the chart's loaded main-series bars. When the resolved series symbol is available and differs from the selected chart symbol, it returns `MARKET_DATA_NOT_READY`, avoiding attribution of the old instrument's bars to a newly selected symbol. If the resolved symbol is unavailable, `symbol_binding_verified` is false. Missing bar access is a capability error, not an empty successful quote.

Depth extraction accepts an ASCII decimal point and optional comma-separated thousands groups. Values such as a localized `1,23`, suffixed quantities or currency-decorated strings are omitted rather than guessed. Bid and ask come from explicit row labels; row position alone never determines a side. Unparsed and unclassified row counts are returned, and partial results are labeled. The tool refuses multiple matching visible panels and returns a capability error if none is open.

The depth panel can belong to a separate broker or instrument selector. The module therefore reports the selected chart's symbol only as context and always returns `symbol_binding_verified: false` for depth. It does not present that context as a verified exchange order book for the requested instrument. The UI selectors remain undocumented TradingView details and may stop matching after site changes.

The combined native snapshot is a sequential observation. Agreement on layout, symbol and timeframe reduces obvious mismatches but is not an atomic market snapshot or proof that no pane changed between reads. The result states that limitation and carries the underlying source labels.

## Deliberate gaps

- No Yahoo, Nasdaq RSS, Supabase, Redis, embedded OpenAI/Anthropic client or third-party sentiment service.
- No generic public HTTP request, caller-selected endpoint or credential-bearing market-data fallback.
- No real-time websocket quote subscription or guarantee that all exchanges/timeframes are supported by the public scanner.
- No scanner screener UI creation/saving; `screener_scan` is a service query.
- No native news reader is registered: the audited known news implementations used outside RSS providers, and an exact supported TradingView-only news source was not established.
- No broker connection, order placement, depth-panel activation, or verified depth instrument binding.
- No local backtest engine. The Strategy Tester adapters are a separate feature family with their own identity/freshness requirements.

These gaps are documented instead of registering tools whose only implementation is an unsupported placeholder.

## Source and attribution

The module is separately authored. It uses reviewed API names, data shapes and workflow concepts; it does not import or execute upstream modules. The full license notices and commit inventory are in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) and [UPSTREAMS.json](UPSTREAMS.json).

| Reference | Pinned source | Pattern used / excluded |
| --- | --- | --- |
| FerroxLabs/tvcontrol | [data.js at a8d3dfc97621e22b8b7c71e617b134c5e35882ee](https://github.com/FerroxLabs/tvcontrol/blob/a8d3dfc97621e22b8b7c71e617b134c5e35882ee/src/core/data.js) | Fixed public quote scanner endpoint and eight quote columns; native bar access; depth DOM selectors. Row-order side guessing and external-provider fallbacks are not inherited. |
| iliaal/tradingview-mcp | [screener.js at 233f29e180031291dacac4c4cc2736a8dde161be](https://github.com/iliaal/tradingview-mcp/blob/233f29e180031291dacac4c4cc2736a8dde161be/src/core/screener.js) | Scanner markets, columns and filter/sort request shape. The source credits a QuantAgentLabs predecessor; that separate repository was not independently audited. |
| iliaal/tradingview-mcp | [hotlist.js at 233f29e180031291dacac4c4cc2736a8dde161be](https://github.com/iliaal/tradingview-mcp/blob/233f29e180031291dacac4c4cc2736a8dde161be/src/core/hotlist.js) | Nine fixed US preset names and fields/symbols response mapping. The source credits lnv-louis/tradingview-mcp; that separate repository was not independently audited. |
| firyomaefx/tradingview-chrome-mcp | [ta.ts at d20f0acf7a2d888ef7fe9304178fae35c233c42c](https://github.com/firyomaefx/tradingview-chrome-mcp/blob/d20f0acf7a2d888ef7fe9304178fae35c233c42c/src/adapters/marketdata/ta.ts) | Technical-summary feature concept and TradingView field names only. No source copied; unresolved upstream license file status. Cloud caching and provider clients excluded. |

## Offline validation

`tests/market.test.mjs` contains **26 passing tests**, executed with:

```sh
node --test --test-isolation=none tests/market.test.mjs
```

The tests replace fetch with a controlled fake and run this project's fixed native reader against synthetic page fixtures. They cover exact destinations/headers/payloads; dummy credential canaries; hostile URLs and invalid symbols; response redirects; request/stream bounds; sanitized HTTP, parse and transport errors; cancellation and timeout; symbol/column identity; one-row and adjacent-page range boundaries; numeric zeros/nulls; exact hotlist field mapping; loaded-series mismatches; ambiguous depth data; and snapshot context changes.

These tests provide evidence for the implemented guards and result semantics. They do not demonstrate current TradingView endpoint availability, bypass subscription requirements, or validate the selectors in a live authenticated browser. A live acceptance run should remain separately labeled and should begin with read-only queries.
