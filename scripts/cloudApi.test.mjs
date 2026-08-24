import assert from "node:assert/strict";
import worker, { protectSessionControls } from "../worker/index.js";

const protectedPatientWrite = protectSessionControls({
  session: {
    pin: "SYNCED",
    mode: "practice",
    controlRevision: 2,
    participants: [
      { accountId: "patient-a", mode: "practice", activeScenarioId: "old-task", currentApp: "whatsapp" },
      { accountId: "patient-b", mode: "free", activeScenarioId: "", currentApp: "bank" },
    ],
    assignments: { "patient-a": [{ id: "old-task" }] },
    userModes: { "patient-a": "practice" },
    learnModules: {},
    customScenarios: [],
    customStimuli: [],
  },
}, {
  session: {
    pin: "SYNCED",
    mode: "learn",
    controlRevision: 3,
    participants: [
      { accountId: "patient-a", mode: "learn", activeScenarioId: "learn-calendar", currentApp: "calendar" },
      { accountId: "patient-b", mode: "assessment", activeScenarioId: "task-b", currentApp: "home" },
    ],
    assignments: { "patient-a": [{ id: "learn-calendar" }], "patient-b": [{ id: "task-b" }] },
    userModes: { "patient-a": "learn", "patient-b": "assessment" },
    learnModules: { "patient-a": "calendar" },
    customScenarios: [],
    customStimuli: [],
  },
}, "patient", "patient-a");
assert.equal(protectedPatientWrite.session.mode, "learn");
assert.equal(protectedPatientWrite.session.controlRevision, 3);
assert.equal(protectedPatientWrite.session.learnModules["patient-a"], "calendar");
assert.equal(protectedPatientWrite.session.participants[0].currentApp, "calendar");
assert.equal(protectedPatientWrite.session.participants[0].activeScenarioId, "learn-calendar");
assert.equal(protectedPatientWrite.session.participants[1].mode, "assessment");
assert.equal(protectedPatientWrite.session.participants[1].currentApp, "home");

function createMockDb() {
  const db = {
    accounts: new Map(),
    sessions: new Map(),
    snapshots: new Map(),
    participants: new Map(),
    records: new Map(),
    prepare(sql) {
      return {
        values: [],
        bind(...values) {
          this.values = values;
          return this;
        },
        async first() {
          const compact = sql.replace(/\s+/g, " ").trim();
          if (compact.startsWith("SELECT id, alias, participant_code FROM accounts WHERE alias = ?")) {
            const [alias] = this.values;
            return [...db.accounts.values()].find((account) => account.alias === alias && !account.removed_at) || null;
          }
          if (compact.startsWith("SELECT id, alias, participant_code, pin_salt, pin_hash, pin_algorithm FROM accounts WHERE alias = ?")) {
            const [alias] = this.values;
            return [...db.accounts.values()].find((account) => account.alias === alias && !account.removed_at) || null;
          }
          if (compact.startsWith("SELECT id FROM sessions WHERE pin = ?")) {
            const [pin] = this.values;
            return [...db.sessions.values()].find((session) => session.pin === pin && session.status === "active") || null;
          }
          if (compact.startsWith("SELECT id, pin, status, created_at FROM sessions WHERE pin = ?")) {
            const [pin] = this.values;
            return [...db.sessions.values()].find((session) => session.pin === pin && session.status === "active") || null;
          }
          if (compact.startsWith("SELECT snapshot_json FROM session_snapshots WHERE session_pin = ?")) {
            const [pin] = this.values;
            const snapshot = db.snapshots.get(pin);
            return snapshot ? { snapshot_json: JSON.stringify(snapshot) } : null;
          }
          if (compact.startsWith("SELECT id, alias, participant_code AS participantCode, created_at FROM accounts WHERE id = ?")) {
            const [id] = this.values;
            const account = db.accounts.get(id);
            return account ? { ...account, participantCode: account.participant_code } : null;
          }
          return null;
        },
        async all() {
          const compact = sql.replace(/\s+/g, " ").trim();
          if (compact.startsWith("SELECT id, alias, participant_code AS participantCode, created_at FROM accounts")) {
            return { results: [...db.accounts.values()].filter((account) => !account.removed_at).map((account) => ({ ...account, participantCode: account.participant_code })) };
          }
          if (compact.startsWith("SELECT id, session_id, mode, scenario_id, started_at, completed_at, functional_json")) {
            const [accountId] = this.values;
            return { results: [...db.records.values()].filter((record) => record.account_id === accountId) };
          }
          return { results: [] };
        },
        async run() {
          const compact = sql.replace(/\s+/g, " ").trim();
          if (compact.startsWith("CREATE TABLE IF NOT EXISTS session_snapshots")) {
            return { success: true };
          }
          if (compact.startsWith("INSERT INTO accounts")) {
            const [id, alias, participant_code, pin_salt, pin_hash] = this.values;
            db.accounts.set(id, { id, alias, participant_code, pin_salt, pin_hash, pin_algorithm: "pbkdf2-sha256", created_at: Math.floor(Date.now() / 1000), removed_at: null });
            return { success: true };
          }
          if (compact.startsWith("UPDATE accounts SET pin_salt = ?")) {
            const [pin_salt, pin_hash, id] = this.values;
            const account = db.accounts.get(id);
            if (account) db.accounts.set(id, { ...account, pin_salt, pin_hash, pin_algorithm: "pbkdf2-sha256" });
            return { success: true };
          }
          if (compact.startsWith("DELETE FROM accounts WHERE id = ?")) {
            const [id] = this.values;
            db.accounts.delete(id);
            return { success: true };
          }
          if (compact.startsWith("DELETE FROM records WHERE account_id = ?")) {
            const [accountId] = this.values;
            for (const [id, record] of db.records) {
              if (record.account_id === accountId) db.records.delete(id);
            }
            return { success: true };
          }
          if (compact.startsWith("INSERT INTO sessions")) {
            const [id, pin, expires_at] = this.values;
            db.sessions.set(id, {
              id,
              pin,
              status: "active",
              created_at: Math.floor(Date.now() / 1000),
              expires_at,
            });
            return { success: true };
          }
          if (compact.startsWith("INSERT OR REPLACE INTO session_snapshots")) {
            const [session_pin, session_id, snapshot_json] = this.values;
            db.snapshots.set(session_pin, { ...JSON.parse(snapshot_json), sessionId: session_id });
            return { success: true };
          }
          if (compact.startsWith("INSERT OR REPLACE INTO session_participants")) {
            const [id, session_id, account_id, role, device_id, joined_at] = this.values;
            db.participants.set(id, { id, session_id, account_id, role, device_id, joined_at });
            return { success: true };
          }
          if (compact.startsWith("INSERT OR REPLACE INTO records")) {
            const [id, account_id, session_id, mode, scenario_id, started_at, completed_at, functional_json, cognitive_json, evidence_json] = this.values;
            db.records.set(id, { id, account_id, session_id, mode, scenario_id, started_at, completed_at, functional_json, cognitive_json, evidence_json });
            return { success: true };
          }
          if (compact.startsWith("UPDATE sessions SET status = 'ended'")) {
            const [id] = this.values;
            const session = db.sessions.get(id);
            if (session) {
              db.sessions.set(id, { ...session, status: "ended", ended_at: Math.floor(Date.now() / 1000) });
            }
            return { success: true };
          }
          return { success: true };
        },
      };
    },
  };
  return db;
}

function createMockSessionCoordinator() {
  const objects = new Map();
  return {
    objects,
    idFromName(pin) {
      return pin;
    },
    get(pin) {
      if (!objects.has(pin)) {
        objects.set(pin, { session: null, snapshot: null });
      }
      const object = objects.get(pin);
      return {
        async fetch(input, init = {}) {
          const request = input instanceof Request ? input : new Request(input, init);
          const action = new URL(request.url).pathname.replace(/^\/+/, "");
          const body = request.method === "GET" ? {} : await request.json();
          if (action === "state") {
            return object.session
              ? Response.json({ session: object.session })
              : Response.json({ error: "Session not found or inactive." }, { status: 404 });
          }
          if (action === "create") {
            object.session = {
              sessionId: body.sessionId,
              pin: body.pin,
              participantLimit: body.participantLimit,
              participants: [],
              assignments: {},
              status: "active",
            };
            object.snapshot = null;
            return Response.json({ session: object.session });
          }
          if (action === "snapshot" && request.method === "PUT") {
            object.snapshot = body.snapshot;
            object.session = {
              ...object.session,
              participants: body.snapshot.session.participants || [],
              assignments: body.snapshot.session.assignments || {},
            };
            return Response.json({ snapshot: object.snapshot, session: object.snapshot.session });
          }
          if (action === "snapshot") {
            return Response.json({ snapshot: object.snapshot, session: object.session });
          }
          return Response.json({ error: "Unsupported mock route." }, { status: 404 });
        },
      };
    },
  };
}

async function request(env, path, options = {}) {
  const response = await worker.fetch(new Request(`https://example.test${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {}),
    },
  }), env);
  const payload = await response.json();
  return { response, payload };
}

const ADMIN_KEY = "test-clinician-access-key";

async function adminRequest(env, path, options = {}) {
  return request(env, path, {
    ...options,
    headers: { authorization: `Bearer ${ADMIN_KEY}`, ...(options.headers || {}) },
  });
}

const env = { DB: createMockDb(), ALLOWED_ORIGINS: "", ADMIN_API_KEY: ADMIN_KEY };
const pin = "MHLKWM";
const account = { id: "user-bright", alias: "Bright Otter", pin: "5093" };

let result = await request(env, "/api/accounts", {
  method: "POST",
  body: JSON.stringify(account),
});
assert.equal(result.response.status, 201);
assert.equal(result.payload.account.id, account.id);
assert.match(result.payload.account.participantCode, /^DD-[A-Z0-9]{8}$/);

result = await request(env, "/api/accounts");
assert.equal(result.response.status, 401);
result = await adminRequest(env, "/api/accounts");
assert.equal(result.response.status, 200);
assert.equal(result.payload.accounts.some((item) => item.alias === account.alias), true);

result = await request(env, "/api/login", {
  method: "POST",
  body: JSON.stringify({ alias: account.alias, pin: "0000" }),
});
assert.equal(result.response.status, 401);

result = await request(env, "/api/login", {
  method: "POST",
  body: JSON.stringify({ alias: account.alias, pin: account.pin }),
});
assert.equal(result.response.status, 200);
assert.equal(result.payload.account.id, account.id);

const sharedPinAccount = { id: "user-shared-pin", alias: "Shared Pin User", pin: account.pin };
result = await request(env, "/api/accounts", {
  method: "POST",
  body: JSON.stringify(sharedPinAccount),
});
assert.equal(result.response.status, 201);
assert.equal(result.payload.account.id, sharedPinAccount.id);
result = await request(env, "/api/login", {
  method: "POST",
  body: JSON.stringify({ alias: sharedPinAccount.alias, pin: account.pin }),
});
assert.equal(result.response.status, 200);
assert.equal(result.payload.account.id, sharedPinAccount.id);

const firstScoreId = "score-bright";
const secondScoreId = "score-shared";
result = await adminRequest(env, "/api/records", {
  method: "POST",
  body: JSON.stringify({ id: firstScoreId, accountId: account.id, mode: "assessment", functional: { checklist: { sequencing: 3 } } }),
});
assert.equal(result.response.status, 201);
result = await adminRequest(env, "/api/records", {
  method: "POST",
  body: JSON.stringify({ id: secondScoreId, accountId: sharedPinAccount.id, mode: "assessment", functional: { checklist: { sequencing: 1 } } }),
});
assert.equal(result.response.status, 201);

const firstReport = await adminRequest(env, `/api/accounts/${account.id}/report`);
const secondReport = await adminRequest(env, `/api/accounts/${sharedPinAccount.id}/report`);
assert.equal(firstReport.response.status, 200);
assert.equal(secondReport.response.status, 200);
assert.deepEqual(firstReport.payload.records.map((record) => record.id), [firstScoreId]);
assert.deepEqual(secondReport.payload.records.map((record) => record.id), [secondScoreId]);
assert.equal(firstReport.payload.records[0].functional.checklist.sequencing, 3);
assert.equal(secondReport.payload.records[0].functional.checklist.sequencing, 1);

result = await adminRequest(env, "/api/sessions", {
  method: "POST",
  body: JSON.stringify({ pin }),
});
assert.equal(result.response.status, 201);
assert.equal(result.payload.session.pin, pin);

const adminSnapshot = {
  savedAt: Date.now(),
  session: {
    pin,
    mode: "practice",
    participantLimit: 6,
    participants: [],
    userAccounts: [account],
    userModes: {},
    assignments: {},
    learnModules: {},
    customScenarios: [],
    customStimuli: [],
    records: [],
    startedAt: Date.now(),
  },
};

result = await adminRequest(env, `/api/sessions/${pin}/snapshot`, {
  method: "PUT",
  body: JSON.stringify({ snapshot: adminSnapshot }),
});
assert.equal(result.response.status, 200);
assert.equal(result.payload.snapshot.session.userAccounts[0].alias, account.alias);

result = await request(env, `/api/sessions/${pin}/join`, {
  method: "POST",
  body: JSON.stringify({
    accountId: sharedPinAccount.id,
    alias: account.alias,
    pin: account.pin,
    role: "patient",
    deviceId: "separate-laptop",
    currentApp: "home",
  }),
});
assert.equal(result.response.status, 200);
assert.equal(result.payload.session.participants.length, 1);
assert.equal(result.payload.session.participants[0].deviceId, "separate-laptop");

result = await request(env, `/api/sessions/${pin}/snapshot`);
assert.equal(result.response.status, 200);
assert.equal(result.payload.snapshot.session.participants[0].accountId, account.id);

result = await request(env, `/api/sessions/${pin}/event`, {
  method: "POST",
  body: JSON.stringify({
    accountId: account.id,
    kind: "create_session",
    payload: { pin },
  }),
});
assert.equal(result.response.status, 200);
assert.equal(result.payload.event.kind, "create_session");

const secondPin = "USRDEV";
const secondAccount = { id: "user-created-elsewhere", alias: "Remote Created", pin: "1842" };
result = await request(env, "/api/accounts", {
  method: "POST",
  body: JSON.stringify(secondAccount),
});
assert.equal(result.response.status, 201);

result = await adminRequest(env, "/api/sessions", {
  method: "POST",
  body: JSON.stringify({ pin: secondPin }),
});
assert.equal(result.response.status, 201);

result = await adminRequest(env, `/api/sessions/${secondPin}/snapshot`, {
  method: "PUT",
  body: JSON.stringify({
    snapshot: {
      savedAt: Date.now(),
      session: {
        pin: secondPin,
        mode: "practice",
        participantLimit: 6,
        participants: [],
        userAccounts: [],
        userModes: {},
        assignments: {},
        learnModules: {},
        customScenarios: [],
        customStimuli: [],
        records: [],
        startedAt: Date.now(),
      },
    },
  }),
});
assert.equal(result.response.status, 200);

result = await request(env, `/api/sessions/${secondPin}/join`, {
  method: "POST",
  body: JSON.stringify({
    accountId: secondAccount.id,
    alias: secondAccount.alias,
    pin: secondAccount.pin,
    role: "patient",
    deviceId: "user-created-device",
    currentApp: "home",
  }),
});
assert.equal(result.response.status, 200);
assert.equal(result.payload.session.participants[0].deviceId, "user-created-device");
assert.equal(result.payload.session.userAccounts[0].id, secondAccount.id);
assert.equal(result.payload.session.userAccounts[0].pin, undefined);

const noSnapshotPin = "NOSNAP";
const noSnapshotAccount = { id: "no-snapshot-user", alias: "No Snapshot User", pin: "7331" };
result = await request(env, "/api/accounts", {
  method: "POST",
  body: JSON.stringify(noSnapshotAccount),
});
assert.equal(result.response.status, 201);

result = await adminRequest(env, "/api/sessions", {
  method: "POST",
  body: JSON.stringify({ pin: noSnapshotPin }),
});
assert.equal(result.response.status, 201);

result = await request(env, `/api/sessions/${noSnapshotPin}/join`, {
  method: "POST",
  body: JSON.stringify({
    accountId: noSnapshotAccount.id,
    alias: noSnapshotAccount.alias,
    pin: noSnapshotAccount.pin,
    role: "patient",
    deviceId: "join-before-snapshot",
    currentApp: "home",
  }),
});
assert.equal(result.response.status, 200);
assert.equal(result.payload.session.participants[0].deviceId, "join-before-snapshot");
assert.equal(result.payload.session.userAccounts[0].id, noSnapshotAccount.id);

const wrongPin = await request(env, `/api/sessions/${noSnapshotPin}/join`, {
  method: "POST",
  body: JSON.stringify({
    accountId: noSnapshotAccount.id,
    alias: noSnapshotAccount.alias,
    pin: "0000",
    role: "patient",
    deviceId: "wrong-pin-device",
  }),
});
assert.equal(wrongPin.response.status, 401);

result = await adminRequest(env, `/api/accounts/${noSnapshotAccount.id}`, { method: "DELETE" });
assert.equal(result.response.status, 200);
result = await request(env, "/api/accounts", {
  method: "POST",
  body: JSON.stringify(noSnapshotAccount),
});
assert.equal(result.response.status, 201);
assert.equal(result.payload.account.id, noSnapshotAccount.id);

const legacyPin = "LEGACY";
const legacyDb = createMockDb();
legacyDb.sessions.set("sess-legacy", {
  id: "sess-legacy",
  pin: legacyPin,
  status: "active",
  created_at: Math.floor(Date.now() / 1000),
});
legacyDb.snapshots.set(legacyPin, {
  savedAt: Date.now(),
  session: {
    pin: legacyPin,
    mode: "assessment",
    participantLimit: 6,
    participants: [{ accountId: account.id, alias: account.alias, role: "patient" }],
    userAccounts: [{ id: account.id, alias: account.alias }],
    assignments: {},
  },
});
const legacyCoordinator = createMockSessionCoordinator();
const legacyEnv = { DB: legacyDb, SESSION_DO: legacyCoordinator, ALLOWED_ORIGINS: "", ADMIN_API_KEY: ADMIN_KEY };

result = await request(legacyEnv, `/api/sessions/${legacyPin}/snapshot`);
assert.equal(result.response.status, 200);
assert.equal(result.payload.snapshot.session.mode, "assessment");
assert.equal(result.payload.snapshot.session.participants[0].accountId, account.id);
assert.equal(legacyCoordinator.objects.get(`identity-v2:${legacyPin}`).session.status, "active");

console.log("cloud API cross-device fallback test passed");
