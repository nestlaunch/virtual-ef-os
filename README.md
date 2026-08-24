# Virtual Executive Function Assessment

A browser-based occupational therapy prototype for teaching and assessing digital community skills through a realistic simulated mobile interface.

The long-term goal is to help patients safely practise digital tasks that commonly involve sensitive information, such as appointments, messaging, payments, banking prompts, maps, healthcare portals, and identity workflows, without using real personal data or real third-party apps.

## Why Browser First

Some clinical and secure care settings restrict patients and staff to managed laptops. This project is therefore designed to run fully inside a web browser while visually simulating an Android-style phone interface.

The patient can interact with a phone-sized virtual device using a laptop mouse, trackpad, and keyboard. The admin can observe performance, review checklist items, and interpret functional cognition patterns without requiring installation on a personal smartphone.

## Current Prototype

The existing app is a Vite and React single-page application that presents a simulated mobile operating system inside a browser-first clinical workspace. It includes:

- Android-style phone shell
- Status bar and navigation dock
- Home screen and app switcher
- Instructions
- Calendar task environment
- SMS-style appointment messages
- WhatsApp-style conversations
- Maps module
- Bank module
- Settings and hidden metrics review
- Admin workspace panel
- Learn, Practice, and Assessment modes
- Admin checklist scoring
- Quick cue logging
- Admin notes
- Live interaction metrics

The prototype currently focuses on executive function demands around scheduling, messaging, rule-following, context switching, and handling realistic digital distractions.

## V2 Direction

Version 2 should evolve the prototype into two coordinated browser views:

- **Patient simulator:** a pixel-close Android interface rendered inside the browser.
- **Admin workspace:** a laptop-friendly panel for observation, cueing, checklist scoring, notes, and session metrics.

The Android replica is a first-class requirement. System UI elements such as the status bar, navigation controls, home screen, app switcher, app icons, keyboard, permission dialogs, notifications, confirmation sheets, and loading states should be implemented as reusable Android-style primitives.

The simulation should avoid copying protected real-world banking, healthcare, government, or messaging app branding unless permission is obtained. The safer default is pixel-close interaction fidelity with fictional app names and fictional sensitive data.

## Clinical Purpose

The app is intended to support occupational therapy work around digital community participation and functional cognition.

Target skill areas include:

- Reading and extracting key information from digital messages
- Scheduling appointments accurately
- Managing competing digital inputs
- Moving between apps without losing the task goal
- Recognising safety-sensitive prompts
- Avoiding impulsive confirmation of risky actions
- Using digital tools for community access
- Recovering from errors
- Requesting help appropriately

The product should separate education from assessment. Patients should be able to practise in a supportive mode before entering a more formal observation or assessment mode.

## Suggested Learning Modes

Future versions should support three modes:

1. **Learn Mode**
   Guides the patient toward the correct option with visible cues.

2. **Practice Mode**
   Only allows progression after the correct option is selected.

3. **Assessment Mode**
   Free mode with no blocking guidance; observe natural performance.

## Functional Cognition Metrics

The app should measure more than whether a patient completed a task. The clinically useful signal often sits in the process.

Potential metrics include:

- Time to first action after instruction
- Time spent on each screen
- Delay before typing after focusing an input
- Number of app switches
- Number of back, home, and app-switcher actions
- Wrong taps or irrelevant clicks
- Repeated checking behaviour
- Deleted or corrected text
- Missed appointment details
- Rule-breaking when scheduling
- Overlapping or unsafe calendar entries
- Hint requests
- Admin cues
- Task abandonment
- Confirmation without reviewing sensitive details
- Missed scam, privacy, or safety warning cues

Because the browser version uses laptop input, motor interaction findings should be interpreted carefully. The strongest browser-based metrics are cognitive and behavioural: attention, sequencing, processing speed, memory, judgement, inhibition, cognitive flexibility, and error awareness.

## Checklist Structure

Each module should eventually have an admin-facing checklist. A simple scoring scale could be:

- `0` = Unable
- `1` = Completes with full assistance
- `2` = Completes with partial cues
- `3` = Completes independently with delay or minor errors
- `4` = Completes independently, accurately, and safely

Checklist items can be tagged to cognitive domains:

- Attention
- Working memory
- Sequencing
- Planning
- Processing speed
- Cognitive flexibility
- Inhibition
- Safety judgement
- Error awareness
- Problem solving
- Visual scanning

## Proposed Product Structure

Recommended browser routes for a fuller product:

```text
/patient/session/:code
  Patient-facing simulated Android environment.

/admin
  Admin dashboard for patients, modules, sessions, PINs, devices, and reports.

/
  Patient join screen and browser-based Android simulator.
```

The patient-facing screen should stay simple and immersive. Admin controls should be kept out of the patient's view unless the session is explicitly being demonstrated.

## Session Joining

The admin route generates a random 6-letter session PIN. Patients join from `/` by entering the PIN. Each session is designed to allow up to 6 connected devices.

In the current browser prototype, PIN validation and device counting are stored locally in the browser. For real multi-device sessions, this should move to Cloudflare:

- Durable Object per session PIN for live session state
- D1 for session records and audit trail
- R2 or Analytics Engine for raw event telemetry
- WebSocket or polling channel for joined device status

## Cloudflare Backend Direction

The standard frontend build connects to the deployed Daily Digital Worker at
`https://daily-digital.kuanghong.workers.dev`, so Online mode is available in
local Vite development, local preview builds, and the deployed Pages app. Set
`VITE_API_BASE_URL` at build time only when intentionally targeting a different
Worker deployment.

The planned deployment target is Cloudflare. A good backend structure would be:

```text
Browser Android Simulator
        |
        v
Cloudflare Worker API
        |
        +--> D1: users, patients, modules, sessions, checklist scores
        |
        +--> Durable Objects: live session state and ordered event tracking
        |
        +--> Analytics Engine: high-volume interaction telemetry
        |
        +--> R2: assets, replay files, report exports
        |
        +--> Queues: async scoring, summaries, report generation
```

Recommended Cloudflare components:

- **Workers** for API endpoints
- **Hono** as a lightweight Workers API framework
- **D1** for relational clinical and session data
- **Durable Objects** for live session coordination and ordered event streams
- **Workers Analytics Engine** for high-volume event analytics
- **R2** for assets, exported reports, replay files, and optional recordings
- **Queues** for background scoring and report generation
- **Cloudflare Access / Zero Trust** for admin access

Avoid storing every click and keystroke directly in D1. D1 should hold structured records and clinical summaries. Raw event telemetry should be batched and stored in Analytics Engine or R2, with derived summary metrics written back to D1.

## Suggested Backend Data Model

Future D1 tables may include:

```text
organizations
users
patients
modules
module_tasks
task_steps
checklist_items
assessment_sessions
session_checklist_scores
session_summary_metrics
admin_notes
consents
audit_logs
```

Raw session events should include sequence numbers and client-side timing:

```json
{
  "sessionId": "sess_123",
  "seq": 184,
  "timestampClient": 938421.55,
  "timestampServer": "2026-05-31T10:12:44.120Z",
  "eventType": "input_focus",
  "screen": "payment.amount",
  "target": "amount_field",
  "appContext": "SafePay",
  "metadata": {
    "taskStepId": "verify_payment_amount"
  }
}
```

Client timestamps should use `performance.now()` so latency metrics are not distorted by network delay. The backend should still add server timestamps for auditability.

## Privacy And Safety Principles

This app should be designed as if it handles sensitive healthcare-adjacent data.

Important principles:

- Use fictional app brands and fictional sensitive data.
- Do not require real banking, government, identity, or healthcare credentials.
- Separate patient identifiers from raw telemetry.
- Use role-based access for admin views.
- Keep audit logs for record access and exports.
- Define retention rules for raw telemetry and clinical summaries.
- Avoid storing screen recordings unless there is a clear clinical need.
- Make scam and privacy scenarios educational rather than punitive.

## Local Development

Install dependencies:

```bash
npm install
```

Start the local development server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

## Environment Variables

The prototype includes an optional Gemini integration for WhatsApp-style conversation replies.

Create `.env` from `.env.example` and configure:

```text
VITE_GEMINI_API_KEY=your_key_here
VITE_GEMINI_MODEL=gemini-2.0-flash
```

If no valid key is provided, the app should continue to function without AI-generated replies.

For production, do not expose clinical or AI service secrets through `VITE_*` variables. Move any third-party API calls into the Cloudflare Worker and store secrets with `npx wrangler secret put`.

## Cloudflare Backend

Daily Digital now includes a deployable Cloudflare backend foundation:

```text
worker/index.js              Worker API and SessionCoordinator Durable Object
migrations/0001_initial.sql  D1 schema
wrangler.toml                Worker, assets, D1, and Durable Object bindings
```

The Worker serves the built frontend from `dist` and exposes `/api/*` routes for accounts, session PINs, live session actions, and report records.

Core commands:

```bash
npm run build
npx wrangler d1 create daily-digital-db
npx wrangler d1 migrations apply daily-digital-db --remote
npm run deploy:worker
```

After creating the D1 database, copy the returned database ID into `wrangler.toml`.

Current backend routes:

```text
GET  /api/health
GET  /api/accounts
POST /api/accounts
POST /api/login
POST /api/sessions
GET  /api/sessions/:pin/state
POST /api/sessions/:pin/join
POST /api/sessions/:pin/push
POST /api/sessions/:pin/event
POST /api/sessions/:pin/end
POST /api/records
GET  /api/accounts/:id/report
```

The current React app can still run in browser-local prototype mode. The next integration step is replacing local session storage with calls to these Worker routes.

## Project Structure

```text
src/
  app/
    App.jsx
  features/
    bank/
    calendar/
    home/
    instructions/
    maps/
    messages/
    settings/
    system/
    admin/
    whatsapp/
  services/
    geminiClient.js
  state/
    seedData.js
    VirtualOSContext.jsx
    v2Assessment.js
  main.jsx
  styles.css
```

The main state model lives in `src/state/VirtualOSContext.jsx`. Seed clinical scenarios live in `src/state/seedData.js`. Feature-specific UI should stay inside `src/features/`.

## MVP Roadmap

Recommended next milestones:

1. Connect the React session/account flows to the Worker API.
2. Connect live admin/user updates to the SessionCoordinator Durable Object.
3. Persist final Learn, Practice, and Assessment report-card records to D1.
4. Move optional AI conversation calls into Worker secrets.
5. Add admin authentication and role-based route protection.
6. Add report export to PDF.
7. Add privacy, consent, retention, and audit controls.

## Design North Star

The app should feel like a safe clinical simulation of everyday digital life.

Patients should experience realistic digital tasks without exposure to real sensitive systems. Admin users should receive structured, defensible information about functional cognition: not just whether a patient finished the task, but how they planned, hesitated, corrected, switched attention, handled safety cues, and recovered from errors.
