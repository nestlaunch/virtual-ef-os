# Virtual Executive Function Assessment - Architecture

## Purpose
This application simulates a mobile OS workflow to assess executive function under realistic multitasking pressure.

Primary goals:
- Present clinically relevant scheduling inputs across `SMS`, `WhatsApp`, and `Calendar`.
- Measure planning quality (omissions, rule breaks, context switching, perseveration).
- Preserve interaction history for later review.

## File Organization

```text
src/
  app/
    App.jsx                    # App shell, app switching, top-level animation
  features/
    calendar/
      CalendarApp.jsx          # Month navigation, date selection, event editor, time edits
    home/
      HomeScreen.jsx           # OS home launcher layout (4 apps + date/time)
    messages/
      SMSApp.jsx               # Google Messages style inbox + thread view
    settings/
      SettingsApp.jsx          # Rules + hidden EF metrics snapshot
    system/
      Dock.jsx                 # Back/Home/Tabs controls
      StatusBar.jsx            # Simulated status bar (time/network/battery)
    whatsapp/
      WhatsAppApp.jsx          # Chat list/thread, unread logic, reply tracking, persistence
  state/
    seedData.js                # Seed conversations/events/rules + date metadata
    VirtualOSContext.jsx       # Global state, reducer, metrics, app navigation actions
  main.jsx                     # React entrypoint
  styles.css                   # Global styling and component visual system
```

## Runtime Model

- `VirtualOSContext` is the single source of truth for:
  - current app and navigation history
  - calendar events
  - executive-function metrics
- Feature components dispatch actions through context APIs instead of mutating shared state directly.
- WhatsApp conversation state is persisted in browser `localStorage` using key:
  - `virtual-os-whatsapp-state-v1`

## Data Flow

1. `seedData.js` provides baseline clinical stimuli (doctor/polyclinic SMS, WhatsApp threads, rules).
2. UI actions dispatch reducer events in `VirtualOSContext`.
3. Reducer updates state and logs behavior into hidden metrics.
4. `SettingsApp` surfaces metrics snapshot for review.

## How To Extend

- Add new tasks/chats/messages in `state/seedData.js`.
- Add any new clinical metric in `state/VirtualOSContext.jsx` reducer + snapshot rendering in `features/settings/SettingsApp.jsx`.
- Keep app-specific UI logic in `features/<feature-name>/` and avoid cross-feature direct imports.

## Architecture Lessons From This Build

1. Separate **domain state** from **view state**
- Domain state (appointments, metrics, completion timestamps) belongs in the reducer/context.
- View state (which chat is open, draft input text, overlay visibility) can stay local in feature components.
- Result: easier reset/replay and cleaner mental model.

2. Prefer a **single source of truth** for assessment scoring
- Checklist and scoring should derive from central state (`VirtualOSContext`) instead of component-only assumptions.
- This avoids inconsistencies such as UI showing completion while evaluator logic says pending/error.

3. Use **tri-state status** for evaluations (`Completed`, `Pending`, `Error`)
- Binary pass/fail hides important clinical signal.
- Distinguishing `Error` (wrong entry) from `Pending` (missing entry) improves therapist interpretation.

4. Design for **deterministic resets**
- Reset behavior must not depend on a component being mounted.
- Clearing reducer state plus persisted storage (`localStorage`) from a central reset path makes restart reliable.

5. Build **resilient AI integrations**
- Gemini should be treated as non-deterministic I/O.
- Add guardrails: placeholder-key checks, model fallback, parse-safe outputs, and graceful fallback replies.
- Never let API failures break core task flow.

6. Persist only what needs continuity
- Persist WhatsApp conversational history/unread counts because users context-switch often.
- Keep transient UI state (active tab, temporary overlay) non-persistent.
- This balances realism with controllability.

7. Encode workflow as explicit actions/events
- Actions like `TRACK_WA_REPLY`, `TRACK_WA_CONFIRM`, `MARK_COMPLETED` provide an audit trail.
- Event-style reducer design makes logic observable and easier to debug than ad-hoc state mutations.

8. Refactor by feature boundaries, not file size
- Grouping by `features/`, `state/`, and `app/` improved maintainability and reduced import churn.
- Feature-oriented structure scales better for multi-app simulation UIs.

9. Validate architecture changes with fast feedback loops
- Compile checks (`npm run build`) after each major change catch regressions early (import paths, duplicate keys, stale modules).
- Small, frequent verification is cheaper than late-stage debugging.

10. Treat UX as part of architecture in assessment tools
- Instruction flow, guided tour, and therapist-facing checklist are not just UI polish; they are workflow architecture.
- Good onboarding and observable outcomes reduce operator error and improve data quality.

## Verification

After structural changes run:

```bash
npm run build
```

This ensures all imports resolve and bundled SPA behavior remains intact.
