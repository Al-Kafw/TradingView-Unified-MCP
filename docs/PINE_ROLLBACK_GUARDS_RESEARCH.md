# Disposable QA Pine rollback — offline guard research (28 October 2026)

Source base: `3ccdeff` (541/541 tests). This branch is an **independent offline-only** rollback hardening candidate. It is not merged into `qa/mcp-safety-p2-20261024` and is not active in either tunnel.

## Scope

- The exact approved `pine_remove_qa_study` handler now refuses removal when native Replay/autoplay state is unknown or active, or drawings are nonempty/unknown.
- The handler still permits a **dirty QA layout**, because cleanup of an added disposable indicator can legitimately leave unsaved changes.
- After removal it rechecks native layout ID, Replay/autoplay, empty drawings, and exact Volume-only study list before returning `live_study_baseline_restored: true`.
- If `removeEntity` throws after submission, return `ROLLBACK_UNVERIFIED` with `mutation_attempted: true`. Never auto-retry or claim restoration.
- Ten additional synthetic negative regression fixtures check no preflight removal and no false success after state drift or a thrown removal.

## Limits and approval

This verifies *in-memory chart study cleanup only*. It does **not** verify persisted saved-layout restoration, Pine cloud library correctness, or full recovery of a failed live compile. A real disposable QA RestoreLab, explicit authorization, and independent multi-read saved-baseline verification are required before any live mutation. Do not authorize compilation, mutation, or consumer promotion based on these offline tests. No protected charts, Replay cursors, active MCP tunnels, or existing research branches are modified by the installer.
