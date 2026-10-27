# Pine source line-ending provenance — research only (27 Oct 2026)

Accepted MCP QA baseline `2a5fb76` remains unchanged. This branch adds only **read-only** comparison metadata to existing Pine source responses. No TradingView chart, Replay state, Pine buffer, saved script, or settings were modified.

## Scoped live observation (read-only)

On a disposable research chart, independent reads of the visible Pine editor and cloud saved script version 3.0 matched native script ID/version. Editor title was unavailable, but the authoritative native facade bound to the visible editor. The editor and saved source each had 2,442 lines. The saved source used 2,441 CRLF pairs; the editor used 2,441 LF endings. Raw UTF-8 text hashes differed; **replacing only CRLF with LF produced exact equality**. Repeated raw hashes were stable. Thus the observed raw-hash mismatch was line-ending formatting, not proven code drift.

## Design

Expose `source_sha256_lf_normalized` and `source_line_endings` alongside the existing `source_sha256` when source is returned by `pineRead`/`pineLibraryRead`. This allows *read-only* parity comparison without suppressing raw differences. Crucially, mutation preconditions continue using the existing **exact source** hash, unchanged. Do not automatically use normalized hashes to authorize writes or infer editor compile success. Mixed/unpaired CR endings remain visible.

## Acceptance limits

This is **offline research only** until the new response fields are tested in the running MCP and direct ChatGPT connector. It does not remove the missing editor-title blocker or authorize compilation. Keep the accepted capability statuses unchanged. Do not equate canonical LF text equality with compiled-runtime equality, chart study identity, or signal correctness.
