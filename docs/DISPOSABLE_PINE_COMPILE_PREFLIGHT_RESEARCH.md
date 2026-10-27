# Disposable Pine compilation baseline preflight — offline research only

Based on Pine Editor provenance research `f495669`; accepted MCP remains `2a5fb76`.
The separately reported 27 October live provenance acceptance (ES1! 5M,
Combined Research QA `DobiYFrf`, script version 4.0) is read-only evidence.
It does NOT authorize compilation, Pine source edits or reconfiguration.

## Vulnerability closed

The fixed-source `pine_compile_qa_draft` handler already requires a native
unsaved draft, exact fixed source, clean authorized QA layout, unique Add-to-chart
button and post-click study preservation. Before this research guard, it did
not explicitly require all of these *pre-click* native chart conditions:

- Replay observably stopped; autoplay observably off (unknown fails closed).
- An accessible, empty native drawing collection.
- Exactly one valid, addressable preexisting `Volume` study; no other studies.

This change adds these checks inside the handler before clicking. Nine focused
negative fixtures assert zero compile clicks when those states are unsafe.
Full tests and static/release audits must pass before research publication.

## Limits and promotion

This is NOT live tested and does not approve any mutation. Existing guard
policy continues to require exact approved QA restore-lab identity, explicit
opt-in and expected draft/source binding SHA-256. It does not provide a complete
saved-layout-restoration proof, chart signal correctness, or Pine compile
success. The archived Replay causality guard research remains independent.

A true disposable Pine compile requires an explicitly authorized, open,
clean RestoreLab that can be independently restored and audited. Never reuse
Combined Research QA or protected Pine scripts for disposable QA compilation.
