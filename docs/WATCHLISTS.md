# Watchlist behavior and limits

The browser adapter uses only source-backed TradingView requests under `https://www.tradingview.com/api/v1/symbols_list/`: custom-list listing/detail, API-active list, custom-list creation, append and remove. Authentication is attached by the browser; the adapter never reads cookies, imports authentication files or creates a Node Cookie header. Source provenance and notices are in [UPSTREAMS.json](UPSTREAMS.json) and [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).

## Implemented operations

- `watchlist_list`, `watchlist_get`, `watchlist_get_active`: exact IDs, symbols, section headers, order and content fingerprints. The API-active list may differ from the rendered sidebar.
- `watchlist_create`: duplicate-name prevention, durable idempotency, new-ID verification, exact name/entries/order read-back and an independent account listing.
- `watchlist_add`, `watchlist_add_bulk`, `watchlist_remove`, `watchlist_remove_bulk`: explicit stored entries and independent verification. A missing remove target prevents the entire requested removal. Bare tickers are refused; use exchange-qualified symbols.
- `watchlist_set_entries`, `watchlist_reorder`: verified removal followed by append to reproduce exact requested order. Reorder must preserve the full multiset of symbols and section headers. Both operations retain the same list ID/name.
- `watchlist_import_preview`, `watchlist_import`: explicit entry data rather than arbitrary filesystem reads. Merge retains existing order and appends missing entries. Replace uses the full replacement workflow.
- `watchlist_export`: JSON or CSV through the safe local artifact store, preserving section-header positions.
- `watchlist_reconcile`: read-only inspection of an interrupted create/replacement checkpoint and the current account state.

## Reorder and replacement are multi-step operations

No reorder endpoint was guessed. Replacement and reorder use the known remove and append endpoints, with a separate empty-list read-back before append and an exact complete-order read-back afterwards. **The watchlist is temporarily empty between these operations.** This is not an atomic operation; another user or browser session can also edit the list during the process.

A durable checkpoint records the original entries, desired entries and submission stage before each mutation. If a request is interrupted or returns an uncertain result, the server does not automatically retry or roll back. Reusing the same idempotency key reads the current state: a completed desired state can be reconciled; another state is reported as uncertain. `watchlist_reconcile` returns the saved before/desired entries so a caller can review recovery before issuing a new deliberate request.

For stronger preconditions, pass `expected_entries_sha256` from a recent `watchlist_get`. Name and exact order are independently checked after changes. A successful HTTP response alone is never treated as completed membership mutation.

## Deliberate gaps

No verified rename-list or delete-list endpoint was found in the inspected upstream watchlist modules. These operations are documented gaps and are not registered as placeholder tools. List contents can be explicitly cleared with `watchlist_set_entries` and an empty entries array; this does not delete the saved list or rename it.

Watchlists larger than 2,000 requested entries are outside the mutation/import limit. Existing reads support up to 10,000 entries per list. Duplicate instrument entries are refused; repeated section headers are retained in replacement requests and must match the observed result exactly. The page can still reject a symbol or header; failed verification is returned honestly.

## Validation status

Nineteen offline tests use a fake browser request layer. They cover authenticated-error envelopes without body reflection, exact-ID targeting despite a different active list, URL/ID/entry rejection, array payloads, ignored writes, order/section preservation, preconditions, duplicate names, durable idempotency, lost responses and partial replacement recovery. These tests do not establish live TradingView compatibility. No authenticated browser call or upstream package execution was performed for this validation.
