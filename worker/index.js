const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_PARTICIPANTS = 6;
const PIN_HASH_ITERATIONS = 100000;
const SESSION_NAMESPACE_VERSION = "identity-v2";

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...(init.headers || {}),
    },
  });
}

function error(message, status = 400) {
  return json({ ok: false, error: message }, { status });
}

function randomId(prefix = "id") {
  return `${prefix}_${crypto.randomUUID()}`;
}

function randomPin() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  bytes.forEach((byte) => {
    out += alphabet[byte % alphabet.length];
  });
  return out;
}

function randomParticipantCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return `DD-${Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("")}`;
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function corsHeaders(request, env) {
  const origin = request.headers.get("origin") || "";
  const sameOrigin = new URL(request.url).origin;
  const allowed = (env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const allowOrigin = origin && (origin === sameOrigin || allowed.includes(origin)) ? origin : sameOrigin;
  return {
    "access-control-allow-origin": allowOrigin,
    "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type,authorization",
    "access-control-max-age": "86400",
    "vary": "Origin",
  };
}

async function hashLegacyPin(pin, salt) {
  const bytes = new TextEncoder().encode(`${salt}:${pin}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hashPin(pin, salt) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({
    name: "PBKDF2",
    salt: encoder.encode(salt),
    iterations: PIN_HASH_ITERATIONS,
    hash: "SHA-256",
  }, key, 256);
  return Array.from(new Uint8Array(bits)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function secureHashEqual(left, right) {
  const a = String(left || "");
  const b = String(right || "");
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  if (aBytes.byteLength === bBytes.byteLength && typeof crypto.subtle.timingSafeEqual === "function") {
    return crypto.subtle.timingSafeEqual(aBytes, bBytes);
  }
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (a.charCodeAt(index % Math.max(1, a.length)) || 0) ^ (b.charCodeAt(index % Math.max(1, b.length)) || 0);
  }
  return difference === 0;
}

function sessionStub(env, pin) {
  const id = env.SESSION_DO.idFromName(`${SESSION_NAMESPACE_VERSION}:${pin}`);
  return env.SESSION_DO.get(id);
}

function hasSessionCoordinator(env) {
  return Boolean(env.SESSION_DO?.idFromName && env.SESSION_DO?.get);
}

function hasDb(env) {
  return Boolean(env.DB?.prepare);
}

async function ensureSnapshotTable(env) {
  if (!hasDb(env)) {
    return;
  }
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS session_snapshots (
      session_pin TEXT PRIMARY KEY,
      session_id TEXT,
      snapshot_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
  ).run();
}

function sessionFromRow(row) {
  if (!row) {
    return null;
  }
  return normalizeSessionShape({
    sessionId: row.id,
    pin: row.pin,
    status: row.status,
    createdAt: row.created_at ? row.created_at * 1000 : Date.now(),
    updatedAt: Date.now(),
  });
}

function normalizeSessionShape(session = {}) {
  return {
    ...session,
    controlRevision: Math.max(0, Number(session.controlRevision) || 0),
    mode: session.mode || "practice",
    participantLimit: session.participantLimit || MAX_PARTICIPANTS,
    participants: Array.isArray(session.participants) ? session.participants : [],
    userAccounts: Array.isArray(session.userAccounts)
      ? session.userAccounts.map(({ pin, authToken, ...account }) => account)
      : [],
    removedAccountIds: Array.isArray(session.removedAccountIds) ? session.removedAccountIds : [],
    assignments: session.assignments && typeof session.assignments === "object" ? session.assignments : {},
    userModes: session.userModes && typeof session.userModes === "object" ? session.userModes : {},
    learnModules: session.learnModules && typeof session.learnModules === "object" ? session.learnModules : {},
    customScenarios: Array.isArray(session.customScenarios) ? session.customScenarios : [],
    customStimuli: Array.isArray(session.customStimuli) ? session.customStimuli : [],
    records: Array.isArray(session.records) ? session.records : [],
    events: Array.isArray(session.events) ? session.events : [],
    experienceRatings: session.experienceRatings && typeof session.experienceRatings === "object" ? session.experienceRatings : {},
    readStimuli: Array.isArray(session.readStimuli) ? session.readStimuli : [],
    dismissedStimuli: Array.isArray(session.dismissedStimuli) ? session.dismissedStimuli : [],
  };
}

export function protectSessionControls(incomingSnapshot, currentSnapshot, writerRole = "patient", writerAccountId = null) {
  if (writerRole === "admin" || !incomingSnapshot?.session || !currentSnapshot?.session) {
    return incomingSnapshot;
  }

  const incomingSession = normalizeSessionShape(incomingSnapshot.session);
  const currentSession = normalizeSessionShape(currentSnapshot.session);
  const incomingRevision = incomingSession.controlRevision;
  const currentRevision = currentSession.controlRevision;
  const staleControlView = incomingRevision < currentRevision;
  const incomingParticipants = new Map(
    incomingSession.participants.map((participant) => [participant.accountId || participant.id, participant]),
  );
  const participantKeys = new Set([
    ...currentSession.participants.map((participant) => participant.accountId || participant.id),
    ...incomingParticipants.keys(),
  ]);
  const participants = [...participantKeys].filter(Boolean).map((key) => {
    const currentParticipant = currentSession.participants.find((participant) => (participant.accountId || participant.id) === key);
    const incomingParticipant = incomingParticipants.get(key);
    if (!currentParticipant) {
      return incomingParticipant;
    }
    const canUpdateDeviceState = !writerAccountId || currentParticipant.accountId === writerAccountId;
    const mergedParticipant = canUpdateDeviceState && incomingParticipant
      ? { ...currentParticipant, ...incomingParticipant }
      : currentParticipant;
    return {
      ...mergedParticipant,
      mode: currentParticipant.mode || mergedParticipant.mode,
      activeScenarioId: currentParticipant.activeScenarioId || "",
      currentApp: staleControlView
        ? currentParticipant.currentApp || mergedParticipant.currentApp || "home"
        : mergedParticipant.currentApp || currentParticipant.currentApp || "home",
    };
  });

  return {
    ...incomingSnapshot,
    session: {
      ...incomingSession,
      mode: currentSession.mode,
      controlRevision: currentRevision,
      assignments: currentSession.assignments,
      userModes: currentSession.userModes,
      learnModules: currentSession.learnModules,
      customScenarios: currentSession.customScenarios,
      customStimuli: currentSession.customStimuli,
      removedAccountIds: currentSession.removedAccountIds,
      participants,
    },
  };
}

async function getActiveSessionRow(env, pin) {
  if (!hasDb(env)) {
    return null;
  }
  return env.DB.prepare(
    `SELECT id, pin, status, created_at FROM sessions
     WHERE pin = ? AND status = 'active' AND (expires_at IS NULL OR expires_at > unixepoch())
     ORDER BY created_at DESC LIMIT 1`,
  ).bind(pin).first();
}

async function getDbSnapshot(env, pin) {
  await ensureSnapshotTable(env);
  const row = await env.DB.prepare(
    "SELECT snapshot_json FROM session_snapshots WHERE session_pin = ?",
  ).bind(pin).first();
  if (!row?.snapshot_json) {
    return null;
  }
  try {
    const snapshot = JSON.parse(row.snapshot_json);
    return snapshot?.session
      ? { ...snapshot, session: normalizeSessionShape(snapshot.session) }
      : snapshot;
  } catch {
    return null;
  }
}

async function putDbSnapshot(env, pin, sessionId, snapshot) {
  await ensureSnapshotTable(env);
  const nextSnapshot = {
    ...snapshot,
    savedAt: Date.now(),
    session: normalizeSessionShape({
      ...(snapshot.session || {}),
      pin,
      participantLimit: snapshot.session?.participantLimit || MAX_PARTICIPANTS,
    }),
  };
  await env.DB.prepare(
    `INSERT OR REPLACE INTO session_snapshots
      (session_pin, session_id, snapshot_json, updated_at)
     VALUES (?, ?, ?, unixepoch())`,
  ).bind(pin, sessionId || null, JSON.stringify(nextSnapshot)).run();
  return nextSnapshot;
}

async function ensureSessionCoordinator(env, pin, knownRow = null) {
  const row = knownRow || await getActiveSessionRow(env, pin);
  if (!row) {
    return null;
  }
  const stub = sessionStub(env, pin);
  const current = await stub.fetch("https://session/state", { method: "GET" });
  if (current.ok) {
    const payload = await current.json();
    return { stub, session: payload.session, recovered: false };
  }
  if (current.status !== 404) {
    return { stub, errorResponse: current };
  }

  const snapshot = await getDbSnapshot(env, pin);
  const created = await stub.fetch("https://session/create", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      sessionId: row.id,
      pin,
      participantLimit: snapshot?.session?.participantLimit || MAX_PARTICIPANTS,
    }),
  });
  if (!created.ok) {
    return { stub, errorResponse: created };
  }

  let payload = await created.json();
  if (snapshot?.session) {
    const restored = await stub.fetch("https://session/snapshot", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ snapshot }),
    });
    if (!restored.ok) {
      return { stub, errorResponse: restored };
    }
    payload = await restored.json();
  }

  console.log(JSON.stringify({ kind: "session_coordinator_recovered", sessionId: row.id }));
  return { stub, session: payload.session, recovered: true };
}

async function createAccount(env, body) {
  const alias = String(body.alias || "").trim();
  const pin = String(body.pin || "").trim();
  if (!alias || !/^\d{4}$/.test(pin)) {
    return error("Alias and 4-digit PIN are required.");
  }
  const existing = await env.DB.prepare("SELECT id, alias, participant_code FROM accounts WHERE alias = ?")
    .bind(alias)
    .first();
  if (existing) {
    return json({ ok: true, account: { id: existing.id, alias, participantCode: existing.participant_code }, existing: true });
  }
  const requestedId = String(body.id || "").trim();
  const accountId = requestedId && /^[A-Za-z0-9_-]{3,80}$/.test(requestedId) ? requestedId : randomId("acct");
  const salt = crypto.randomUUID();
  const pinHash = await hashPin(pin, salt);
  const participantCode = randomParticipantCode();
  await env.DB.prepare(
    "INSERT INTO accounts (id, alias, participant_code, pin_salt, pin_hash, pin_algorithm, created_at) VALUES (?, ?, ?, ?, ?, 'pbkdf2-sha256', unixepoch())",
  ).bind(accountId, alias, participantCode, salt, pinHash).run();
  return json({ ok: true, account: { id: accountId, alias, participantCode } }, { status: 201 });
}

async function authenticateAccount(env, alias, pin) {
  const account = await env.DB.prepare(
    "SELECT id, alias, participant_code, pin_salt, pin_hash, pin_algorithm FROM accounts WHERE alias = ?",
  ).bind(alias).first();
  if (!account) {
    return null;
  }
  const algorithm = account.pin_algorithm || "sha256";
  const candidateHash = algorithm === "pbkdf2-sha256"
    ? await hashPin(pin, account.pin_salt)
    : await hashLegacyPin(pin, account.pin_salt);
  if (!secureHashEqual(account.pin_hash, candidateHash)) {
    return null;
  }
  if (algorithm !== "pbkdf2-sha256") {
    const nextSalt = crypto.randomUUID();
    const nextHash = await hashPin(pin, nextSalt);
    await env.DB.prepare(
      "UPDATE accounts SET pin_salt = ?, pin_hash = ?, pin_algorithm = 'pbkdf2-sha256' WHERE id = ?",
    ).bind(nextSalt, nextHash, account.id).run();
  }
  return { id: account.id, alias: account.alias, participantCode: account.participant_code };
}

async function loginAccount(env, body) {
  const alias = String(body.alias || "").trim();
  const pin = String(body.pin || "").trim();
  if (!alias || !/^\d{4}$/.test(pin)) {
    return error("Alias and 4-digit PIN are required.", 400);
  }
  const account = await authenticateAccount(env, alias, pin);
  return account
    ? json({ ok: true, account })
    : error("Invalid login details.", 401);
}

async function listAccounts(env) {
  const { results } = await env.DB.prepare(
    "SELECT id, alias, participant_code AS participantCode, created_at FROM accounts ORDER BY created_at DESC",
  ).all();
  return json({ ok: true, accounts: results || [] });
}

async function removeAccount(env, accountId) {
  if (!accountId) {
    return error("Account ID is required.", 400);
  }
  await env.DB.prepare("DELETE FROM records WHERE account_id = ?").bind(accountId).run();
  await env.DB.prepare("DELETE FROM assignments WHERE account_id = ?").bind(accountId).run();
  await env.DB.prepare("DELETE FROM session_participants WHERE account_id = ?").bind(accountId).run();
  await env.DB.prepare("DELETE FROM accounts WHERE id = ?")
    .bind(accountId)
    .run();
  await env.DB.prepare(
    "INSERT INTO audit_log (id, account_id, actor, kind, payload_json, created_at) VALUES (?, ?, 'admin', 'account_removed', '{}', unixepoch())",
  ).bind(randomId("audit"), accountId).run();
  return json({ ok: true });
}

async function joinVerifiedSession(request, env, pin) {
  const body = await readJson(request);
  const alias = String(body.alias || "").trim();
  const participantPin = String(body.pin || "").trim();
  if (!alias || !/^\d{4}$/.test(participantPin)) {
    return error("Alias and 4-digit PIN are required.", 400);
  }
  const account = await authenticateAccount(env, alias, participantPin);
  if (!account) {
    return error("Alias or 4-digit user PIN is incorrect.", 401);
  }
  const verifiedHeaders = new Headers(request.headers);
  verifiedHeaders.set("content-type", "application/json");
  verifiedHeaders.delete("content-length");
  const verifiedRequest = new Request(request.url, {
    method: "POST",
    headers: verifiedHeaders,
    body: JSON.stringify({
      ...body,
      accountId: account.id,
      alias: account.alias,
      participantCode: account.participantCode,
    }),
  });
  return proxySession(verifiedRequest, env, pin, "join");
}

async function createSession(request, env) {
  const body = await readJson(request);
  const pin = body.pin && /^[A-Z0-9]{6}$/.test(String(body.pin)) ? String(body.pin) : randomPin();
  const existingActive = await getActiveSessionRow(env, pin);
  if (existingActive) {
    if (hasSessionCoordinator(env)) {
      const coordinator = await ensureSessionCoordinator(env, pin, existingActive);
      if (coordinator?.session) {
        return json({ ok: true, session: coordinator.session, existing: true, recovered: coordinator.recovered });
      }
      if (coordinator?.errorResponse) {
        return coordinator.errorResponse;
      }
    }
    const snapshot = await getDbSnapshot(env, pin);
    return json({ ok: true, session: snapshot?.session || sessionFromRow({ ...existingActive, pin, status: "active" }), existing: true });
  }
  const sessionId = randomId("sess");
  await env.DB.prepare(
    "INSERT INTO sessions (id, pin, status, created_at, expires_at) VALUES (?, ?, 'active', unixepoch(), ?)",
  ).bind(sessionId, pin, Math.floor((Date.now() + SESSION_TTL_MS) / 1000)).run();
  if (!hasSessionCoordinator(env)) {
    const session = sessionFromRow({ id: sessionId, pin, status: "active", created_at: Math.floor(Date.now() / 1000) });
    return json({ ok: true, session }, { status: 201 });
  }
  const response = await sessionStub(env, pin).fetch("https://session/create", {
    method: "POST",
    body: JSON.stringify({ sessionId, pin, participantLimit: MAX_PARTICIPANTS }),
  });
  const payload = await response.json();
  return json({ ok: true, ...payload }, { status: 201 });
}

async function proxySession(request, env, pin, action) {
  if (!pin || !/^[A-Z0-9]{6}$/.test(pin)) {
    return error("Valid 6-character session PIN required.", 400);
  }
  if (!hasSessionCoordinator(env)) {
    return handleDbSessionRoute(request, env, pin, action);
  }
  const coordinator = await ensureSessionCoordinator(env, pin);
  if (!coordinator) {
    return error("Session not found or inactive.", 404);
  }
  if (coordinator.errorResponse) {
    return coordinator.errorResponse;
  }
  const url = new URL(request.url);
  const target = new URL(`https://session/${action}`);
  target.search = url.search;
  return coordinator.stub.fetch(target, request);
}

async function handleDbSessionRoute(request, env, pin, action) {
  if (!hasDb(env)) {
    return error("Session storage is not configured. Add a D1 binding named DB to this Pages project.", 500);
  }
  const row = await getActiveSessionRow(env, pin);
  if (!row) {
    return error("Session not found or inactive.", 404);
  }
  const session = sessionFromRow(row);
  const snapshot = await getDbSnapshot(env, pin);
  const liveSession = snapshot?.session || session;
  const body = request.method === "GET" ? {} : await readJson(request);

  if (action === "state") {
    return json({ session: liveSession });
  }

  if (action === "snapshot") {
    if (request.method === "GET") {
      return json({ ok: true, snapshot, session: liveSession });
    }
    if (request.method === "PUT" || request.method === "POST") {
      const nextSnapshot = body.snapshot || body;
      if (!nextSnapshot?.session || nextSnapshot.session.pin !== pin) {
        return error("Snapshot must include the active session PIN.", 400);
      }
      const protectedSnapshot = protectSessionControls(
        nextSnapshot,
        snapshot,
        body.writerRole || "patient",
        body.writerAccountId || null,
      );
      const saved = await putDbSnapshot(env, pin, row.id, protectedSnapshot);
      return json({ ok: true, snapshot: saved, session: saved.session });
    }
  }

  if (action === "join" && request.method === "POST") {
    if (!body.accountId || !body.alias) {
      return error("accountId and alias are required.");
    }
    const currentSnapshot = snapshot || {
      savedAt: Date.now(),
      session: liveSession,
    };
    const existing = (currentSnapshot.session.participants || []).find((item) => item.accountId === body.accountId);
    const participantCount = (currentSnapshot.session.participants || []).filter((item) => item.role === "patient").length;
    if (!existing && participantCount >= (currentSnapshot.session.participantLimit || MAX_PARTICIPANTS)) {
      return error("Session is full.", 409);
    }
    const deviceId = body.deviceId || randomId("device");
    const participant = {
      id: deviceId,
      accountId: body.accountId,
      label: body.alias,
      alias: body.alias,
      role: body.role || "patient",
      deviceId,
      joinedAt: existing?.joinedAt || Date.now(),
      lastSeenAt: Date.now(),
      currentApp: body.currentApp || "home",
      mode: currentSnapshot.session.userModes?.[body.accountId] || currentSnapshot.session.mode || "practice",
      activeScenarioId: currentSnapshot.session.assignments?.[body.accountId]?.at(-1)?.scenarioId || "",
      participantCode: body.participantCode || null,
    };
    const userAccount = {
      id: body.accountId,
      alias: body.alias,
      pin: body.pin || "",
      participantCode: body.participantCode || null,
    };
    const existingAccount = (currentSnapshot.session.userAccounts || []).some((item) => item.id === body.accountId);
    const nextSnapshot = {
      ...currentSnapshot,
      session: {
        ...currentSnapshot.session,
        userAccounts: existingAccount
          ? currentSnapshot.session.userAccounts
          : [...(currentSnapshot.session.userAccounts || []), userAccount],
        participants: existing
          ? currentSnapshot.session.participants.map((item) => item.accountId === body.accountId ? { ...item, ...participant } : item)
          : [...(currentSnapshot.session.participants || []), participant],
      },
    };
    const saved = await putDbSnapshot(env, pin, row.id, nextSnapshot);
    await env.DB.prepare(
      `INSERT OR REPLACE INTO session_participants
        (id, session_id, account_id, role, device_id, joined_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(
      `${row.id}:${participant.accountId}`,
      row.id,
      participant.accountId,
      participant.role,
      participant.deviceId,
      Math.floor(participant.joinedAt / 1000),
    ).run();
    return json({ ok: true, session: saved.session });
  }

  if (action === "event" && request.method === "POST") {
    const event = {
      id: randomId("evt"),
      accountId: body.accountId || null,
      kind: body.kind || "event",
      payload: body.payload || {},
      at: Date.now(),
    };
    const currentSnapshot = snapshot || {
      savedAt: Date.now(),
      session: liveSession,
    };
    const events = [event, ...(currentSnapshot.session.events || [])].slice(0, 500);
    await putDbSnapshot(env, pin, row.id, {
      ...currentSnapshot,
      session: {
        ...currentSnapshot.session,
        events,
        updatedAt: Date.now(),
      },
    });
    await env.DB.prepare(
      `INSERT INTO audit_log
        (id, session_id, account_id, actor, kind, payload_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      event.id,
      row.id,
      event.accountId,
      body.actor || "device",
      event.kind,
      JSON.stringify(event.payload || {}),
      Math.floor(event.at / 1000),
    ).run();
    return json({ ok: true, event });
  }

  if (action === "end" && request.method === "POST") {
    await env.DB.prepare("UPDATE sessions SET status = 'ended', ended_at = unixepoch() WHERE id = ?")
      .bind(row.id)
      .run();
    const endedSession = { ...liveSession, status: "ended", endedAt: Date.now() };
    if (snapshot) {
      await putDbSnapshot(env, pin, row.id, { ...snapshot, session: endedSession });
    }
    return json({ ok: true, session: endedSession });
  }

  return error("Session route not found.", 404);
}

async function saveRecord(request, env) {
  const body = await readJson(request);
  const recordId = body.id || randomId("rec");
  if (!body.accountId || !body.mode) {
    return error("accountId and mode are required.");
  }
  await env.DB.prepare(
    `INSERT OR REPLACE INTO records (
      id, account_id, session_id, mode, scenario_id, started_at, completed_at,
      functional_json, cognitive_json, evidence_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())`,
  ).bind(
    recordId,
    body.accountId,
    body.sessionId || null,
    body.mode,
    body.scenarioId || null,
    body.startedAt || null,
    body.completedAt || Date.now(),
    JSON.stringify(body.functional || {}),
    JSON.stringify(body.cognitive || {}),
    JSON.stringify(body.evidence || {}),
  ).run();
  return json({ ok: true, recordId }, { status: 201 });
}

async function getAccountReport(env, accountId) {
  const account = await env.DB.prepare(
    "SELECT id, alias, participant_code AS participantCode, created_at FROM accounts WHERE id = ?",
  ).bind(accountId).first();
  if (!account) {
    return error("Account not found.", 404);
  }
  const { results } = await env.DB.prepare(
    `SELECT id, session_id, mode, scenario_id, started_at, completed_at,
      functional_json, cognitive_json, evidence_json
     FROM records
     WHERE account_id = ?
     ORDER BY completed_at DESC
     LIMIT 100`,
  ).bind(accountId).all();
  return json({
    ok: true,
    account,
    records: (results || []).map((row) => ({
      ...row,
      functional: JSON.parse(row.functional_json || "{}"),
      cognitive: JSON.parse(row.cognitive_json || "{}"),
      evidence: JSON.parse(row.evidence_json || "{}"),
      functional_json: undefined,
      cognitive_json: undefined,
      evidence_json: undefined,
    })),
  });
}

async function createAiReply(request, pin) {
  const body = await readJson(request);
  const message = String(body.userMessage || "").trim();
  const threadId = String(body.threadId || "");
  const text = message.toLowerCase();
  const isConfirmation = /confirm|confirmed|okay|ok|see you|works for me|that works|deal/.test(text);
  const reply = isConfirmation
    ? "Ok see you."
    : threadId === "jia-wei"
      ? "No worries, I can adjust. What afternoon timing works for you?"
      : threadId === "nadiah"
        ? "I am good with afternoons after 3 PM."
        : "Okay, noted.";

  return json({
    ok: true,
    sessionPin: pin,
    reply,
    isConfirmation,
    serverTimestamp: Date.now(),
    source: "server-fallback",
  });
}

async function handleApi(request, env) {
  const url = new URL(request.url);
  const parts = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);

  if (request.method === "GET" && parts[0] === "health") {
    return json({ ok: true, name: "daily-digital-api" });
  }
  if (request.method === "GET" && parts[0] === "accounts" && parts.length === 1) {
    return listAccounts(env);
  }
  if (request.method === "POST" && parts[0] === "accounts" && parts.length === 1) {
    return createAccount(env, await readJson(request));
  }
  if (request.method === "DELETE" && parts[0] === "accounts" && parts[1]) {
    return removeAccount(env, parts[1]);
  }
  if (request.method === "POST" && parts[0] === "login") {
    return loginAccount(env, await readJson(request));
  }
  if (request.method === "POST" && parts[0] === "sessions" && parts.length === 1) {
    return createSession(request, env);
  }
  if (request.method === "POST" && parts[0] === "sessions" && parts[1] && parts[2] === "join") {
    return joinVerifiedSession(request, env, parts[1]);
  }
  if (request.method === "POST" && parts[0] === "sessions" && parts[1] && parts[2] === "ai" && parts[3] === "reply") {
    return createAiReply(request, parts[1]);
  }
  if (parts[0] === "sessions" && parts[1]) {
    return proxySession(request, env, parts[1], parts.slice(2).join("/") || "state");
  }
  if (request.method === "POST" && parts[0] === "records") {
    return saveRecord(request, env);
  }
  if (request.method === "GET" && parts[0] === "accounts" && parts[1] && parts[2] === "report") {
    return getAccountReport(env, parts[1]);
  }
  return error("Route not found.", 404);
}

export class SessionCoordinator {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async load() {
    const session = await this.state.storage.get("session") || null;
    return session ? normalizeSessionShape(session) : null;
  }

  async loadSnapshot() {
    const snapshot = await this.state.storage.get("snapshot") || null;
    return snapshot?.session
      ? { ...snapshot, session: normalizeSessionShape(snapshot.session) }
      : snapshot;
  }

  async save(session) {
    const nextSession = normalizeSessionShape(session);
    await this.state.storage.put("session", nextSession);
    return nextSession;
  }

  async saveSnapshot(snapshot) {
    if (snapshot === null) {
      await this.state.storage.delete("snapshot");
      return null;
    }
    const nextSnapshot = snapshot?.session
      ? { ...snapshot, session: normalizeSessionShape(snapshot.session) }
      : snapshot;
    await this.state.storage.put("snapshot", nextSnapshot);
    this.broadcast({ type: "snapshot", snapshot: nextSnapshot });
    return nextSnapshot;
  }

  broadcast(payload) {
    const message = JSON.stringify(payload);
    for (const socket of this.state.getWebSockets?.() || []) {
      try {
        socket.send(message);
      } catch {
        // The runtime removes disconnected sockets from getWebSockets().
      }
    }
  }

  async fetch(request) {
    const url = new URL(request.url);
    const action = url.pathname.replace(/^\/+/, "");
    const body = request.method === "GET" ? {} : await readJson(request);
    let session = await this.load();

    if (action === "create") {
      session = normalizeSessionShape({
        sessionId: body.sessionId,
        pin: body.pin,
        participantLimit: body.participantLimit || MAX_PARTICIPANTS,
        status: "active",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await this.save(session);
      await this.saveSnapshot(null);
      return json({ session });
    }

    if (!session || session.status !== "active") {
      return error("Session not found or inactive.", 404);
    }

    if (action === "live" && request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.state.acceptWebSocket(server);
      server.serializeAttachment({ pin: session.pin, connectedAt: Date.now() });
      const snapshot = await this.loadSnapshot();
      server.send(JSON.stringify({ type: "snapshot", snapshot }));
      return new Response(null, { status: 101, webSocket: client });
    }

    if (action === "state") {
      return json({ session });
    }

    if (action === "snapshot") {
      if (request.method === "GET") {
        return json({ ok: true, snapshot: await this.loadSnapshot(), session });
      }
      if (request.method === "PUT" || request.method === "POST") {
        const snapshot = body.snapshot || body;
        if (!snapshot?.session || snapshot.session.pin !== session.pin) {
          return error("Snapshot must include the active session PIN.", 400);
        }
        const currentSnapshot = await this.loadSnapshot();
        const protectedSnapshot = protectSessionControls(
          snapshot,
          currentSnapshot,
          body.writerRole || "patient",
          body.writerAccountId || null,
        );
        const nextSnapshot = {
          ...protectedSnapshot,
          savedAt: Date.now(),
          session: normalizeSessionShape({
            ...protectedSnapshot.session,
            pin: session.pin,
            participantLimit: protectedSnapshot.session.participantLimit || session.participantLimit || MAX_PARTICIPANTS,
          }),
        };
        await this.saveSnapshot(nextSnapshot);
        session.participants = nextSnapshot.session.participants || session.participants || [];
        session.assignments = nextSnapshot.session.assignments || session.assignments || {};
        session.updatedAt = Date.now();
        await this.save(session);
        return json({ ok: true, snapshot: nextSnapshot, session });
      }
    }

    if (action === "join" && request.method === "POST") {
      if (!body.accountId || !body.alias) {
        return error("accountId and alias are required.");
      }
      const existing = session.participants.find((item) => item.accountId === body.accountId);
      if (!existing && session.participants.length >= session.participantLimit) {
        return error("Session is full.", 409);
      }
      const participant = {
        accountId: body.accountId,
        alias: body.alias,
        role: body.role || "patient",
        deviceId: body.deviceId || randomId("device"),
        joinedAt: existing?.joinedAt || Date.now(),
        lastSeenAt: Date.now(),
        currentApp: body.currentApp || "home",
        participantCode: body.participantCode || null,
      };
      session.participants = existing
        ? session.participants.map((item) => item.accountId === body.accountId ? { ...item, ...participant } : item)
        : [...session.participants, participant];
      session.updatedAt = Date.now();
      await this.save(session);
      this.broadcast({ type: "session", session });
      const snapshot = await this.loadSnapshot();
      if (snapshot?.session) {
        const snapshotParticipant = {
          ...participant,
          id: participant.deviceId,
          label: participant.alias,
          mode: snapshot.session.userModes?.[participant.accountId] || snapshot.session.mode || "practice",
          activeScenarioId: snapshot.session.assignments?.[participant.accountId]?.at(-1)?.scenarioId || "",
        };
        const snapshotAccount = {
          id: participant.accountId,
          alias: participant.alias,
          pin: body.pin || "",
          participantCode: participant.participantCode,
        };
        const existsInSnapshot = (snapshot.session.participants || []).some((item) => item.accountId === participant.accountId);
        const accountExistsInSnapshot = (snapshot.session.userAccounts || []).some((item) => item.id === participant.accountId);
        await this.saveSnapshot({
          ...snapshot,
          savedAt: Date.now(),
          session: {
            ...snapshot.session,
            userAccounts: accountExistsInSnapshot
              ? snapshot.session.userAccounts
              : [...(snapshot.session.userAccounts || []), snapshotAccount],
            participants: existsInSnapshot
              ? snapshot.session.participants.map((item) => item.accountId === participant.accountId ? { ...item, ...snapshotParticipant } : item)
              : [...(snapshot.session.participants || []), snapshotParticipant],
          },
        });
      }
      if (this.env.DB && session.sessionId) {
        await this.env.DB.prepare(
          `INSERT OR REPLACE INTO session_participants
            (id, session_id, account_id, role, device_id, joined_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        ).bind(
          `${session.sessionId}:${participant.accountId}`,
          session.sessionId,
          participant.accountId,
          participant.role,
          participant.deviceId,
          Math.floor(participant.joinedAt / 1000),
        ).run();
      }
      return json({ ok: true, session });
    }

    if (action === "push" && request.method === "POST") {
      if (!body.targetId || !body.mode) {
        return error("targetId and mode are required.");
      }
      const assignment = {
        id: randomId("assign"),
        targetId: body.targetId,
        mode: body.mode,
        scenarioId: body.scenarioId || null,
        app: body.app || null,
        pushedAt: Date.now(),
      };
      const targets = body.targetId === "all"
        ? session.participants.filter((item) => item.role === "patient").map((item) => item.accountId)
        : [body.targetId];
      targets.forEach((targetId) => {
        session.assignments[targetId] = [...(session.assignments[targetId] || []), assignment];
      });
      session.events = [{ kind: "push", assignment, at: Date.now() }, ...session.events].slice(0, 500);
      session.updatedAt = Date.now();
      await this.save(session);
      this.broadcast({ type: "session", session });
      if (this.env.DB && session.sessionId) {
        await Promise.all(targets.map((targetId) => this.env.DB.prepare(
          `INSERT INTO assignments
            (id, session_id, account_id, mode, scenario_id, app, pushed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          `${assignment.id}:${targetId}`,
          session.sessionId,
          targetId,
          assignment.mode,
          assignment.scenarioId,
          assignment.app,
          Math.floor(assignment.pushedAt / 1000),
        ).run()));
      }
      return json({ ok: true, assignment, session });
    }

    if (action === "event" && request.method === "POST") {
      const event = {
        id: randomId("evt"),
        accountId: body.accountId || null,
        kind: body.kind || "event",
        payload: body.payload || {},
        at: Date.now(),
      };
      session.events = [event, ...session.events].slice(0, 500);
      session.updatedAt = Date.now();
      await this.save(session);
      this.broadcast({ type: "session", session });
      if (this.env.DB && session.sessionId) {
        await this.env.DB.prepare(
          `INSERT INTO audit_log
            (id, session_id, account_id, actor, kind, payload_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          event.id,
          session.sessionId,
          event.accountId,
          body.actor || "device",
          event.kind,
          JSON.stringify(event.payload || {}),
          Math.floor(event.at / 1000),
        ).run();
      }
      return json({ ok: true, event });
    }

    if (action === "end" && request.method === "POST") {
      session.status = "ended";
      session.endedAt = Date.now();
      session.updatedAt = Date.now();
      await this.save(session);
      this.broadcast({ type: "session", session });
      if (this.env.DB && session.sessionId) {
        await this.env.DB.prepare("UPDATE sessions SET status = 'ended', ended_at = unixepoch() WHERE id = ?")
          .bind(session.sessionId)
          .run();
      }
      return json({ ok: true, session });
    }

    return error("Session route not found.", 404);
  }

  async webSocketMessage(socket, message) {
    if (typeof message !== "string") return;
    try {
      const payload = JSON.parse(message);
      if (payload?.type === "get_snapshot") {
        socket.send(JSON.stringify({ type: "snapshot", snapshot: await this.loadSnapshot() }));
      }
    } catch {
      socket.send(JSON.stringify({ type: "error", error: "Invalid live update message." }));
    }
  }

  async webSocketClose(socket, code, reason) {
    socket.close(code, reason);
  }
}

export default {
  async fetch(request, env) {
    const headers = corsHeaders(request, env);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }
    try {
      const url = new URL(request.url);
      if (url.pathname.startsWith("/api/")) {
        const response = await handleApi(request, env);
        if (response.status === 101) {
          return response;
        }
        const next = new Headers(response.headers);
        Object.entries(headers).forEach(([key, value]) => next.set(key, value));
        return new Response(response.body, { status: response.status, headers: next });
      }
      const assets = env.SITE_ASSETS || env.ASSETS;
      if (!assets?.fetch) {
        return error("Static assets binding is not configured.", 500);
      }
      return assets.fetch(request);
    } catch (err) {
      console.error(JSON.stringify({
        kind: "unhandled_worker_error",
        method: request.method,
        path: new URL(request.url).pathname,
        error: err?.message || "Unexpected server error.",
      }));
      return json({ ok: false, error: "Internal service error." }, { status: 500, headers });
    }
  },
};
