# SPECIFICATIONS — Virtual Executive Function Assessment

> Version 1.0 · June 2026  
> Status: Draft for review

---

## 1. Overview

Virtual Executive Function Assessment ("Daily Digital") is a browser-based clinical simulation tool for occupational therapists. It presents a simulated Android phone interface inside a desktop browser so patients can practise realistic digital tasks — scheduling, messaging, banking, maps, identity verification — without touching real sensitive systems.

The platform has two coordinated views:

- **Patient Simulator** — pixel-close Android interface in the browser window.
- **Therapist Workspace** — laptop-friendly admin panel for session control, observation, cueing, checklist scoring, and report review.

This document specifies the target architecture, structural improvements, and AWS-native backend that should replace the current Cloudflare-oriented design.

---

## 2. Current State Summary

### 2.1 What Exists

| Layer | Technology | Notes |
|---|---|---|
| Frontend | React 18 + Vite + Tailwind | SPA, feature-folder structure |
| State | React Context + localStorage | Single reducer in VirtualOSContext.jsx |
| Backend API | Cloudflare Worker (Hono) | Pages Functions proxy in `functions/api/` |
| Database | Cloudflare D1 (SQLite) | Two migrations applied |
| Live session | Durable Objects | `SessionCoordinator` per PIN |
| AI replies | Google Gemini API (client-side) | Called directly from browser via VITE_ key |
| Telemetry | localStorage + periodic cloud sync | `cloudSync.js` batches events every 2.5s |
| Deployment | Cloudflare Pages + Workers | `wrangler deploy` |


### 2.2 Structural Issues

| # | Issue | Impact |
|---|---|---|
| 1 | `VirtualOSContext.jsx` is a monolithic 1900-line reducer | Hard to test, extend, or split by feature |
| 2 | Gemini API key exposed via `VITE_GEMINI_API_KEY` | Key is visible in browser bundle; must move server-side |
| 3 | `cloudSync.js` does optimistic localStorage fallback with no conflict resolution | Session divergence between devices is silent |
| 4 | `features/instructions/` and `features/therapist/` directories are empty | Dead folders pollute the repo |
| 5 | `src/features/admin/AdminPanel.jsx` is 1000+ lines with evaluation, scoring, live panel, and records all in one file | Should be split into composable sub-panels |
| 6 | Timestamps use `Date.now()` for client events — skewed by system clock | Should use `performance.now()` delta anchored to session start |
| 7 | No authentication on any API route | `/api/accounts`, `/api/records`, etc. are open |
| 8 | `seedData.js` hard-codes real-sounding personal names and clinic names | Should be clearly fictional per safety guidelines |
| 9 | `session_snapshots` table stores full JSON blobs without size limits | Blob growth is unbounded per session |
| 10 | Cloudflare Durable Objects are Singapore-region dependent; no fallback | Latency and availability risks for non-SG deployments |

---

## 3. Proposed AWS Architecture

The recommended migration moves from Cloudflare to AWS, using fully managed services that align with healthcare-adjacent data requirements (auditability, encryption at rest, IAM, VPC isolation).

### 3.1 Architecture Diagram

```
Browser (React SPA)
        │
        ▼
Amazon CloudFront (CDN + WAF)
        │
        ├──── Static assets (S3 origin)
        │
        └──── /api/* → API Gateway (HTTP API)
                              │
                              ▼
                       AWS Lambda (Node.js)
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
         Amazon RDS       DynamoDB       Amazon S3
       (PostgreSQL)    (live sessions)  (assets/exports)
              │               │
              ▼               ▼
         Secrets Manager   IoT Core / API GW WebSocket
                              │
                              ▼
                       Amazon Bedrock
                    (AI conversation replies)
```


### 3.2 AWS Service Mapping

| Cloudflare Component | AWS Equivalent | Rationale |
|---|---|---|
| Cloudflare Pages | S3 + CloudFront | Static hosting with global CDN, WAF, signed URLs |
| Cloudflare Worker | AWS Lambda (Node.js 22) | Serverless API, VPC-attachable, IAM-integrated |
| Hono API framework | Keep Hono or switch to Express/Fastify on Lambda | Hono works on Lambda via adapter |
| D1 (SQLite) | Amazon RDS (PostgreSQL Serverless v2) | Relational, supports JOINs, Aurora Serverless scales to zero |
| Durable Objects (live session) | Amazon DynamoDB + API Gateway WebSocket | DynamoDB for session state; WebSocket for real-time push |
| Workers KV | DynamoDB (single-table) | Low-latency key-value, consistent reads |
| Cloudflare R2 | Amazon S3 | Object storage; lifecycle rules for retention |
| Cloudflare Queues | Amazon SQS + Lambda | Async background jobs (scoring, report generation) |
| Cloudflare Access / Zero Trust | Amazon Cognito + API Gateway Authorizer | JWT-based auth for admin routes |
| Analytics Engine | Amazon Kinesis Data Firehose → S3 | High-volume event telemetry, Athena queryable |
| Gemini (client-side) | Amazon Bedrock (Claude or Titan) | Server-side AI, no key exposure, IAM auth |

---

## 4. Structural Improvements

### 4.1 Frontend Refactoring

#### Split VirtualOSContext

The monolithic reducer should be decomposed into domain slices:

```
src/state/
  slices/
    sessionSlice.js        # PIN, participants, device ID, join lifecycle
    calendarSlice.js       # Events, rigid appointments, rule evaluation
    messagingSlice.js      # SMS and WhatsApp thread state
    metricsSlice.js        # Interaction metrics, timing, error counts
    checklistSlice.js      # Admin scoring, cue log, notes
    assessmentSlice.js     # Assessment mode state, prompts, stuck detection
  VirtualOSContext.jsx     # Compose slices; expose unified context
```

Each slice exports `initialState`, `reducer`, and `selectors`. `VirtualOSContext` combines them with `useReducer` + `combineReducers` pattern.

#### Split AdminPanel

```
src/features/admin/
  AdminPanel.jsx           # Layout shell, tab routing
  LiveSessionPanel.jsx     # Device grid, join status, mini previews
  ModeControlPanel.jsx     # Mode selector, ENTER button, confirmation
  EvaluationPanel.jsx      # Checklist, cue log, notes, domain scores
  StimulusPanel.jsx        # Free stimulus, custom scenario push
  PastRecordsPanel.jsx     # Record list, report cards, export
  recordsMetrics.js        # Pure scoring/evaluation functions (keep as-is)
```


#### Fix Client Timestamps

Replace `Date.now()` in interaction events with `performance.now()` deltas:

```js
// On session start, record an anchor
const sessionAnchor = { wallClock: Date.now(), perfNow: performance.now() };

// On each event
const eventPerfMs = performance.now() - sessionAnchor.perfNow;
const eventWallMs = sessionAnchor.wallClock + eventPerfMs;
```

The server adds its own `serverTimestamp` on receipt. This produces both a monotonic relative timestamp and a reconstructable wall-clock time without skew from system clock changes.

#### Remove Empty Directories

Delete `src/features/instructions/` and `src/features/therapist/` or populate them before the next milestone.

#### Seed Data Compliance

All names in `seedData.js` must be clearly fictional. Current issues:
- "DBS Bank" is a real brand — replace with "Sunrise Bank" or similar.
- Clinic names like "Clinic B" are borderline; make explicit they are fictional.
- Phone-style sender names ("Doctor", "Polyclinic") are acceptable as role labels.

### 4.2 Backend Restructuring

#### API Layer (Lambda + Hono)

Reorganize API routes for clarity and add authentication:

```
/api/health                      GET    Public
/api/auth/register               POST   Public — create account
/api/auth/login                  POST   Public — return JWT
/api/auth/refresh                POST   Authenticated
/api/sessions                    POST   Admin JWT required
/api/sessions/:pin/state         GET    Admin or participant JWT
/api/sessions/:pin/snapshot      GET    Admin JWT
/api/sessions/:pin/snapshot      PUT    Admin JWT
/api/sessions/:pin/join          POST   Participant JWT
/api/sessions/:pin/event         POST   Participant JWT
/api/sessions/:pin/end           POST   Admin JWT
/api/records                     POST   Lambda-internal or Admin JWT
/api/accounts/:id/report         GET    Admin JWT
/api/accounts/:id                DELETE Admin JWT
```

All admin routes require a Cognito-issued JWT validated by API Gateway Lambda Authorizer.

#### Authentication with Amazon Cognito

- Admin users authenticate via Cognito User Pool (email + password, optionally MFA).
- Patient devices receive a short-lived session token (not a full Cognito identity) scoped to a single PIN. This is generated by the `/api/sessions/:pin/join` endpoint and signed with a Lambda secret stored in Secrets Manager.
- Tokens expire after 4 hours (one session). No refresh for patient tokens.


#### Database Schema (PostgreSQL via Aurora Serverless v2)

Keep the existing relational model from `0001_initial.sql` and extend it:

```sql
-- Existing tables retained:
-- accounts, sessions, session_participants, assignments, records, audit_log

-- New / modified:

-- Replace session_snapshots blob with structured live state in DynamoDB (see below)

-- Add organizations for multi-tenant support
CREATE TABLE organizations (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Link accounts to organizations
ALTER TABLE accounts ADD COLUMN org_id TEXT REFERENCES organizations(id);

-- Add consent tracking
CREATE TABLE consents (
  id           TEXT PRIMARY KEY,
  account_id   TEXT NOT NULL REFERENCES accounts(id),
  kind         TEXT NOT NULL,  -- 'data_collection', 'ai_processing', 'export'
  granted      BOOLEAN NOT NULL DEFAULT false,
  granted_at   TIMESTAMPTZ,
  revoked_at   TIMESTAMPTZ,
  version      TEXT NOT NULL
);

-- Add data retention metadata
CREATE TABLE retention_policies (
  id            TEXT PRIMARY KEY,
  org_id        TEXT REFERENCES organizations(id),
  data_class    TEXT NOT NULL,  -- 'raw_events', 'records', 'snapshots'
  retain_days   INTEGER NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### Live Session State (DynamoDB)

Replace `session_snapshots` (unbounded JSON blob in D1) with a DynamoDB single-table design:

```
PK: SESSION#<pin>           SK: META
PK: SESSION#<pin>           SK: PARTICIPANT#<accountId>
PK: SESSION#<pin>           SK: ASSIGNMENT#<accountId>#<timestamp>
PK: SESSION#<pin>           SK: SNAPSHOT#LATEST
```

Attributes per item are strongly typed and bounded. The `SNAPSHOT#LATEST` item holds only the fields needed for re-hydration on reconnect (not the full React state tree). TTL attribute set to session `expires_at + 24h`.

#### Event Telemetry (Kinesis Firehose → S3)

Replace the `cloudSync.js` batch-upload-to-API approach with direct Kinesis ingestion:

```
Browser → /api/sessions/:pin/events (batch) → Lambda → Kinesis Firehose → S3 (Parquet)
                                                    ↓
                                              RDS (summary metrics only)
```

- Events are buffered client-side for up to 5 seconds or 50 events, whichever comes first.
- Lambda validates and enriches each event (adds `serverTimestamp`, `sessionId`).
- Firehose delivers to S3 in Parquet format, partitioned by `session_date/session_pin`.
- Athena tables are created over the S3 prefix for ad-hoc clinical research queries.
- Raw events are never written to RDS. Only derived summary metrics (counts, durations) are written back via SQS → Lambda job.


#### Real-Time Session Sync (API Gateway WebSocket)

Replace Durable Objects with API Gateway WebSocket API + Lambda + DynamoDB:

```
Admin browser ──────┐
                     ├── WSS /realtime ──► API GW WebSocket ──► Lambda
Patient browser ─────┘                                              │
                                                              DynamoDB
                                                        (connection registry)
```

Connection flow:
1. Client connects to `wss://api.example.com/realtime?token=<session_token>`.
2. Lambda `$connect` handler validates token, writes `connectionId` → DynamoDB.
3. On admin push (`/api/sessions/:pin/push`), Lambda queries all active connectionIds for the PIN and calls `ApiGatewayManagementApi.postToConnection`.
4. `$disconnect` handler deletes the connectionId from DynamoDB.

This replaces the 2500ms polling interval in `cloudSync.js` with push-based delivery.

#### AI Conversation Replies (Amazon Bedrock)

Replace client-side Gemini calls:

```
Browser ──► POST /api/sessions/:pin/ai/reply
                    │
                    ▼
              Lambda (server-side)
                    │
                    ▼
         Amazon Bedrock (Claude 3 Haiku)
                    │
                    ▼
              JSON { reply, isConfirmation }
                    │
                    ▼
              Response to browser
```

- No API key is exposed to the client.
- Lambda uses IAM role with `bedrock:InvokeModel` permission on the specific model ARN.
- The prompt template lives in Lambda environment; not editable by the client.
- Fallback: if Bedrock returns an error, Lambda returns a hardcoded contextual reply (same pattern as the current `geminiClient.js` null fallback).
- Model: `anthropic.claude-3-haiku-20240307-v1:0` (fast, cost-effective for short replies).

---

## 5. Data Model Summary

### 5.1 Relational (Aurora Serverless v2 / PostgreSQL)

| Table | Purpose |
|---|---|
| `organizations` | Multi-tenant org grouping |
| `accounts` | Patient and admin identities |
| `sessions` | Session PIN lifecycle |
| `session_participants` | Who joined which session in which role |
| `assignments` | Which scenario/mode was pushed to which participant |
| `records` | Final scored report cards per participant per session |
| `consents` | Per-account consent to data collection and AI processing |
| `retention_policies` | Per-org data retention rules |
| `audit_log` | Immutable record of all admin and system actions |

### 5.2 DynamoDB (Live State)

| Entity | TTL |
|---|---|
| Session metadata | `expires_at + 24h` |
| Participant state | Same as session |
| Assignments | Same as session |
| Latest snapshot | Same as session |
| WebSocket connections | 4 hours |

### 5.3 S3 (Object Storage)

| Prefix | Content | Retention |
|---|---|---|
| `events/<date>/<pin>/` | Parquet telemetry files from Firehose | Per retention policy (default 90 days) |
| `exports/<account_id>/` | PDF report exports | 12 months |
| `assets/` | Static guide images, scenario media | Indefinite |


---

## 6. Security and Privacy

### 6.1 Authentication and Authorization

| Route class | Auth mechanism |
|---|---|
| Public (health, join) | None or session token |
| Patient-facing API | Short-lived session JWT (HS256, 4h expiry, signed in Lambda) |
| Admin API | Cognito User Pool JWT (RS256, validated by API GW Authorizer) |
| Internal Lambda-to-Lambda | IAM role assumption (no user token) |

### 6.2 Encryption

- All data at rest encrypted with AWS-managed KMS keys (SSE-S3, RDS encryption, DynamoDB encryption).
- All data in transit via TLS 1.2+ enforced by CloudFront and API Gateway.
- Secrets (DB password, JWT signing key, Bedrock model config) stored in AWS Secrets Manager with automatic rotation.

### 6.3 Privacy Controls

- Patient identifiers (alias, account ID) are separated from raw event telemetry in S3. Events reference `accountId` only; PII is never written into event payloads.
- Consent records gate AI processing and export. If consent is absent or revoked, the `/api/sessions/:pin/ai/reply` endpoint returns a fallback without calling Bedrock.
- Data deletion: `DELETE /api/accounts/:id` soft-deletes in RDS and queues an SQS job to anonymize linked events in S3 and DynamoDB.
- Audit log is append-only. Admin actions (session creation, account deletion, record export) are always written.

### 6.4 WAF Rules (CloudFront + AWS WAF)

- Rate limit: 100 requests/minute per IP on `/api/sessions/:pin/event`.
- Block common injection patterns on all `/api/*` paths.
- Geo-restriction: optional, configurable per org.

---

## 7. Deployment Architecture

### 7.1 Environments

| Environment | Purpose |
|---|---|
| `dev` | Local Vite dev server + LocalStack or real AWS sandbox account |
| `staging` | Full AWS stack, synthetic data only, used for QA |
| `production` | Real patient sessions, full encryption and audit controls |

### 7.2 Infrastructure as Code

Use AWS CDK (TypeScript) to define all infrastructure:

```
infra/
  bin/
    app.ts                  # CDK app entrypoint
  lib/
    frontend-stack.ts       # S3 bucket + CloudFront distribution
    api-stack.ts            # API Gateway + Lambda functions
    database-stack.ts       # Aurora Serverless v2 + DynamoDB tables
    auth-stack.ts           # Cognito User Pool + App Client
    storage-stack.ts        # S3 buckets (assets, events, exports)
    telemetry-stack.ts      # Kinesis Firehose + Athena
    realtime-stack.ts       # API Gateway WebSocket
```

### 7.3 CI/CD (GitHub Actions)

```yaml
on:
  push:
    branches: [main]

jobs:
  build-and-deploy:
    steps:
      - npm run build               # Vite SPA build
      - npm run test                # Unit + integration tests
      - cdk diff --app infra        # Show infrastructure changes
      - cdk deploy --app infra      # Deploy all stacks
      - aws s3 sync dist/ s3://$BUCKET --delete
      - aws cloudfront create-invalidation ...
```

---

## 8. Feature Roadmap (Prioritised)

| Priority | Feature | AWS Service(s) Involved |
|---|---|---|
| P0 | Add JWT auth to all API routes | Cognito, API Gateway Authorizer |
| P0 | Move Gemini calls server-side | Lambda, Bedrock |
| P0 | Replace Cloudflare Worker with Lambda + API Gateway | Lambda, API GW HTTP API |
| P0 | Replace D1 with Aurora Serverless v2 | RDS, Secrets Manager |
| P1 | Real-time session sync via WebSocket | API GW WebSocket, DynamoDB |
| P1 | Split VirtualOSContext into domain slices | Frontend only |
| P1 | Split AdminPanel into sub-panels | Frontend only |
| P1 | Replace session_snapshots blob with DynamoDB structured state | DynamoDB |
| P2 | Kinesis Firehose telemetry pipeline | Kinesis, S3, Athena |
| P2 | Consent and data retention controls | RDS, SQS, Lambda |
| P2 | PDF report export | Lambda, S3, SES (email delivery) |
| P2 | CDK infrastructure definitions | CDK, all stacks |
| P3 | Multi-org/multi-tenant support | RDS (org_id), Cognito (org claims) |
| P3 | Session replay viewer (admin) | S3 Parquet → Athena → React |
| P3 | Audit log viewer (admin) | RDS audit_log table |
| P3 | WCAG 2.1 AA accessibility audit | Manual testing + axe-core |


---

## 9. Migration Path from Cloudflare

The current Cloudflare backend can run in parallel with the new AWS backend during transition. The recommended migration sequence is:

1. **Phase 1 — Auth first**: Add Cognito auth to the existing Cloudflare Worker routes. This forces the codebase to adopt token-passing patterns before the backend moves.

2. **Phase 2 — API Gateway + Lambda**: Stand up the AWS API layer with the same route contract as the Cloudflare Worker. Switch the React app's `apiFetch` base URL to the new endpoint. Run both backends in parallel for one sprint.

3. **Phase 3 — Database**: Migrate D1 data to Aurora Serverless v2 using a one-time export/import script. Validate with the staging environment before switching production.

4. **Phase 4 — Live session**: Move `SessionCoordinator` Durable Object logic to DynamoDB + WebSocket. The `cloudSync.js` polling loop is replaced by WebSocket message handlers.

5. **Phase 5 — Telemetry**: Add Kinesis Firehose delivery. `cloudSync.js` event batching continues to `/api/sessions/:pin/events` but Lambda now forwards to Firehose instead of D1.

6. **Phase 6 — Decommission Cloudflare**: Remove `wrangler.toml`, `functions/`, and `worker/` directories. Update `package.json` scripts.

---

## 10. Local Development Setup (AWS Target)

```bash
# Install dependencies
npm install

# Install AWS CDK
npm install -g aws-cdk

# Start LocalStack (optional, for offline Lambda/DynamoDB/S3 emulation)
docker run --rm -p 4566:4566 localstack/localstack

# Start Vite dev server (points to LocalStack or AWS sandbox)
npm run dev

# Deploy CDK to sandbox account
cd infra && cdk deploy --all

# Run database migrations
npm run db:migrate

# Run tests
npm test
```

Environment variables for local development (`.env`):

```env
VITE_API_BASE_URL=http://localhost:4566  # LocalStack, or your sandbox API GW URL
VITE_WS_URL=ws://localhost:4566/realtime
# No VITE_GEMINI_API_KEY — AI calls are server-side in the target architecture
```

Server-side secrets (stored in AWS Secrets Manager, never in `.env`):

```
/daily-digital/bedrock/model_id
/daily-digital/jwt/signing_key
/daily-digital/db/connection_string
```

---

## 11. Open Questions for Review

1. **Jurisdiction**: Should Aurora Serverless v2 be deployed in `ap-southeast-1` (Singapore) to align with current Cloudflare region? Are there data residency requirements from the clinical organisation?

2. **Multi-tenancy timeline**: Is organisation-level isolation (separate Cognito pools, separate DB schemas, or separate AWS accounts) needed before the pilot?

3. **Consent workflow**: Who captures patient consent — the therapist via admin panel, or the patient on the simulator screen before the session starts?

4. **Recording policy**: The README discourages screen recordings. Should the S3 event telemetry be opt-in per session, or opt-out?

5. **Bedrock model choice**: Claude 3 Haiku is recommended for cost and latency. Should the model be configurable per org (e.g., some orgs may prefer a locally-hosted model)?

6. **Report export format**: PDF is listed in the roadmap. Is a structured JSON export also needed for integration with EHR or research databases?

7. **Accessibility**: The patient simulator must be usable by people with cognitive and motor impairments. A formal WCAG 2.1 AA audit with assistive technology testing should be scoped as a milestone before pilot.

---

*End of SPECIFICATIONS.md*
