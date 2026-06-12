const SYNC_STATE_KEY = "daily-digital-cloud-sync-v1";
const SYNC_INTERVAL_MS = 2500;

let lastSyncAt = 0;
let syncInFlight = false;

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
  const response = await fetch(path, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    throw new Error(`API ${response.status}`);
  }
  return response.json();
}

function getParticipantAccount(state, accountId) {
  return state.session.userAccounts.find((account) => account.id === accountId)
    || state.session.participants.find((participant) => participant.accountId === accountId);
}

function getRecordPayload(record, participant, sessionId) {
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
      checklist: participant.checklist,
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
    && window.location.protocol !== "file:";
}

export function getCloudSyncIntervalMs() {
  return SYNC_INTERVAL_MS;
}

export async function syncCloudState(state) {
  if (!shouldUseCloudSync() || syncInFlight || Date.now() - lastSyncAt < SYNC_INTERVAL_MS) {
    return;
  }
  syncInFlight = true;
  lastSyncAt = Date.now();
  const syncState = readSyncState();
  try {
    const accounts = state.session.userAccounts || [];
    for (const account of accounts) {
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
    if (pin && !syncState[`session:${pin}`]) {
      const payload = await apiFetch("/api/sessions", {
        method: "POST",
        body: JSON.stringify({ pin }),
      });
      syncState[`session:${pin}`] = payload.session?.sessionId || payload.session?.id || Date.now();
    }

    for (const participant of state.session.participants || []) {
      if (!pin || participant.role !== "patient" || syncState[`join:${pin}:${participant.accountId}`]) {
        continue;
      }
      const account = getParticipantAccount(state, participant.accountId);
      if (!account?.alias) {
        continue;
      }
      await apiFetch(`/api/sessions/${pin}/join`, {
        method: "POST",
        body: JSON.stringify({
          accountId: participant.accountId,
          alias: account.alias,
          role: "patient",
          deviceId: participant.deviceId || state.session.deviceId,
          currentApp: participant.currentApp || state.currentApp || "home",
        }),
      });
      syncState[`join:${pin}:${participant.accountId}`] = Date.now();
    }

    const hiddenLog = state.hiddenLog || [];
    const sentLogCount = syncState[`events:${pin}`] || 0;
    const newEvents = hiddenLog.slice(sentLogCount, sentLogCount + 25);
    for (const entry of newEvents) {
      if (!pin) {
        break;
      }
      await apiFetch(`/api/sessions/${pin}/event`, {
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
    for (const accountId of removedAccountIds) {
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

    writeSyncState(syncState);
  } catch {
    writeSyncState(syncState);
  } finally {
    syncInFlight = false;
  }
}
