const SESSION_KEY = "virtual-ef-session-v2";
const LIVE_STATE_KEY = "virtual-ef-live-state-v2";
const LOCAL_DEVICE_KEY = "virtual-ef-local-device-v2";
const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";

export function createSessionPin() {
  let pin = "";
  const values = new Uint8Array(6);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(values);
    values.forEach((value) => {
      pin += LETTERS[value % LETTERS.length];
    });
    return pin;
  }
  for (let i = 0; i < 6; i += 1) {
    pin += LETTERS[Math.floor(Math.random() * LETTERS.length)];
  }
  return pin;
}

export function createDeviceId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `device-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createParticipantPin() {
  let pin = "";
  const values = new Uint8Array(4);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(values);
    values.forEach((value) => {
      pin += String(value % 10);
    });
    return pin;
  }
  for (let i = 0; i < 4; i += 1) {
    pin += String(Math.floor(Math.random() * 10));
  }
  return pin;
}

export function loadStoredSession() {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function loadStoredLiveState() {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(LIVE_STATE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function loadLocalDeviceState() {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.sessionStorage.getItem(LOCAL_DEVICE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function getLocalDeviceSnapshot(session) {
  return {
    deviceId: session.deviceId,
    joined: session.joined,
    currentUserId: session.currentUserId,
    pendingAlias: session.pendingAlias,
    pendingUserPin: session.pendingUserPin,
    readStimuli: session.readStimuli,
    dismissedStimuli: session.dismissedStimuli,
  };
}

export function getSharedSessionSnapshot(session) {
  return {
    ...session,
    joined: false,
    joinError: "",
    deviceId: null,
    currentUserId: null,
    pendingAlias: "",
    pendingUserPin: "",
    readStimuli: [],
    dismissedStimuli: [],
  };
}

function mergeUniqueBy(itemsA = [], itemsB = [], keyFn) {
  const merged = [];
  const seen = new Set();
  [...itemsA, ...itemsB].forEach((item) => {
    const key = keyFn(item);
    if (seen.has(key)) {
      const index = merged.findIndex((entry) => keyFn(entry) === key);
      merged[index] = { ...merged[index], ...item };
      return;
    }
    seen.add(key);
    merged.push(item);
  });
  return merged;
}

function getRemovedAccountIds(...sessions) {
  return new Set(sessions.flatMap((session) => session?.removedAccountIds || []));
}

function isRemovedAccountItem(item, removedIds) {
  const accountId = item?.accountId || item?.id;
  return accountId && removedIds.has(accountId);
}

function filterRemovedAccountItems(items = [], removedIds) {
  return items.filter((item) => !isRemovedAccountItem(item, removedIds));
}

function filterRemovedAccountMap(map = {}, removedIds) {
  return Object.fromEntries(
    Object.entries(map || {}).filter(([accountId]) => !removedIds.has(accountId)),
  );
}

function mergeAccountMap(current = {}, previous = {}) {
  return {
    ...(previous || {}),
    ...(current || {}),
  };
}

function filterRemovedByAccountMetrics(metrics = {}, removedIds) {
  return {
    ...(metrics || {}),
    byAccount: filterRemovedAccountMap(metrics?.byAccount || {}, removedIds),
  };
}

function mergeAssignments(current = {}, previous = {}) {
  const accountIds = new Set([...Object.keys(previous), ...Object.keys(current)]);
  return [...accountIds].reduce((acc, accountId) => {
    acc[accountId] = mergeUniqueBy(previous[accountId] || [], current[accountId] || [], (item) => item.id || `${item.mode}-${item.scenarioId}-${item.pushedAt}`);
    return acc;
  }, {});
}

function logKey(entry) {
  return entry.id || `${entry.at}-${entry.accountId || ""}-${entry.kind || ""}-${entry.app || ""}-${entry.target || ""}-${entry.stepId || ""}-${entry.checkId || ""}`;
}

function mergeByAccount(current = {}, previous = {}) {
  return {
    ...(previous || {}),
    ...(current || {}),
    byAccount: {
      ...(previous?.byAccount || {}),
      ...(current?.byAccount || {}),
    },
  };
}

function mergeLearnMetricsSnapshot(current = {}, previous = {}) {
  const merged = mergeByAccount(current, previous);
  const accountMetrics = Object.values(merged.byAccount || {});
  const completedByApp = {};
  const timeByAppMs = {};
  const byApp = {};
  let modulesCompleted = 0;
  let correctAttempts = 0;
  let totalAttempts = 0;

  accountMetrics.forEach((metrics) => {
    modulesCompleted += metrics?.modulesCompleted || 0;
    Object.entries(metrics?.completedByApp || {}).forEach(([app, count]) => {
      completedByApp[app] = (completedByApp[app] || 0) + count;
    });
    Object.entries(metrics?.timeByAppMs || {}).forEach(([app, ms]) => {
      timeByAppMs[app] = (timeByAppMs[app] || 0) + ms;
    });
    Object.entries(metrics?.byApp || {}).forEach(([app, attempts]) => {
      byApp[app] = {
        correct: (byApp[app]?.correct || 0) + (attempts?.correct || 0),
        total: (byApp[app]?.total || 0) + (attempts?.total || 0),
      };
    });
    correctAttempts += metrics?.attempts?.correct || 0;
    totalAttempts += metrics?.attempts?.total || 0;
  });

  return {
    ...merged,
    modulesCompleted: Math.max(merged.modulesCompleted || 0, modulesCompleted),
    completedByApp: Object.keys(completedByApp).length ? completedByApp : merged.completedByApp || {},
    timeByAppMs: Object.keys(timeByAppMs).length ? timeByAppMs : merged.timeByAppMs || {},
    attempts: totalAttempts > 0 ? { correct: correctAttempts, total: totalAttempts } : merged.attempts || { correct: 0, total: 0 },
    byApp: Object.keys(byApp).length ? byApp : merged.byApp || {},
  };
}

function mergeMaxNumberMaps(current = {}, previous = {}) {
  const keys = new Set([...Object.keys(previous || {}), ...Object.keys(current || {})]);
  return [...keys].reduce((acc, key) => {
    const currentValue = current?.[key];
    const previousValue = previous?.[key];
    acc[key] = Math.max(
      typeof previousValue === "number" ? previousValue : 0,
      typeof currentValue === "number" ? currentValue : 0,
    );
    return acc;
  }, {});
}

function filterRemovedRecords(records = [], removedAccountIds = new Set()) {
  return (records || [])
    .map((record) => {
      if (!Array.isArray(record.participants)) {
        return record;
      }
      return {
        ...record,
        participants: filterRemovedAccountItems(record.participants, removedAccountIds),
      };
    })
    .filter((record) => !Array.isArray(record.participants) || record.participants.length > 0);
}

export function mergeLiveStateSnapshot(currentSnapshot, previousSnapshot) {
  if (!previousSnapshot?.session || previousSnapshot.session.pin !== currentSnapshot?.session?.pin) {
    return currentSnapshot;
  }
  const removedAccountIds = getRemovedAccountIds(previousSnapshot.session, currentSnapshot.session);
  const removedAccountList = [...removedAccountIds];
  const mergedAssignments = mergeAssignments(currentSnapshot.session.assignments || {}, previousSnapshot.session.assignments || {});
  return {
    ...previousSnapshot,
    ...currentSnapshot,
    session: {
      ...previousSnapshot.session,
      ...currentSnapshot.session,
      removedAccountIds: removedAccountList,
      participants: filterRemovedAccountItems(
        mergeUniqueBy(previousSnapshot.session.participants || [], currentSnapshot.session.participants || [], (item) => item.accountId || item.id),
        removedAccountIds,
      ),
      userAccounts: filterRemovedAccountItems(
        mergeUniqueBy(previousSnapshot.session.userAccounts || [], currentSnapshot.session.userAccounts || [], (item) => item.id || item.alias),
        removedAccountIds,
      ),
      customScenarios: mergeUniqueBy(previousSnapshot.session.customScenarios || [], currentSnapshot.session.customScenarios || [], (item) => item.id),
      records: filterRemovedRecords(
        mergeUniqueBy(previousSnapshot.session.records || [], currentSnapshot.session.records || [], (item) => item.id || `${item.assignmentId}-${item.completedAt}`),
        removedAccountIds,
      ),
      assignments: filterRemovedAccountMap(mergedAssignments, removedAccountIds),
      userModes: filterRemovedAccountMap(mergeAccountMap(currentSnapshot.session.userModes || {}, previousSnapshot.session.userModes || {}), removedAccountIds),
      learnModules: filterRemovedAccountMap(mergeAccountMap(currentSnapshot.session.learnModules || {}, previousSnapshot.session.learnModules || {}), removedAccountIds),
      currentUserId: removedAccountIds.has(currentSnapshot.session.currentUserId) ? null : currentSnapshot.session.currentUserId,
    },
    events: filterRemovedAccountItems(
      mergeUniqueBy(previousSnapshot.events || [], currentSnapshot.events || [], (item) => item.id || `${item.accountId || ""}-${item.source || ""}-${item.createdAt || ""}`),
      removedAccountIds,
    ),
    scheduledSourceIds: [...new Set([...(previousSnapshot.scheduledSourceIds || []), ...(currentSnapshot.scheduledSourceIds || [])])],
    appMutations: mergeMaxNumberMaps(currentSnapshot.appMutations || {}, previousSnapshot.appMutations || {}),
    lastOpenMutationSnapshot: mergeMaxNumberMaps(currentSnapshot.lastOpenMutationSnapshot || {}, previousSnapshot.lastOpenMutationSnapshot || {}),
    learnMetrics: mergeLearnMetricsSnapshot(
      filterRemovedByAccountMetrics(currentSnapshot.learnMetrics || {}, removedAccountIds),
      filterRemovedByAccountMetrics(previousSnapshot.learnMetrics || {}, removedAccountIds),
    ),
    practiceMetrics: filterRemovedByAccountMetrics(mergeByAccount(currentSnapshot.practiceMetrics || {}, previousSnapshot.practiceMetrics || {}), removedAccountIds),
    assessmentMetrics: filterRemovedByAccountMetrics(mergeByAccount(currentSnapshot.assessmentMetrics || {}, previousSnapshot.assessmentMetrics || {}), removedAccountIds),
    cueLog: filterRemovedAccountItems(mergeUniqueBy(previousSnapshot.cueLog || [], currentSnapshot.cueLog || [], logKey), removedAccountIds).slice(-400),
    hiddenLog: filterRemovedAccountItems(mergeUniqueBy(previousSnapshot.hiddenLog || [], currentSnapshot.hiddenLog || [], logKey), removedAccountIds).slice(-400),
  };
}

export function getStoredLiveStateSnapshot(state) {
  return {
    savedAt: Date.now(),
    session: getSharedSessionSnapshot(state.session),
    currentMinutes: state.currentMinutes,
    currentApp: state.currentApp,
    appHistory: state.appHistory,
    tabSwitcherOpen: state.tabSwitcherOpen,
    events: state.events,
    scheduledSourceIds: state.scheduledSourceIds,
    contextSwitches: state.contextSwitches,
    appMutations: state.appMutations,
    lastOpenMutationSnapshot: state.lastOpenMutationSnapshot,
    metrics: state.metrics,
    interactionMetrics: state.interactionMetrics,
    learnMetrics: state.learnMetrics,
    practiceMetrics: state.practiceMetrics,
    assessmentMetrics: state.assessmentMetrics,
    checklistScores: state.checklistScores,
    adminNotes: state.adminNotes,
    cueLog: state.cueLog,
    hiddenLog: state.hiddenLog,
  };
}

export function saveLocalDeviceState(session) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.sessionStorage.setItem(LOCAL_DEVICE_KEY, JSON.stringify(getLocalDeviceSnapshot(session)));
  } catch {
    // Session storage can be blocked in hardened browser contexts.
  }
}

export function saveStoredSession(session) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(getSharedSessionSnapshot(session)));
  } catch {
    // Local storage can be blocked in hardened browser contexts.
  }
}

export function saveStoredLiveState(state) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    const currentSnapshot = getStoredLiveStateSnapshot(state);
    const previousSnapshot = loadStoredLiveState();
    window.localStorage.setItem(LIVE_STATE_KEY, JSON.stringify(mergeLiveStateSnapshot(currentSnapshot, previousSnapshot)));
  } catch {
    // Local storage can be blocked in hardened browser contexts.
  }
}

export function liveStateStorageKey() {
  return LIVE_STATE_KEY;
}
