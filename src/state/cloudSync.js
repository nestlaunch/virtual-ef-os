import { getStoredLiveStateSnapshot, mergeLiveStateSnapshot } from "./sessionStore.js";

const API_BASE_URL = String(import.meta.env?.VITE_API_BASE_URL || "").replace(/\/+$/, "");
const SYNC_STATE_KEY = "daily-digital-cloud-sync-v2";
const SYNC_INTERVAL_MS = 2500;

let lastSyncAt = 0;
let activeSyncPromise = null;
let queuedForcedState = null;
let disabledUntil = 0;

function readSyncState() {
  try {
    return JSON.parse(window.localStorage.getItem(SYNC_STATE_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeSyncState(syncState) {
  try {
    window.localStorage.setItem(SYNC_STATE_KEY, JSON.stringify(syncState));
  } catch {
    // Best-effort sync should never interrupt therapy flow.
  }
}

async function apiFetch(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    const error = new Error(`API ${response.status}`);
    error.status = response.status;
    throw error;
  }
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    const error = new Error("API did not return JSON");
    error.status = 0;
    throw error;
  }
  return response.json();
}

export function getCloudApiBaseUrl() {
  return API_BASE_URL;
}

async function apiFetchOptional(path, options = {}) {
  try {
    return await apiFetch(path, options);
  } catch (err) {
    if (err?.status === 0 || err?.status === 404 || err?.status === 405) {
      disabledUntil = Date.now() + 60000;
    }
    return null;
  }
}

export function getRecordPayload(record, participant, sessionId) {
  return {
    id: `${record.id || "record"}:${participant.accountId}:${participant.attempt || 1}`,
    accountId: participant.accountId,
    sessionId: record.sessionId || sessionId || null,
    mode: participant.mode || record.mode || "practice",
    scenarioId: participant.scenarioId || record.scenarioId || null,
    startedAt: participant.startedAt || record.startedAt || null,
    completedAt: participant.completedAt || record.completedAt || Date.now(),
    functional: {
      completion: participant.completion,
      checklist: participant.checklistScores || participant.checklist || {},
      taskEvidence: participant.taskEvidence,
      apps: participant.apps,
      attempt: participant.attempt,
    },
    cognitive: participant.cognitiveMetrics || participant.cognitive || {},
    evidence: {
      participant,
      recordSummary: {
        id: record.id,
        mode: record.mode,
        notes: record.notes,
        metrics: record.metrics,
        learnMetrics: record.learnMetrics,
        practiceMetrics: record.practiceMetrics,
        assessmentMetrics: record.assessmentMetrics,
      },
    },
  };
}

function shouldUseCloudSync() {
  return typeof window !== "undefined"
    && typeof fetch === "function"
    && window.location.protocol !== "file:"
    && Date.now() > disabledUntil;
}

function normalizePin(pin) {
  return String(pin || "").trim().toUpperCase();
}

function mergeAccounts(localAccounts = [], cloudAccounts = []) {
  const byKey = new Map();
  [...localAccounts, ...cloudAccounts].forEach((account) => {
    if (!account?.id && !account?.alias) {
      return;
    }
    const key = String(account.alias || account.id).trim().toLowerCase();
    const existing = byKey.get(key) || {};
    byKey.set(key, {
      ...existing,
      ...account,
      pin: account.pin || existing.pin || "",
    });
  });
  return [...byKey.values()].sort((a, b) => String(a.alias || "").localeCompare(String(b.alias || "")));
}

export function applyCloudControlledSessionFields(localSnapshot, cloudSnapshot, currentUserId) {
  if (!currentUserId || !cloudSnapshot?.session || !localSnapshot?.session) {
    return localSnapshot;
  }
  const cloudParticipants = new Map(
    (cloudSnapshot.session.participants || []).map((participant) => [participant.accountId, participant]),
  );
  const participants = (localSnapshot.session.participants || []).map((participant) => {
    const cloudParticipant = cloudParticipants.get(participant.accountId);
    if (!cloudParticipant) {
      return participant;
    }
    return {
      ...participant,
      mode: cloudParticipant.mode || participant.mode,
      activeScenarioId: cloudParticipant.activeScenarioId ?? participant.activeScenarioId ?? "",
    };
  });
  return {
    ...localSnapshot,
    session: {
      ...localSnapshot.session,
      mode: cloudSnapshot.session.mode || localSnapshot.session.mode,
      assignments: cloudSnapshot.session.assignments || {},
      userModes: cloudSnapshot.session.userModes || {},
      learnModules: cloudSnapshot.session.learnModules || {},
      customStimuli: cloudSnapshot.session.customStimuli || [],
      customScenarios: cloudSnapshot.session.customScenarios || localSnapshot.session.customScenarios || [],
      participants,
    },
  };
}

export function applyAdminControlledSessionFields(mergedSnapshot, adminSnapshot) {
  if (!mergedSnapshot?.session || !adminSnapshot?.session) {
    return mergedSnapshot;
  }
  return {
    ...mergedSnapshot,
    session: {
      ...mergedSnapshot.session,
      mode: adminSnapshot.session.mode,
      controlRevision: adminSnapshot.session.controlRevision,
      assignments: adminSnapshot.session.assignments || {},
      userModes: adminSnapshot.session.userModes || {},
      learnModules: adminSnapshot.session.learnModules || {},
      customStimuli: adminSnapshot.session.customStimuli || [],
      customScenarios: adminSnapshot.session.customScenarios || [],
    },
  };
}

export function getCloudSyncIntervalMs() {
  return SYNC_INTERVAL_MS;
}

export async function listCloudAccounts() {
  if (!shouldUseCloudSync()) {
    return [];
  }
  const payload = await apiFetchOptional("/api/accounts");
  return Array.isArray(payload?.accounts) ? payload.accounts : [];
}

export async function createCloudAccount(alias, participantPin, preferredId = "") {
  if (!shouldUseCloudSync()) {
    return { ok: false, status: 0, error: "The online service is unavailable. Please try again." };
  }
  try {
    return await apiFetch("/api/accounts", {
      method: "POST",
      body: JSON.stringify({
        id: preferredId || undefined,
        alias,
        pin: participantPin,
      }),
    });
  } catch (err) {
    return {
      ok: false,
      status: err?.status || 0,
      error: err?.status >= 500
        ? "The account service had a problem. Please try again shortly."
        : "Unable to create this account.",
    };
  }
}

export async function loginCloudAccount(alias, participantPin) {
  if (!shouldUseCloudSync()) {
    return { ok: false, status: 0, error: "The online service is unavailable. Please try again." };
  }
  const cleanAlias = String(alias || "").trim();
  const cleanPin = String(participantPin || "").trim();
  if (!cleanAlias || !/^\d{4}$/.test(cleanPin)) {
    return { ok: false, status: 400, error: "Select an alias and enter its 4-digit PIN." };
  }
  try {
    const payload = await apiFetch("/api/login", {
      method: "POST",
      body: JSON.stringify({ alias: cleanAlias, pin: cleanPin }),
    });
    return { ok: true, account: payload.account };
  } catch (err) {
    return {
      ok: false,
      status: err?.status || 0,
      error: err?.status >= 500 || err?.status === 0
        ? "The account service had a problem. Please try again shortly."
        : "That alias and 4-digit PIN do not match.",
    };
  }
}

export async function loadCloudSessionSnapshot(pin) {
  const cleanPin = normalizePin(pin);
  if (!shouldUseCloudSync() || !/^[A-Z0-9]{6}$/.test(cleanPin)) {
    return null;
  }
  const payload = await apiFetchOptional(`/api/sessions/${cleanPin}/snapshot`);
  return payload?.snapshot?.session ? payload.snapshot : null;
}

async function loadCloudSessionState(pin) {
  const cleanPin = normalizePin(pin);
  if (!shouldUseCloudSync() || !/^[A-Z0-9]{6}$/.test(cleanPin)) {
    return null;
  }
  const payload = await apiFetchOptional(`/api/sessions/${cleanPin}/state`);
  return payload?.session || null;
}

export async function prepareCloudJoin(pin, alias, participantPin, state, authenticatedAccount = null) {
  const cleanPin = normalizePin(pin);
  let snapshot = await loadCloudSessionSnapshot(cleanPin);
  const session = snapshot?.session || await loadCloudSessionState(cleanPin);
  if (!session) {
    return { ok: false, error: "Session PIN not found. Ask the admin to keep the admin panel open and wait a few seconds after creating the session." };
  }

  const cleanAlias = String(alias || "").trim();
  let account = authenticatedAccount?.id
    && String(authenticatedAccount.alias || "").trim().toLowerCase() === cleanAlias.toLowerCase()
    ? authenticatedAccount
    : null;
  if (!account) {
    const login = await loginCloudAccount(cleanAlias, participantPin);
    if (!login.ok) {
      return { ok: false, error: login.error };
    }
    account = login.account;
  }

  const joinPayload = await apiFetchOptional(`/api/sessions/${cleanPin}/join`, {
    method: "POST",
    body: JSON.stringify({
      accountId: account.id,
      alias: account.alias,
      pin: participantPin,
      role: "patient",
      deviceId: state.session.deviceId,
      currentApp: state.currentApp || "home",
      participantCode: account.participantCode || account.participant_code || null,
    }),
  });
  if (!joinPayload?.session) {
    return { ok: false, error: "Unable to join this session. Please confirm the PIN and try again." };
  }

  snapshot = await loadCloudSessionSnapshot(cleanPin);
  if (!snapshot?.session) {
    snapshot = {
      savedAt: Date.now(),
      session: joinPayload.session,
    };
  }

  return { ok: true, snapshot, account };
}

async function performCloudSync(state) {
  lastSyncAt = Date.now();
  const syncState = readSyncState();
  const isAdminClient = window.location.pathname.replace(/\/+$/, "") === "/admin";
  const isJoinedPatient = Boolean(state.session.joined && state.session.currentUserId);
  if (!isAdminClient && !isJoinedPatient) {
    return null;
  }
  try {
    const accounts = state.session.userAccounts || [];
    for (const account of isAdminClient ? accounts : []) {
      if (!account?.id || !account?.alias || !account?.pin || syncState[`account:${account.id}`]) {
        continue;
      }
      await apiFetch("/api/accounts", {
        method: "POST",
        body: JSON.stringify({ id: account.id, alias: account.alias, pin: account.pin }),
      });
      syncState[`account:${account.id}`] = Date.now();
    }

    const pin = state.session.pin;
    if (isAdminClient && pin && /^[A-Z0-9]{6}$/.test(pin)) {
      const payload = await apiFetch("/api/sessions", {
        method: "POST",
        body: JSON.stringify({ pin }),
      });
      syncState[`session:${pin}`] = payload.session?.sessionId || payload.session?.id || Date.now();
    }

    const hiddenLog = state.hiddenLog || [];
    const sentLogCount = syncState[`events:${pin}`] || 0;
    const newEvents = hiddenLog.slice(sentLogCount, sentLogCount + 25);
    for (const entry of newEvents) {
      if (!pin) {
        break;
      }
      await apiFetchOptional(`/api/sessions/${pin}/event`, {
        method: "POST",
        body: JSON.stringify({
          accountId: entry.accountId || state.session.currentUserId || null,
          kind: entry.kind || "interaction",
          payload: entry,
        }),
      });
    }
    if (newEvents.length > 0) {
      syncState[`events:${pin}`] = sentLogCount + newEvents.length;
    }

    const removedAccountIds = state.session.removedAccountIds || [];
    for (const accountId of isAdminClient ? removedAccountIds : []) {
      if (!accountId || syncState[`removed:${accountId}`]) {
        continue;
      }
      await apiFetch(`/api/accounts/${encodeURIComponent(accountId)}`, { method: "DELETE" });
      syncState[`removed:${accountId}`] = Date.now();
    }

    for (const record of state.session.records || []) {
      for (const participant of record.participants || []) {
        const payload = getRecordPayload(record, participant, syncState[`session:${record.pin || pin}`]);
        if (!participant.accountId || syncState[`record:${payload.id}`]) {
          continue;
        }
        await apiFetch("/api/records", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        syncState[`record:${payload.id}`] = Date.now();
      }
    }

    if (pin && /^[A-Z0-9]{6}$/.test(pin)) {
      const cloudAccounts = await listCloudAccounts();
      const localSnapshot = getStoredLiveStateSnapshot(state);
      const localSnapshotWithAccounts = {
        ...localSnapshot,
        session: {
          ...localSnapshot.session,
          userAccounts: mergeAccounts(localSnapshot.session.userAccounts || [], cloudAccounts),
        },
      };
      const cloudPayload = await apiFetchOptional(`/api/sessions/${pin}/snapshot`);
      const cloudSnapshot = cloudPayload?.snapshot?.session ? cloudPayload.snapshot : null;
      const publishSnapshot = applyCloudControlledSessionFields(
        localSnapshotWithAccounts,
        cloudSnapshot,
        state.session.currentUserId,
      );
      const mergedSnapshot = mergeLiveStateSnapshot(publishSnapshot, cloudSnapshot);
      const outboundSnapshot = isAdminClient
        ? applyAdminControlledSessionFields(mergedSnapshot, publishSnapshot)
        : mergedSnapshot;
      await apiFetch(`/api/sessions/${pin}/snapshot`, {
        method: "PUT",
        body: JSON.stringify({
          snapshot: outboundSnapshot,
          writerRole: isAdminClient ? "admin" : "patient",
          writerAccountId: state.session.currentUserId || null,
        }),
      });
      writeSyncState(syncState);
      return cloudSnapshot ? outboundSnapshot : null;
    }

    writeSyncState(syncState);
  } catch (err) {
    if (err?.status === 0 || err?.status === 404 || err?.status === 405) {
      disabledUntil = Date.now() + 60000;
    }
    writeSyncState(syncState);
    return null;
  }
  return null;
}

export async function syncCloudState(state, options = {}) {
  const force = Boolean(options.force);
  if (!shouldUseCloudSync() || (!force && Date.now() - lastSyncAt < SYNC_INTERVAL_MS)) {
    return null;
  }
  if (activeSyncPromise) {
    if (force) {
      queuedForcedState = state;
    }
    return activeSyncPromise;
  }

  activeSyncPromise = (async () => {
    let nextState = state;
    let result = null;
    do {
      queuedForcedState = null;
      result = await performCloudSync(nextState);
      nextState = queuedForcedState;
    } while (nextState);
    return result;
  })();

  try {
    return await activeSyncPromise;
  } finally {
    activeSyncPromise = null;
  }
}
