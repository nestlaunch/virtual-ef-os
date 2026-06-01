const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_PARTICIPANTS = 6;

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

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function corsHeaders(request, env) {
  const origin = request.headers.get("origin") || "";
  const allowed = (env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const allowOrigin = allowed.length === 0 || allowed.includes(origin) ? origin || "*" : allowed[0];
  return {
    "access-control-allow-origin": allowOrigin,
    "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type,authorization",
    "access-control-max-age": "86400",
  };
}

async function hashPin(pin, salt) {
  const bytes = new TextEncoder().encode(`${salt}:${pin}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function sessionStub(env, pin) {
  const id = env.SESSION_DO.idFromName(pin);
  return env.SESSION_DO.get(id);
}

async function createAccount(env, body) {
  const alias = String(body.alias || "").trim();
  const pin = String(body.pin || "").trim();
  if (!alias || !/^\d{4}$/.test(pin)) {
    return error("Alias and 4-digit PIN are required.");
  }
  const existing = await env.DB.prepare("SELECT id FROM accounts WHERE alias = ? AND removed_at IS NULL")
    .bind(alias)
    .first();
  if (existing) {
    return error("Alias already exists.", 409);
  }
  const accountId = randomId("acct");
  const salt = crypto.randomUUID();
  const pinHash = await hashPin(pin, salt);
  await env.DB.prepare(
    "INSERT INTO accounts (id, alias, pin_salt, pin_hash, created_at) VALUES (?, ?, ?, ?, unixepoch())",
  ).bind(accountId, alias, salt, pinHash).run();
  return json({ ok: true, account: { id: accountId, alias } }, { status: 201 });
}

async function loginAccount(env, body) {
  const alias = String(body.alias || "").trim();
  const pin = String(body.pin || "").trim();
  const account = await env.DB.prepare(
    "SELECT id, alias, pin_salt, pin_hash FROM accounts WHERE alias = ? AND removed_at IS NULL",
  ).bind(alias).first();
  if (!account || account.pin_hash !== await hashPin(pin, account.pin_salt)) {
    return error("Invalid login details.", 401);
  }
  return json({ ok: true, account: { id: account.id, alias: account.alias } });
}

async function listAccounts(env) {
  const { results } = await env.DB.prepare(
    "SELECT id, alias, created_at FROM accounts WHERE removed_at IS NULL ORDER BY created_at DESC",
  ).all();
  return json({ ok: true, accounts: results || [] });
}

async function createSession(request, env) {
  const body = await readJson(request);
  const pin = body.pin && /^[A-Z0-9]{6}$/.test(String(body.pin)) ? String(body.pin) : randomPin();
  const sessionId = randomId("sess");
  await env.DB.prepare(
    "INSERT INTO sessions (id, pin, status, created_at, expires_at) VALUES (?, ?, 'active', unixepoch(), ?)",
  ).bind(sessionId, pin, Math.floor((Date.now() + SESSION_TTL_MS) / 1000)).run();
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
  const url = new URL(request.url);
  const target = new URL(`https://session/${action}`);
  target.search = url.search;
  return sessionStub(env, pin).fetch(target, request);
}

async function saveRecord(request, env) {
  const body = await readJson(request);
  const recordId = body.id || randomId("rec");
  if (!body.accountId || !body.mode) {
    return error("accountId and mode are required.");
  }
  await env.DB.prepare(
    `INSERT INTO records (
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
    "SELECT id, alias, created_at FROM accounts WHERE id = ? AND removed_at IS NULL",
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

async function handleApi(request, env) {
  const url = new URL(request.url);
  const parts = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);

  if (request.method === "GET" && parts[0] === "health") {
    return json({ ok: true, name: "daily-digital-api" });
  }
  if (request.method === "GET" && parts[0] === "accounts") {
    return listAccounts(env);
  }
  if (request.method === "POST" && parts[0] === "accounts") {
    return createAccount(env, await readJson(request));
  }
  if (request.method === "POST" && parts[0] === "login") {
    return loginAccount(env, await readJson(request));
  }
  if (request.method === "POST" && parts[0] === "sessions" && parts.length === 1) {
    return createSession(request, env);
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
    return await this.state.storage.get("session") || null;
  }

  async save(session) {
    await this.state.storage.put("session", session);
    return session;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const action = url.pathname.replace(/^\/+/, "");
    const body = request.method === "GET" ? {} : await readJson(request);
    let session = await this.load();

    if (action === "create") {
      session = {
        sessionId: body.sessionId,
        pin: body.pin,
        participantLimit: body.participantLimit || MAX_PARTICIPANTS,
        participants: [],
        assignments: {},
        events: [],
        status: "active",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await this.save(session);
      return json({ session });
    }

    if (!session || session.status !== "active") {
      return error("Session not found or inactive.", 404);
    }

    if (action === "state") {
      return json({ session });
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
      };
      session.participants = existing
        ? session.participants.map((item) => item.accountId === body.accountId ? { ...item, ...participant } : item)
        : [...session.participants, participant];
      session.updatedAt = Date.now();
      await this.save(session);
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
      return json({ ok: true, event });
    }

    if (action === "end" && request.method === "POST") {
      session.status = "ended";
      session.endedAt = Date.now();
      session.updatedAt = Date.now();
      await this.save(session);
      if (this.env.DB && session.sessionId) {
        await this.env.DB.prepare("UPDATE sessions SET status = 'ended', ended_at = unixepoch() WHERE id = ?")
          .bind(session.sessionId)
          .run();
      }
      return json({ ok: true, session });
    }

    return error("Session route not found.", 404);
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
        const next = new Headers(response.headers);
        Object.entries(headers).forEach(([key, value]) => next.set(key, value));
        return new Response(response.body, { status: response.status, headers: next });
      }
      return env.ASSETS.fetch(request);
    } catch (err) {
      return json({ ok: false, error: err?.message || "Unexpected server error." }, { status: 500, headers });
    }
  },
};
