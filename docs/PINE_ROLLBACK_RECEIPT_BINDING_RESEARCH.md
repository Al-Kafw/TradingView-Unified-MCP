# Offline Pine rollback receipt-to-baseline identity research

Base: `98a9a94` (557/557 tests). This is a **separate offline research branch**; not live deployed or consumer approved.

## Failure mode closed

The previously successful in-memory `pine_remove_qa_study` receipt did not include the QA layout ID and original Volume baseline entity ID. A later read-only reconciliation could therefore accidentally pair the receipt with a different expected RestoreLab baseline. Also, the expected Volume study's input list could be omitted, in which case the existing browser matcher treats it as an optional check.

## Bound checks

- A successful rollback receipt now exposes `rollback_layout_id` and `baseline_entity_id`, both sourced from the already-authorized request and only emitted after exact live-study cleanup checks.
- The **read-only** `reconcilePineQaRollback` checks receipt layout ID against the expected layout, receipt Volume entity ID against the expected Volume entity ID, and distinct removed/baseline IDs, before any browser access.
- The expected Volume input list must be present, nonempty, uniquely keyed, bounded, and contain observable scalar values. Unknown/complex values fail closed; no value is invented.
- Eight negative regression cases cover missing, conflicting or mismatched receipt/baseline identity and incomplete inputs. No new MCP tools, chart actions or cloud operations are added.

## Limits

Receipt correlation does not establish cryptographic authenticity. A matching browser baseline does not prove remote TradingView cloud persistence, full restoration of Pine draft/library state, or correctness of compiled signals. This research does not authorize saving, reload, compilation, chart writes or protected layout changes.
