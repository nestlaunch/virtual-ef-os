# Virtual Executive Function Assessment Agent Guide

This file extends the shared rules in the workspace-root `AGENTS.md`. Its functional-cognition purpose, fictional-data requirement, and simulated-phone architecture take priority for this application.

## Purpose

This app is a browser-based occupational therapy simulator for digital community skills and functional cognition. It should help patients practise realistic phone-based tasks safely, while giving clinicians observable evidence about sequencing, attention, planning, judgement, error awareness, cue use, and task switching.

Treat this as a clinical training and assessment prototype, not a diagnostic tool.

## Read First

1. `README.md` for product direction, clinical purpose, future backend direction, and assessment model.
2. `ARCHITECTURE.md` for current source layout, state ownership, data flow, and extension rules.
3. `src/state/seedData.js` before changing task content, messages, appointments, or rules.
4. `src/state/VirtualOSContext.jsx` before changing scoring, metrics, persistence, or global navigation.
5. Relevant `src/features/<feature>/` folder before changing a simulated app.

## Knowledge To Product Translation

Clinical knowledge should be translated through explicit app behavior:

- Functional cognition concepts become observable events, not vague labels.
- Safety judgement becomes realistic prompts, confirmations, scam/privacy cues, and review steps.
- Digital community skills become simulated workflows using fictional data.
- Therapist interpretation should come from process metrics plus admin notes, not from a single automated score.

When adding a module, define:

1. Clinical skill being practised or observed.
2. Patient-facing workflow.
3. Admin checklist items.
4. Metrics captured.
5. What errors are clinically meaningful.
6. What data must remain fictional.

## Current Structure

- `src/app/`: app shell and top-level workflow.
- `src/features/`: simulated phone apps, admin-facing views, and system UI.
- `src/state/`: seed data, reducers, scoring, session state, metrics, persistence, and mode logic.
- `src/services/`: external AI/service calls.
- `worker/`: Cloudflare Worker direction.
- `migrations/`: D1 database schema direction.
- `guide/`: admin and user-facing guidance.
- `Reference/`: source references only; do not treat as runtime source.

## Boundaries

- Keep clinical/domain state in `src/state/`, not hidden inside UI components.
- Keep view-only state local to the relevant component.
- Keep app-specific UI inside `src/features/<feature>/`.
- Avoid cross-feature imports unless the dependency is a shared primitive or explicit service.
- Do not put admin controls inside patient-facing screens unless the mode explicitly requires it.

## Safety And Privacy Rules

- Do not use real patient data, names, NRICs, phone numbers, exact addresses, bed numbers, or appointment details.
- Use fictional brands and fictional sensitive data unless permission is explicitly documented.
- Clearly separate Learn, Practice, and Assessment modes.
- Do not present outputs as diagnosis, capacity decisions, discharge decisions, or validated clinical scores unless a formal validation path exists.
- If AI is used, provide fallback behavior and make failures non-blocking for the core task.

## Production Readiness Checks

Before calling a change production-ready:

- `npm run build` passes.
- New clinical behavior has matching checklist/metric logic.
- Reset behavior is deterministic and clears relevant persisted state.
- Patient and admin views remain clearly separated.
- Sensitive workflows use fictional data.
- Any backend persistence has an audit model and data-minimization rationale.

## Preferred Next Documentation

Add these when the app is prepared for showcase or pilot:

- `docs/product-brief.md`
- `docs/clinical-basis.md`
- `docs/safety-privacy.md`
- `docs/demo-script.md`
- `docs/production-readiness.md`
