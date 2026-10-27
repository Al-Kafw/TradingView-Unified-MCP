# Native Pine editor identity / source parity — read-only research

Base: `research/mcp-pine-source-line-endings-20261027` at `6102af3580f4ed090988c365bfd10149671a69e3`; accepted baseline `qa/mcp-safety-p2-20261024` remains at `2a5fb76f2e058d2b050ef37278dbd6f2b53f909e`.

## Motivation
On Combined Research QA (`DobiYFrf`), `pine_get_binding` verifies a unique native facade, exact script ID/version and unmodified editor source, but the DOM title selector returns `null`. The independently saved script name is available; its CRLF source matches the editor's LF source after normalization. A library name is not a substitute for an actually visible editor title and must never bypass the existing `pine_compile` title guard.

## Change
Add a separate **read-only** `pine_get_editor_provenance_qa` composite tool, requiring exact target/layout, clean saved layout, non-draft/non-modified native ID/version, independently fetched saved version, matching canonical LF-source hashes and stable bracketed layout/editor reads. Return hashes, source-endings metadata and separate `visual_editor_title` and `library_name` fields **without returning source**. Report `source_mismatch` or `blocked` instead of inventing successful verification. Never approve writes or compilation.

## Limits
Offline research only. Passing tests do not prove TradingView can be compiled safely, that every browser/editor version exposes the same native facade, that matched normalized source implies compiled byte identity, or that charts are signal-correct. Keep all existing Pine write guards and accepted MCP code unchanged until separate user-authorized live QA.
