import { createContext, useContext, useEffect, useMemo, useReducer } from "react";
import { formalThreads, initialEvents, calendarMeta } from "./seedData";
import { APP_CATALOG, SCENARIO_LIBRARY, createInitialChecklistScores } from "./v2Assessment";
import { createDeviceId, createParticipantPin, createSessionPin, liveStateStorageKey, loadLocalDeviceState, loadStoredLiveState, loadStoredSession, saveLocalDeviceState, saveStoredLiveState, saveStoredSession } from "./sessionStore";
import { summarizeInteractions } from "./sessionMetrics";
import { applyLearnModuleAssignment, applyModeSelection, applyScenarioAssignment, attachExperienceRatingToRecords, canJoinActiveSession, clearEndedSessionForPush, getCurrentAssignment, invalidateCompletedSessionPin, preserveLocalSessionIdentity, resetSessionForNewPin, resolveInitialCurrentApp, resolvePushTargets, shouldAdoptSharedApp, startAssessmentTiming } from "./sessionLifecycle";
import { baseLearnMetrics, mergeLearnAccountMetrics, mergeLearnMetrics, updateLearnAccuracy } from "./learnMetrics";
import { appendParticipantProgressRecord, createTaskEvidenceSnapshot, getParticipantScenarioRecord } from "./progressRecords";
import { removeAccountsFromByAccount } from "./modeMetrics";

const MINUTES_PER_DAY = 24 * 60;
const CLOCK_SPEED = 6;

const rigidAppointments = formalThreads
  .flatMap((thread) => thread.messages)
  .filter((msg) => msg.appointment)
  .map((msg) => msg.appointment);

const storedSession = loadStoredSession();
const storedLiveState = loadStoredLiveState();
const localDeviceState = loadLocalDeviceState();
const storedEffectiveSession = storedLiveState?.session || storedSession;
const initialPin = storedEffectiveSession?.pin || createSessionPin();

const initialState = {
  session: {
    pin: initialPin,
    mode: storedEffectiveSession?.mode || "practice",
    joined: localDeviceState?.joined || false,
    deviceId: localDeviceState?.deviceId || createDeviceId(),
    participantLimit: 6,
    participants: storedEffectiveSession?.participants || [],
    userAccounts: storedEffectiveSession?.userAccounts || [],
    removedAccountIds: storedEffectiveSession?.removedAccountIds || [],
    currentUserId: localDeviceState?.currentUserId || null,
    pendingAlias: localDeviceState?.pendingAlias || "",
    pendingUserPin: localDeviceState?.pendingUserPin || "",
    userModes: storedEffectiveSession?.userModes || {},
    assignments: storedEffectiveSession?.assignments || {},
    learnModules: storedEffectiveSession?.learnModules || {},
    customScenarios: storedEffectiveSession?.customScenarios || [],
    records: storedEffectiveSession?.records || [],
    endingStartedAt: storedEffectiveSession?.endingStartedAt || null,
    endedAt: storedEffectiveSession?.endedAt || null,
    experienceRatings: storedEffectiveSession?.experienceRatings || {},
    readStimuli: localDeviceState?.readStimuli || [],
    dismissedStimuli: localDeviceState?.dismissedStimuli || [],
    startedAt: storedLiveState?.session?.startedAt || Date.now(),
    firstEntryAt: storedLiveState?.session?.firstEntryAt || null,
    completedAt: storedLiveState?.session?.completedAt || null,
  },
  workspace: {
    view: "admin",
  },
  currentMinutes: storedLiveState?.currentMinutes || 8 * 60,
  currentApp: resolveInitialCurrentApp(storedLiveState, localDeviceState),
  appHistory: localDeviceState?.currentUserId ? [] : storedLiveState?.appHistory || [],
  tabSwitcherOpen: localDeviceState?.currentUserId ? false : storedLiveState?.tabSwitcherOpen || false,
  events: storedLiveState?.events || initialEvents,
  scheduledSourceIds: storedLiveState?.scheduledSourceIds || initialEvents.map((event) => event.sourceId).filter(Boolean),
  contextSwitches: storedLiveState?.contextSwitches || 0,
  appMutations: {
    calendar: storedLiveState?.appMutations?.calendar || 0,
    sms: storedLiveState?.appMutations?.sms || 0,
    whatsapp: storedLiveState?.appMutations?.whatsapp || 0,
    maps: storedLiveState?.appMutations?.maps || 0,
    bank: storedLiveState?.appMutations?.bank || 0,
    settings: storedLiveState?.appMutations?.settings || 0,
    home: storedLiveState?.appMutations?.home || 0,
  },
  lastOpenMutationSnapshot: {
    calendar: storedLiveState?.lastOpenMutationSnapshot?.calendar || 0,
    sms: storedLiveState?.lastOpenMutationSnapshot?.sms || 0,
    whatsapp: storedLiveState?.lastOpenMutationSnapshot?.whatsapp || 0,
    maps: storedLiveState?.lastOpenMutationSnapshot?.maps || 0,
    bank: storedLiveState?.lastOpenMutationSnapshot?.bank || 0,
    settings: storedLiveState?.lastOpenMutationSnapshot?.settings || 0,
    home: storedLiveState?.lastOpenMutationSnapshot?.home || 0,
  },
  metrics: storedLiveState?.metrics || {
    omissionErrors: rigidAppointments.length,
    perseveration: 0,
    ruleBreaking: 0,
    contextSwitches: 0,
    whatsappReplies: {},
    whatsappConfirmed: {},
    whatsappFriendConfirmed: {},
    correctedErrors: 0,
    inhibitionFailure: {
      noiseMs: 0,
      taskMs: 0,
    },
  },
  interactionMetrics: storedLiveState?.interactionMetrics || {
    clicks: 0,
    inputFocuses: 0,
    typingStarts: 0,
    typingLatencyTotalMs: 0,
    typingLatencySamples: 0,
    backPresses: 0,
    homePresses: 0,
    recentPresses: 0,
    cueCount: 0,
    timeToFirstActionMs: null,
  },
  learnMetrics: mergeLearnMetrics(storedLiveState?.learnMetrics),
  practiceMetrics: mergePracticeMetrics(storedLiveState?.practiceMetrics),
  assessmentMetrics: mergeAssessmentMetrics(storedLiveState?.assessmentMetrics),
  checklistScores: storedLiveState?.checklistScores || createInitialChecklistScores(),
  adminNotes: storedLiveState?.adminNotes || "",
  cueLog: storedLiveState?.cueLog || [],
  hiddenLog: storedLiveState?.hiddenLog || [],
};

function minutesToClock(minutes) {
  const normalized = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const h = String(Math.floor(normalized / 60)).padStart(2, "0");
  const m = String(normalized % 60).padStart(2, "0");
  return `${h}:${m}`;
}

function overlaps(a, b) {
  if ((a.month ?? calendarMeta.todayMonth) !== (b.month ?? calendarMeta.todayMonth)) {
    return false;
  }
  return a.date === b.date && a.start < b.end && b.start < a.end;
}

function capturesAppointment(event, appointment) {
  const eventYear = event.year ?? calendarMeta.todayYear;
  const eventMonth = event.month ?? calendarMeta.todayMonth;
  const appointmentYear = appointment.year ?? calendarMeta.todayYear;
  const appointmentMonth = appointment.month ?? calendarMeta.todayMonth;
  return eventYear === appointmentYear
    && eventMonth === appointmentMonth
    && event.date === appointment.date
    && event.start <= appointment.start
    && event.end >= appointment.end;
}

function calculateRuleBreaking(events) {
  let violations = 0;
  const buckets = events.reduce((acc, event) => {
    const key = `${event.year ?? calendarMeta.todayYear}-${event.month ?? calendarMeta.todayMonth}-${event.date}`;
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(event);
    return acc;
  }, {});

  Object.values(buckets).forEach((dayEvents) => {
    const sorted = [...dayEvents].sort((a, b) => a.start - b.start);
    if (sorted.length > 4) {
      violations += sorted.length - 4;
    }
    for (let i = 1; i < sorted.length; i += 1) {
      if (sorted[i].start - sorted[i - 1].end < 30) {
        violations += 1;
      }
    }
  });

  events.forEach((a, idx) => {
    if (a.rigid || a.source === "SMS") {
      return;
    }
    for (let j = 0; j < events.length; j += 1) {
      if (idx === j) {
        continue;
      }
      const b = events[j];
      if ((b.rigid || b.source === "SMS") && overlaps(a, b)) {
        violations += 1;
      }
    }
  });

  return violations;
}

function countIncompleteErrors(events) {
  return events.filter((event) => {
    const missingName = !String(event.title || "").trim() || String(event.title || "").trim().toLowerCase() === "untitled";
    const missingDuration = typeof event.end !== "number" || typeof event.start !== "number" || event.end <= event.start;
    return missingName || missingDuration;
  }).length;
}

function getEventsForAccount(events, accountId) {
  return events.filter((event) => !event.accountId || !accountId || event.accountId === accountId);
}

function countCalendarErrors(state) {
  const accountEvents = getEventsForAccount(state.events, state.session.currentUserId);
  const omissionErrors = rigidAppointments.filter((appointment) => (
    !state.scheduledSourceIds.includes(appointment.id)
    && !accountEvents.some((event) => event.source === "Calendar" && capturesAppointment(event, appointment))
  )).length;
  return omissionErrors + calculateRuleBreaking(accountEvents) + countIncompleteErrors(accountEvents);
}

function recalcMetrics(state) {
  const accountEvents = getEventsForAccount(state.events, state.session.currentUserId);
  const omissionErrors = rigidAppointments.filter((appointment) => (
    !state.scheduledSourceIds.includes(appointment.id)
    && !accountEvents.some((event) => event.source === "Calendar" && capturesAppointment(event, appointment))
  )).length;
  const ruleBreaking = calculateRuleBreaking(accountEvents);
  return {
    ...state.metrics,
    omissionErrors,
    ruleBreaking,
    contextSwitches: state.contextSwitches,
  };
}

function appendLog(state, entry) {
  const accountId = entry.accountId || state.session.currentUserId || null;
  const mode = accountId ? state.session.userModes?.[accountId] || state.session.mode : state.session.mode;
  return [...state.hiddenLog.slice(-399), { at: Date.now(), simClock: minutesToClock(state.currentMinutes), accountId, mode, ...entry }];
}

function markFirstAction(state, at = Date.now()) {
  if (state.interactionMetrics.timeToFirstActionMs !== null) {
    return state.interactionMetrics;
  }
  return {
    ...state.interactionMetrics,
    timeToFirstActionMs: at - state.session.startedAt,
  };
}

function persistSessionState(state) {
  saveStoredSession(state.session);
  saveLocalDeviceState(state.session);
  saveStoredLiveState(state);
  return state;
}

function updateCurrentParticipant(state, patch) {
  const userId = state.session.currentUserId;
  if (!userId) {
    return state.session.participants;
  }
  return state.session.participants.map((participant) => (
    participant.accountId === userId ? { ...participant, ...patch, lastSeenAt: Date.now() } : participant
  ));
}

function getCurrentLearnApp(state) {
  const userId = state.session.currentUserId;
  if (!userId) {
    return null;
  }
  const mode = state.session.userModes[userId] || state.session.mode;
  return mode === "learn" ? state.session.learnModules?.[userId] || null : null;
}

function baseMetrics() {
  return {
    omissionErrors: rigidAppointments.length,
    perseveration: 0,
    ruleBreaking: 0,
    contextSwitches: 0,
    whatsappReplies: {},
    whatsappConfirmed: {},
    whatsappFriendConfirmed: {},
    correctedErrors: 0,
    inhibitionFailure: {
      noiseMs: 0,
      taskMs: 0,
    },
  };
}

function basePracticeMetrics() {
  return {
    byAccount: {},
  };
}

function basePracticeAccountMetrics() {
  return {
    scenarioId: "",
    assignmentId: "",
    startedAt: null,
    completedAt: null,
    attempt: 1,
    supportMode: "checklist",
    completedSteps: [],
    promptCount: 0,
    highestPromptLevel: 0,
    wrongStepAttempts: 0,
    answerAttempts: 0,
    correctAnswers: 0,
    checklistCompleted: false,
    hiddenCompleted: false,
  };
}

function baseAssessmentMetrics() {
  return {
    byAccount: {},
  };
}

function baseAssessmentAccountMetrics() {
  return {
    scenarioId: "",
    assignmentId: "",
    startedAt: null,
    startedByUserAt: null,
    completedAt: null,
    lastActionAt: null,
    timeToFirstActionMs: null,
    actionCount: 0,
    tapCount: 0,
    actionIntervalsMs: [],
    stuckAlerts: [],
    lastStuckAlertAt: null,
    promptHistory: [],
    currentPrompt: null,
    highestPromptLevel: 0,
    promptResponseTimesMs: [],
    answerAttempts: 0,
    correctAnswers: 0,
    completedSteps: [],
  };
}

function mergeAssessmentMetrics(metrics) {
  const base = baseAssessmentMetrics();
  const byAccount = Object.entries(metrics?.byAccount || {}).reduce((acc, [accountId, accountMetrics]) => {
    acc[accountId] = { ...baseAssessmentAccountMetrics(), ...(accountMetrics || {}) };
    return acc;
  }, {});
  return {
    ...base,
    ...(metrics || {}),
    byAccount,
  };
}

function getAssessmentAccountMetrics(state, accountId) {
  return {
    ...baseAssessmentAccountMetrics(),
    ...(state.assessmentMetrics?.byAccount?.[accountId] || {}),
  };
}

function isAssessmentModeForAccount(state, accountId) {
  if (!accountId) return false;
  return (state.session.userModes?.[accountId] || state.session.mode) === "assessment";
}

function updateAssessmentAction(state, actionKind) {
  const accountId = state.session.currentUserId;
  if (!accountId || !isAssessmentModeForAccount(state, accountId)) {
    return state;
  }
  const now = Date.now();
  const assessmentMetrics = mergeAssessmentMetrics(state.assessmentMetrics);
  const current = getAssessmentAccountMetrics(state, accountId);
  const interval = current.lastActionAt ? now - current.lastActionAt : null;
  const pendingPrompt = current.currentPrompt && !current.currentPrompt.respondedAt ? current.currentPrompt : null;
  const nextPromptHistory = pendingPrompt
    ? current.promptHistory.map((prompt) => (
      prompt.id === pendingPrompt.id ? { ...prompt, respondedAt: now, responseMs: now - prompt.at } : prompt
    ))
    : current.promptHistory;
  const nextAccountMetrics = {
    ...current,
    lastActionAt: now,
    timeToFirstActionMs: current.timeToFirstActionMs ?? (current.startedByUserAt || current.startedAt ? now - (current.startedByUserAt || current.startedAt) : null),
    actionCount: current.actionCount + 1,
    tapCount: actionKind === "click" ? current.tapCount + 1 : current.tapCount,
    actionIntervalsMs: interval === null ? current.actionIntervalsMs : [...current.actionIntervalsMs.slice(-49), interval],
    promptHistory: nextPromptHistory,
    currentPrompt: pendingPrompt ? null : current.currentPrompt,
    promptResponseTimesMs: pendingPrompt ? [...current.promptResponseTimesMs.slice(-19), now - pendingPrompt.at] : current.promptResponseTimesMs,
  };
  return {
    ...state,
    assessmentMetrics: {
      ...assessmentMetrics,
      byAccount: {
        ...assessmentMetrics.byAccount,
        [accountId]: nextAccountMetrics,
      },
    },
  };
}

function mergePracticeMetrics(metrics) {
  const base = basePracticeMetrics();
  const byAccount = Object.entries(metrics?.byAccount || {}).reduce((acc, [accountId, accountMetrics]) => {
    acc[accountId] = { ...basePracticeAccountMetrics(), ...(accountMetrics || {}) };
    return acc;
  }, {});
  return {
    ...base,
    ...(metrics || {}),
    byAccount,
  };
}

function getPracticeAccountMetrics(state, accountId) {
  return {
    ...basePracticeAccountMetrics(),
    ...(state.practiceMetrics?.byAccount?.[accountId] || {}),
  };
}

function progressRecordDeps() {
  return {
    rigidAppointments,
    getEventsForAccount,
    capturesAppointment,
    calculateRuleBreaking,
  };
}

function resetEvaluationState(state) {
  return {
    ...state,
    currentApp: "home",
    appHistory: [],
    tabSwitcherOpen: false,
    events: initialEvents,
    scheduledSourceIds: initialEvents.map((event) => event.sourceId).filter(Boolean),
    contextSwitches: 0,
    appMutations: {
      calendar: 0,
      sms: 0,
      whatsapp: 0,
      maps: 0,
      bank: 0,
      settings: 0,
      home: 0,
    },
    lastOpenMutationSnapshot: {
      calendar: 0,
      sms: 0,
      whatsapp: 0,
      maps: 0,
      bank: 0,
      settings: 0,
      home: 0,
    },
    metrics: baseMetrics(),
    interactionMetrics: {
      clicks: 0,
      inputFocuses: 0,
      typingStarts: 0,
      typingLatencyTotalMs: 0,
      typingLatencySamples: 0,
      backPresses: 0,
      homePresses: 0,
      recentPresses: 0,
      cueCount: 0,
      timeToFirstActionMs: null,
    },
      learnMetrics: baseLearnMetrics(),
      practiceMetrics: basePracticeMetrics(),
      assessmentMetrics: baseAssessmentMetrics(),
      checklistScores: createInitialChecklistScores(),
    adminNotes: "",
    cueLog: [],
    hiddenLog: [],
  };
}

function reducer(state, action) {
  switch (action.type) {
    case "HYDRATE_LIVE_STATE":
      {
        const adoptSharedApp = shouldAdoptSharedApp(state, action.snapshot);
        const sharedCurrentApp = action.snapshot.currentApp === "instructions" ? "home" : action.snapshot.currentApp;
        const localParticipant = state.session.currentUserId
          ? action.snapshot.session?.participants?.find((participant) => participant.accountId === state.session.currentUserId)
          : null;
        const nextSession = preserveLocalSessionIdentity(state.session, action.snapshot.session);
        saveLocalDeviceState(nextSession);
        return {
          ...state,
          ...action.snapshot,
          currentApp: adoptSharedApp ? (localParticipant?.currentApp || sharedCurrentApp) : state.currentApp,
          appHistory: adoptSharedApp ? [] : state.appHistory,
          tabSwitcherOpen: adoptSharedApp ? false : state.tabSwitcherOpen,
          session: nextSession,
          learnMetrics: mergeLearnMetrics(action.snapshot.learnMetrics || state.learnMetrics),
          practiceMetrics: mergePracticeMetrics(action.snapshot.practiceMetrics || state.practiceMetrics),
          assessmentMetrics: mergeAssessmentMetrics(action.snapshot.assessmentMetrics || state.assessmentMetrics),
          workspace: state.workspace,
        };
      }
    case "TICK":
      return { ...state, currentMinutes: state.currentMinutes + action.delta };
    case "CREATE_SESSION": {
      const pin = createSessionPin();
      const deviceId = state.session.deviceId || createDeviceId();
      const next = {
        ...state,
        session: resetSessionForNewPin(state.session, {
          pin,
          deviceId,
          startedAt: Date.now(),
        }),
      };
      const resetState = resetEvaluationState(next);
      return persistSessionState({ ...resetState, hiddenLog: appendLog(resetState, { kind: "create_session", pin }) });
    }
    case "JOIN_SESSION": {
      const pin = String(action.pin || "").trim().toUpperCase();
      const participantPin = String(action.participantPin || state.session.pendingUserPin || "").trim();
      const alias = String(action.alias || state.session.pendingAlias || "").trim();
      if (pin !== state.session.pin) {
        return {
          ...state,
          session: {
            ...state.session,
            joinError: "Session PIN not found on this browser prototype.",
          },
        };
      }
      if (!canJoinActiveSession(state.session)) {
        return {
          ...state,
          session: {
            ...state.session,
            joinError: "This session has ended. Please wait for the admin to create a new session.",
          },
        };
      }
      let account = state.session.userAccounts.find((item) => item.pin === participantPin && item.alias.toLowerCase() === alias.toLowerCase());
      const pinTakenByOtherAlias = state.session.userAccounts.some((item) => item.pin === participantPin && item.alias.toLowerCase() !== alias.toLowerCase());
      if (!account && pinTakenByOtherAlias) {
        return {
          ...state,
          session: {
            ...state.session,
            joinError: "This 4-digit user PIN is already assigned to another alias.",
          },
        };
      }
      if (!account) {
        account = {
          id: `user-${Date.now()}`,
          alias: alias || `User ${state.session.userAccounts.length + 1}`,
          pin: participantPin,
        };
      }
      const userAccounts = state.session.userAccounts.some((item) => item.id === account.id)
        ? state.session.userAccounts
        : [...state.session.userAccounts, account];
      const deviceId = state.session.deviceId || createDeviceId();
      const existing = state.session.participants.some((participant) => participant.accountId === account.id);
      const joinedUserCount = state.session.participants.filter((participant) => participant.role === "patient").length;
      if (!existing && joinedUserCount >= state.session.participantLimit) {
        return {
          ...state,
          session: {
            ...state.session,
            joinError: "This session already has 6 devices.",
          },
        };
      }
      const participants = existing
        ? state.session.participants
        : [
            ...state.session.participants,
            {
              id: deviceId,
              accountId: account.id,
              label: account.alias,
              joinedAt: Date.now(),
              lastSeenAt: Date.now(),
              role: "patient",
              currentApp: state.currentApp,
              mode: state.session.userModes[account.id] || state.session.mode,
              activeScenarioId: getCurrentAssignment(state.session, account.id, state.session.userModes[account.id] || state.session.mode)?.scenarioId
                || getCurrentAssignment(state.session, account.id)?.scenarioId
                || "",
            },
          ];
      const next = {
        ...state,
        session: {
          ...state.session,
          joined: true,
          joinError: "",
          deviceId,
          currentUserId: account.id,
          userAccounts,
          participants,
          completedAt: null,
          endingStartedAt: null,
          endedAt: null,
        },
      };
      return persistSessionState({ ...next, hiddenLog: appendLog(next, { kind: "join_session", pin, user: account.alias }) });
    }
    case "SET_PENDING_USER_IDENTITY": {
      const next = {
        ...state,
        session: {
          ...state.session,
          pendingAlias: action.alias,
          pendingUserPin: action.participantPin,
          joinError: "",
        },
      };
      return persistSessionState(next);
    }
    case "MARK_STIMULUS_READ": {
      if (!action.stimulusId || state.session.readStimuli.includes(action.stimulusId)) {
        return state;
      }
      const next = {
        ...state,
        session: {
          ...state.session,
          readStimuli: [...state.session.readStimuli, action.stimulusId],
        },
      };
      return persistSessionState({ ...next, hiddenLog: appendLog(next, { kind: "stimulus_read", stimulusId: action.stimulusId }) });
    }
    case "DISMISS_STIMULUS": {
      if (!action.stimulusId || state.session.dismissedStimuli.includes(action.stimulusId)) {
        return state;
      }
      const next = {
        ...state,
        session: {
          ...state.session,
          dismissedStimuli: [...state.session.dismissedStimuli, action.stimulusId],
        },
      };
      return persistSessionState({ ...next, hiddenLog: appendLog(next, { kind: "stimulus_dismissed", stimulusId: action.stimulusId }) });
    }
    case "OPEN_APP": {
      const app = action.app;
      if (state.currentApp === app) {
        return state;
      }
      const learnApp = getCurrentLearnApp(state);
      if (learnApp && app !== learnApp) {
        return persistSessionState({ ...state, hiddenLog: appendLog(state, { kind: "learn_app_blocked", attemptedApp: app, assignedApp: learnApp }) });
      }
      const baseInteractionMetrics = markFirstAction(state);
      const prevSnapshot = state.lastOpenMutationSnapshot[app] ?? 0;
      const currMut = state.appMutations[app] ?? 0;
      const wasPerseverating = currMut === prevSnapshot;
      const next = {
        ...state,
        currentApp: app,
        session: {
          ...state.session,
          participants: updateCurrentParticipant(state, { currentApp: app }),
        },
        tabSwitcherOpen: false,
        appHistory: [...state.appHistory, state.currentApp].slice(-20),
        contextSwitches: state.contextSwitches + 1,
        metrics: {
          ...state.metrics,
          perseveration: wasPerseverating ? state.metrics.perseveration + 1 : state.metrics.perseveration,
        },
        interactionMetrics: baseInteractionMetrics,
      };
      const withAssessment = updateAssessmentAction(next, "open_app");
      const withMetrics = { ...withAssessment, metrics: recalcMetrics(withAssessment) };
      return persistSessionState({ ...withMetrics, hiddenLog: appendLog(withMetrics, { kind: "open_app", app }) });
    }
    case "GO_HOME": {
      if (state.currentApp === "home") {
        return { ...state, tabSwitcherOpen: false };
      }
      const learnApp = getCurrentLearnApp(state);
      if (learnApp && state.currentApp !== "home") {
        return persistSessionState({ ...state, tabSwitcherOpen: false, hiddenLog: appendLog(state, { kind: "learn_home_blocked", assignedApp: learnApp }) });
      }
      const next = {
        ...state,
        currentApp: "home",
        session: {
          ...state.session,
          participants: updateCurrentParticipant(state, { currentApp: "home" }),
        },
        tabSwitcherOpen: false,
        appHistory: [...state.appHistory, state.currentApp].slice(-20),
        contextSwitches: state.contextSwitches + 1,
        interactionMetrics: {
          ...markFirstAction(state),
          homePresses: state.interactionMetrics.homePresses + 1,
        },
        lastOpenMutationSnapshot: {
          ...state.lastOpenMutationSnapshot,
          [state.currentApp]: state.appMutations[state.currentApp] ?? 0,
        },
      };
      const withAssessment = updateAssessmentAction(next, "click");
      const withMetrics = { ...withAssessment, metrics: recalcMetrics(withAssessment) };
      return persistSessionState({ ...withMetrics, hiddenLog: appendLog(withMetrics, { kind: "go_home" }) });
    }
    case "GO_BACK": {
      const prev = state.appHistory[state.appHistory.length - 1] || "home";
      const learnApp = getCurrentLearnApp(state);
      if (learnApp && prev !== learnApp) {
        return persistSessionState({ ...state, hiddenLog: appendLog(state, { kind: "learn_back_blocked", assignedApp: learnApp }) });
      }
      if (prev === state.currentApp) {
        return state;
      }
      const next = {
        ...state,
        currentApp: prev,
        session: {
          ...state.session,
          participants: updateCurrentParticipant(state, { currentApp: prev }),
        },
        tabSwitcherOpen: false,
        appHistory: state.appHistory.slice(0, -1),
        contextSwitches: state.contextSwitches + 1,
        interactionMetrics: {
          ...markFirstAction(state),
          backPresses: state.interactionMetrics.backPresses + 1,
        },
      };
      const withAssessment = updateAssessmentAction(next, "click");
      const withMetrics = { ...withAssessment, metrics: recalcMetrics(withAssessment) };
      return persistSessionState({ ...withMetrics, hiddenLog: appendLog(withMetrics, { kind: "go_back", to: prev }) });
    }
    case "TOGGLE_TABS":
      if (getCurrentLearnApp(state)) {
        return persistSessionState({ ...state, tabSwitcherOpen: false, hiddenLog: appendLog(state, { kind: "learn_tabs_blocked", assignedApp: getCurrentLearnApp(state) }) });
      }
      {
        const next = {
        ...state,
        tabSwitcherOpen: !state.tabSwitcherOpen,
        interactionMetrics: {
          ...markFirstAction(state),
          recentPresses: state.interactionMetrics.recentPresses + 1,
        },
        };
        const withAssessment = updateAssessmentAction(next, "click");
        return persistSessionState({ ...withAssessment, hiddenLog: appendLog(withAssessment, { kind: "toggle_tabs" }) });
      }
    case "SET_TABS":
      if (action.open && getCurrentLearnApp(state)) {
        return persistSessionState({ ...state, tabSwitcherOpen: false, hiddenLog: appendLog(state, { kind: "learn_tabs_blocked", assignedApp: getCurrentLearnApp(state) }) });
      }
      return persistSessionState({ ...state, tabSwitcherOpen: action.open });
    case "ADD_EVENT": {
      const event = {
        ...action.event,
        createdAt: action.event.createdAt || Date.now(),
        accountId: action.event.accountId || state.session.currentUserId || null,
      };
      const nextIds = event.sourceId && !state.scheduledSourceIds.includes(event.sourceId)
        ? [...state.scheduledSourceIds, event.sourceId]
        : state.scheduledSourceIds;
      const next = {
        ...state,
        session: {
          ...state.session,
          firstEntryAt: state.session.firstEntryAt ?? Date.now(),
        },
        events: [...state.events, event],
        scheduledSourceIds: nextIds,
        appMutations: {
          ...state.appMutations,
          calendar: state.appMutations.calendar + 1,
        },
      };
      const withMetrics = { ...next, metrics: recalcMetrics(next) };
      return persistSessionState({ ...withMetrics, hiddenLog: appendLog(withMetrics, { kind: "add_event", eventId: event.id }) });
    }
    case "UPDATE_EVENT": {
      const beforeErrors = countCalendarErrors(state);
      const nextEvents = state.events.map((event) => (event.id === action.id ? { ...event, ...action.patch, updatedAt: Date.now() } : event));
      const next = {
        ...state,
        events: nextEvents,
        appMutations: {
          ...state.appMutations,
          calendar: state.appMutations.calendar + 1,
        },
      };
      const afterErrors = countCalendarErrors(next);
      const withMetrics = {
        ...next,
        metrics: {
          ...recalcMetrics(next),
          correctedErrors: afterErrors < beforeErrors ? (state.metrics.correctedErrors || 0) + 1 : (state.metrics.correctedErrors || 0),
        },
      };
      return persistSessionState({ ...withMetrics, hiddenLog: appendLog(withMetrics, { kind: "update_event", eventId: action.id }) });
    }
    case "DELETE_EVENT": {
      const beforeErrors = countCalendarErrors(state);
      const next = {
        ...state,
        events: state.events.filter((event) => event.id !== action.id),
        appMutations: {
          ...state.appMutations,
          calendar: state.appMutations.calendar + 1,
        },
      };
      const afterErrors = countCalendarErrors(next);
      const withMetrics = {
        ...next,
        metrics: {
          ...recalcMetrics(next),
          correctedErrors: afterErrors < beforeErrors ? (state.metrics.correctedErrors || 0) + 1 : (state.metrics.correctedErrors || 0),
        },
      };
      return persistSessionState({ ...withMetrics, hiddenLog: appendLog(withMetrics, { kind: "delete_event", eventId: action.id }) });
    }
    case "TRACK_WA_REPLY": {
      const next = {
        ...state,
        metrics: {
          ...state.metrics,
          whatsappReplies: {
            ...state.metrics.whatsappReplies,
            [action.threadId]: (state.metrics.whatsappReplies[action.threadId] ?? 0) + 1,
          },
        },
      };
      return persistSessionState({ ...next, hiddenLog: appendLog(next, { kind: "wa_reply", threadId: action.threadId }) });
    }
    case "TRACK_WA_CONFIRM": {
      const next = {
        ...state,
        metrics: {
          ...state.metrics,
          whatsappConfirmed: {
            ...state.metrics.whatsappConfirmed,
            [action.threadId]: true,
          },
        },
      };
      return persistSessionState({ ...next, hiddenLog: appendLog(next, { kind: "wa_confirm", threadId: action.threadId }) });
    }
    case "TRACK_WA_FRIEND_CONFIRM": {
      const next = {
        ...state,
        metrics: {
          ...state.metrics,
          whatsappFriendConfirmed: {
            ...state.metrics.whatsappFriendConfirmed,
            [action.threadId]: true,
          },
        },
      };
      return persistSessionState({ ...next, hiddenLog: appendLog(next, { kind: "wa_friend_confirm", threadId: action.threadId }) });
    }
    case "RESET_EVALUATION": {
      return persistSessionState({
        ...state,
        session: {
          ...state.session,
          joined: true,
          startedAt: Date.now(),
          firstEntryAt: null,
          completedAt: null,
          endingStartedAt: null,
          endedAt: null,
          readStimuli: [],
          dismissedStimuli: [],
          learnModules: {},
        },
        events: initialEvents,
        scheduledSourceIds: initialEvents.map((event) => event.sourceId).filter(Boolean),
        contextSwitches: 0,
        appMutations: {
          calendar: 0,
          sms: 0,
          whatsapp: 0,
          maps: 0,
          bank: 0,
          settings: 0,
          home: 0,
        },
        lastOpenMutationSnapshot: {
          calendar: 0,
          sms: 0,
          whatsapp: 0,
          maps: 0,
          bank: 0,
          settings: 0,
          home: 0,
        },
        metrics: baseMetrics(),
        interactionMetrics: {
          clicks: 0,
          inputFocuses: 0,
          typingStarts: 0,
          typingLatencyTotalMs: 0,
          typingLatencySamples: 0,
          backPresses: 0,
          homePresses: 0,
          recentPresses: 0,
          cueCount: 0,
          timeToFirstActionMs: null,
        },
        learnMetrics: baseLearnMetrics(),
        practiceMetrics: basePracticeMetrics(),
        assessmentMetrics: baseAssessmentMetrics(),
        checklistScores: createInitialChecklistScores(),
        adminNotes: "",
        cueLog: [],
        hiddenLog: [],
      });
    }
    case "MARK_COMPLETED": {
      const completedAt = Date.now();
      const completedPin = state.session.pin;
      const nextPin = createSessionPin();
      const participantRecords = state.session.participants
        .filter((participant) => participant.role === "patient")
        .map((participant) => getParticipantScenarioRecord(state, participant.accountId, completedAt, progressRecordDeps()))
        .filter(Boolean)
        .filter((record) => !state.session.records.some((saved) => (
          saved.kind === "progress"
          && saved.assignmentId === (record.assignmentId || record.id)
          && saved.participants?.some((savedParticipant) => (
            savedParticipant.accountId === record.accountId
            && (record.mode !== "practice" || (savedParticipant.attempt || 1) === (record.attempt || 1))
          ))
        )))
        .map((record) => ({ ...record, sessionPin: completedPin }));
      const next = {
        ...state,
        session: {
          ...invalidateCompletedSessionPin(state.session, nextPin, completedAt),
          records: [
            {
              id: `record-${completedAt}`,
              pin: completedPin,
              completedAt,
              participantCount: state.session.participants.filter((p) => p.role === "patient").length,
              mode: state.session.mode,
              participants: participantRecords,
              metrics: summarizeInteractions(state.hiddenLog, null, state.session.startedAt),
              learnMetrics: state.learnMetrics,
              practiceMetrics: state.practiceMetrics,
              assessmentMetrics: state.assessmentMetrics,
              taskEvidence: createTaskEvidenceSnapshot(state, null, state.session.startedAt, progressRecordDeps()),
              checklistScores: state.checklistScores,
              notes: state.adminNotes,
            },
            ...state.session.records,
          ],
        },
      };
      return persistSessionState({ ...next, hiddenLog: appendLog(next, { kind: "mark_completed", pin: completedPin, nextPin }) });
    }
    case "SAVE_EXPERIENCE_RATING": {
      const accountId = state.session.currentUserId || action.accountId || "unknown";
      const ratedAt = Date.now();
      const next = {
        ...state,
        session: {
          ...state.session,
          records: attachExperienceRatingToRecords(state.session.records, accountId, action.rating, ratedAt),
          experienceRatings: {
            ...state.session.experienceRatings,
            [accountId]: action.rating,
          },
        },
      };
      return persistSessionState({ ...next, hiddenLog: appendLog(next, { kind: "experience_rating", accountId, rating: action.rating }) });
    }
    case "SUBMIT_EXPERIENCE_RATING": {
      const currentAccount = state.session.userAccounts.find((account) => account.id === state.session.currentUserId);
      const accountId = currentAccount?.id || state.session.currentUserId || action.accountId || "unknown";
      const ratedAt = Date.now();
      const next = {
        ...state,
        session: {
          ...state.session,
          joined: false,
          joinError: "",
          currentUserId: null,
          pendingAlias: currentAccount?.alias || state.session.pendingAlias,
          pendingUserPin: currentAccount?.pin || state.session.pendingUserPin,
          participants: state.session.participants.filter((participant) => participant.accountId !== accountId),
          records: attachExperienceRatingToRecords(state.session.records, accountId, action.rating, ratedAt),
          experienceRatings: {
            ...state.session.experienceRatings,
            [accountId]: action.rating,
          },
        },
      };
      return persistSessionState({ ...next, hiddenLog: appendLog(next, { kind: "experience_rating_submit", accountId, rating: action.rating }) });
    }
    case "START_ASSESSMENT": {
      const next = {
        ...state,
        session: {
          ...state.session,
          mode: "assessment",
          joined: true,
        },
        currentApp: "home",
        tabSwitcherOpen: false,
      };
      return persistSessionState({ ...next, hiddenLog: appendLog(next, { kind: "start_assessment" }) });
    }
    case "PUSH_ASSESSMENT": {
      const scenarioId = action.scenarioId;
      const scenario = [...SCENARIO_LIBRARY, ...state.session.customScenarios].find((item) => item.id === scenarioId);
      const firstCurrentApp = "home";
      const targets = resolvePushTargets(state.session, action.targetId);
      if (!scenario || targets.length === 0) {
        return state;
      }
      const now = Date.now();
      const assignmentResult = applyScenarioAssignment(state.session, {
        mode: "assessment",
        scenarioId,
        targets,
        assignmentId: `assess-${now}`,
        now,
        firstCurrentApp,
      });
      const assessmentMetrics = mergeAssessmentMetrics(state.assessmentMetrics);
      const practiceMetrics = mergePracticeMetrics(state.practiceMetrics);
      const nextAssessmentByAccount = { ...assessmentMetrics.byAccount };
      targets.forEach((targetId) => {
        nextAssessmentByAccount[targetId] = {
          ...baseAssessmentAccountMetrics(),
          scenarioId,
          assignmentId: assignmentResult.assignment.id,
          startedAt: now,
          lastActionAt: now,
        };
      });
      const next = {
        ...state,
        currentApp: assignmentResult.localTargeted ? firstCurrentApp : state.currentApp,
        tabSwitcherOpen: assignmentResult.localTargeted ? false : state.tabSwitcherOpen,
        appHistory: assignmentResult.localTargeted ? ["home"] : state.appHistory,
        practiceMetrics: removeAccountsFromByAccount(practiceMetrics, targets),
        assessmentMetrics: {
          ...assessmentMetrics,
          byAccount: nextAssessmentByAccount,
        },
        session: assignmentResult.session,
      };
      return persistSessionState({ ...next, hiddenLog: appendLog(next, { kind: "push_assessment", scenarioId, targetId: action.targetId }) });
    }
    case "START_ASSESSMENT_ASSIGNMENT": {
      const accountId = action.accountId || state.session.currentUserId;
      if (!accountId) return state;
      const now = Date.now();
      const assessmentMetrics = mergeAssessmentMetrics(state.assessmentMetrics);
      const current = getAssessmentAccountMetrics(state, accountId);
      const next = {
        ...state,
        assessmentMetrics: {
          ...assessmentMetrics,
          byAccount: {
            ...assessmentMetrics.byAccount,
            [accountId]: {
              ...startAssessmentTiming(current, now),
            },
          },
        },
      };
      return persistSessionState({ ...next, hiddenLog: appendLog(next, { kind: "assessment_started_by_user", accountId, assignmentId: current.assignmentId }) });
    }
    case "COMPLETE_ASSESSMENT": {
      const accountId = action.accountId || state.session.currentUserId;
      if (!accountId) return state;
      const now = action.completedAt || Date.now();
      const assessmentMetrics = mergeAssessmentMetrics(state.assessmentMetrics);
      const current = getAssessmentAccountMetrics(state, accountId);
      const next = {
        ...state,
        assessmentMetrics: {
          ...assessmentMetrics,
          byAccount: {
            ...assessmentMetrics.byAccount,
            [accountId]: {
              ...current,
              completedAt: now,
              currentPrompt: null,
            },
          },
        },
      };
      const loggedNext = { ...next, hiddenLog: appendLog(next, { kind: "assessment_complete", accountId }) };
      const withProgress = appendParticipantProgressRecord(loggedNext, accountId, now, progressRecordDeps());
      return persistSessionState(withProgress);
    }
    case "TRACK_ASSESSMENT_STUCK": {
      const accountId = action.accountId || state.session.currentUserId;
      if (!accountId) return state;
      const now = Date.now();
      const assessmentMetrics = mergeAssessmentMetrics(state.assessmentMetrics);
      const current = getAssessmentAccountMetrics(state, accountId);
      if (current.lastStuckAlertAt && now - current.lastStuckAlertAt < 30000) {
        return state;
      }
      const alert = {
        id: `stuck-${now}`,
        at: now,
        app: action.app || state.currentApp,
        idleMs: action.idleMs || 0,
        lastActionAt: current.lastActionAt,
      };
      const next = {
        ...state,
        assessmentMetrics: {
          ...assessmentMetrics,
          byAccount: {
            ...assessmentMetrics.byAccount,
            [accountId]: {
              ...current,
              stuckAlerts: [alert, ...current.stuckAlerts].slice(0, 20),
              lastStuckAlertAt: now,
            },
          },
        },
      };
      return persistSessionState({ ...next, hiddenLog: appendLog(next, { kind: "assessment_stuck", accountId, idleMs: alert.idleMs, app: alert.app }) });
    }
    case "PUSH_ASSESSMENT_PROMPT": {
      const accountId = action.accountId || state.session.currentUserId;
      if (!accountId) return state;
      const now = Date.now();
      const assessmentMetrics = mergeAssessmentMetrics(state.assessmentMetrics);
      const current = getAssessmentAccountMetrics(state, accountId);
      const prompt = {
        id: `prompt-${now}`,
        at: now,
        level: action.level || 1,
        label: action.label || "Prompt",
        text: action.text || "",
        app: state.currentApp,
        respondedAt: null,
        responseMs: null,
      };
      const next = {
        ...state,
        assessmentMetrics: {
          ...assessmentMetrics,
          byAccount: {
            ...assessmentMetrics.byAccount,
            [accountId]: {
              ...current,
              currentPrompt: prompt,
              promptHistory: [prompt, ...current.promptHistory].slice(0, 20),
              highestPromptLevel: Math.max(current.highestPromptLevel, prompt.level),
            },
          },
        },
      };
      return persistSessionState({ ...next, hiddenLog: appendLog(next, { kind: "assessment_prompt", accountId, level: prompt.level, text: prompt.text }) });
    }
    case "TRACK_ASSESSMENT_ANSWER": {
      const accountId = action.accountId || state.session.currentUserId;
      if (!accountId) return state;
      const assessmentMetrics = mergeAssessmentMetrics(state.assessmentMetrics);
      const current = getAssessmentAccountMetrics(state, accountId);
      const next = {
        ...state,
        assessmentMetrics: {
          ...assessmentMetrics,
          byAccount: {
            ...assessmentMetrics.byAccount,
            [accountId]: {
              ...current,
              answerAttempts: (current.answerAttempts || 0) + 1,
              correctAnswers: (current.correctAnswers || 0) + (action.correct ? 1 : 0),
            },
          },
        },
      };
      return persistSessionState({ ...next, hiddenLog: appendLog(next, { kind: "assessment_answer", accountId, checkId: action.checkId, correct: Boolean(action.correct) }) });
    }
    case "TRACK_ASSESSMENT_STEP": {
      const accountId = action.accountId || state.session.currentUserId;
      if (!accountId || !action.stepId) return state;
      const assessmentMetrics = mergeAssessmentMetrics(state.assessmentMetrics);
      const current = getAssessmentAccountMetrics(state, accountId);
      const completedSteps = current.completedSteps.includes(action.stepId)
        ? current.completedSteps
        : [...current.completedSteps, action.stepId];
      if (completedSteps === current.completedSteps) {
        return state;
      }
      const next = {
        ...state,
        assessmentMetrics: {
          ...assessmentMetrics,
          byAccount: {
            ...assessmentMetrics.byAccount,
            [accountId]: {
              ...current,
              completedSteps,
            },
          },
        },
      };
      return persistSessionState({ ...next, hiddenLog: appendLog(next, { kind: "assessment_step", accountId, stepId: action.stepId }) });
    }
    case "SET_SESSION_MODE": {
      const next = {
        ...state,
        session: {
          ...state.session,
          mode: action.mode,
        },
      };
      return persistSessionState({ ...next, hiddenLog: appendLog(next, { kind: "set_session_mode", mode: action.mode }) });
    }
    case "ADD_USER_ACCOUNT": {
      const nextIndex = state.session.userAccounts.length + 1;
      const account = {
        id: `user-${Date.now()}`,
        alias: action.alias?.trim() || `User ${nextIndex}`,
        pin: action.pin?.trim() || createParticipantPin(),
      };
      const duplicate = state.session.userAccounts.some((item) => (
        item.alias.toLowerCase() === account.alias.toLowerCase() || item.pin === account.pin
      ));
      if (duplicate) {
        return {
          ...state,
          session: {
            ...state.session,
            joinError: "Alias or 4-digit PIN already exists.",
          },
        };
      }
      const next = {
        ...state,
        session: {
          ...state.session,
          userAccounts: [...state.session.userAccounts, account],
          joinError: "",
        },
      };
      return persistSessionState({ ...next, hiddenLog: appendLog(next, { kind: "add_user_account", alias: account.alias }) });
    }
    case "REMOVE_USER_ACCOUNT": {
      const assignments = { ...state.session.assignments };
      const learnModules = { ...state.session.learnModules };
      delete assignments[action.accountId];
      delete learnModules[action.accountId];
      const learnMetrics = mergeLearnMetrics(state.learnMetrics);
      const practiceMetrics = mergePracticeMetrics(state.practiceMetrics);
      const assessmentMetrics = mergeAssessmentMetrics(state.assessmentMetrics);
      const nextLearnByAccount = { ...learnMetrics.byAccount };
      const nextPracticeByAccount = { ...practiceMetrics.byAccount };
      const nextAssessmentByAccount = { ...assessmentMetrics.byAccount };
      delete nextLearnByAccount[action.accountId];
      delete nextPracticeByAccount[action.accountId];
      delete nextAssessmentByAccount[action.accountId];
      const next = {
        ...state,
        events: state.events.filter((event) => event.accountId !== action.accountId),
        learnMetrics: {
          ...learnMetrics,
          byAccount: nextLearnByAccount,
        },
        practiceMetrics: {
          ...practiceMetrics,
          byAccount: nextPracticeByAccount,
        },
        assessmentMetrics: {
          ...assessmentMetrics,
          byAccount: nextAssessmentByAccount,
        },
        cueLog: state.cueLog.filter((entry) => entry.accountId !== action.accountId),
        hiddenLog: state.hiddenLog.filter((entry) => entry.accountId !== action.accountId),
        session: {
          ...state.session,
          userAccounts: state.session.userAccounts.filter((account) => account.id !== action.accountId),
          removedAccountIds: [...new Set([...(state.session.removedAccountIds || []), action.accountId])],
          participants: state.session.participants.filter((participant) => participant.accountId !== action.accountId),
          assignments,
          learnModules,
          currentUserId: state.session.currentUserId === action.accountId ? null : state.session.currentUserId,
          userModes: Object.fromEntries(Object.entries(state.session.userModes).filter(([id]) => id !== action.accountId)),
        },
      };
      return persistSessionState({ ...next, hiddenLog: appendLog(next, { kind: "remove_user_account", accountId: action.accountId }) });
    }
    case "SET_USER_MODE": {
      const now = Date.now();
      const modeResult = applyModeSelection(state.session, {
        accountId: action.accountId,
        mode: action.mode,
        now,
      });
      if (!modeResult) {
        return state;
      }
      const practiceMetrics = mergePracticeMetrics(state.practiceMetrics);
      const assessmentMetrics = mergeAssessmentMetrics(state.assessmentMetrics);
      const nextPracticeByAccount = { ...practiceMetrics.byAccount };
      const nextAssessmentByAccount = { ...assessmentMetrics.byAccount };
      if (action.mode === "practice") {
        nextPracticeByAccount[action.accountId] = basePracticeAccountMetrics();
      } else {
        delete nextPracticeByAccount[action.accountId];
      }
      if (action.mode === "assessment") {
        nextAssessmentByAccount[action.accountId] = baseAssessmentAccountMetrics();
      } else {
        delete nextAssessmentByAccount[action.accountId];
      }
      const next = {
        ...state,
        currentApp: modeResult.localTargeted ? "home" : state.currentApp,
        tabSwitcherOpen: modeResult.localTargeted ? false : state.tabSwitcherOpen,
        appHistory: modeResult.localTargeted ? ["home"] : state.appHistory,
        practiceMetrics: {
          ...practiceMetrics,
          byAccount: nextPracticeByAccount,
        },
        assessmentMetrics: {
          ...assessmentMetrics,
          byAccount: nextAssessmentByAccount,
        },
        session: modeResult.session,
      };
      return persistSessionState({ ...next, hiddenLog: appendLog(next, { kind: "set_user_mode", accountId: action.accountId, mode: action.mode }) });
    }
    case "SET_LEARN_MODULE": {
      const now = Date.now();
      const learnMetrics = mergeLearnMetrics(state.learnMetrics);
      const accountMetrics = mergeLearnAccountMetrics(learnMetrics.byAccount?.[action.accountId]);
      const assignmentResult = applyLearnModuleAssignment(state.session, {
        accountId: action.accountId,
        app: action.app,
        assignmentId: `learn-${now}`,
        now,
      });
      if (!assignmentResult) {
        return state;
      }
      const next = {
        ...state,
        currentApp: assignmentResult.localTargeted || !state.session.currentUserId ? action.app : state.currentApp,
        tabSwitcherOpen: assignmentResult.localTargeted ? false : state.tabSwitcherOpen,
        appHistory: assignmentResult.localTargeted ? [action.app] : state.appHistory,
        practiceMetrics: removeAccountsFromByAccount(mergePracticeMetrics(state.practiceMetrics), [action.accountId]),
        assessmentMetrics: removeAccountsFromByAccount(mergeAssessmentMetrics(state.assessmentMetrics), [action.accountId]),
        learnMetrics: {
          ...learnMetrics,
          moduleStarts: {
            ...learnMetrics.moduleStarts,
            [action.app]: now,
          },
          byAccount: {
            ...learnMetrics.byAccount,
            [action.accountId]: {
              ...accountMetrics,
              moduleStarts: {
                ...accountMetrics.moduleStarts,
                [action.app]: now,
              },
            },
          },
        },
        session: assignmentResult.session,
      };
      return persistSessionState({ ...next, hiddenLog: appendLog(next, { kind: "set_learn_module", accountId: action.accountId, app: action.app }) });
    }
    case "TRACK_LEARN_ATTEMPT": {
      const app = action.app || state.currentApp || "unknown";
      const accountId = action.accountId || state.session.currentUserId;
      const next = {
        ...state,
        learnMetrics: updateLearnAccuracy(state.learnMetrics, app, Boolean(action.correct), accountId),
      };
      return persistSessionState({ ...next, hiddenLog: appendLog(next, { kind: "learn_attempt", accountId, app, correct: Boolean(action.correct), attemptType: action.attemptType }) });
    }
    case "COMPLETE_LEARN_MODULE": {
      const app = action.app || state.currentApp || "unknown";
      const accountId = action.accountId || state.session.currentUserId;
      const now = Date.now();
      const learnMetrics = mergeLearnMetrics(state.learnMetrics);
      const startedAt = learnMetrics.moduleStarts?.[app] || now;
      const previousTime = learnMetrics.timeByAppMs?.[app] || 0;
      const accountMetrics = mergeLearnAccountMetrics(accountId ? learnMetrics.byAccount?.[accountId] : null);
      const accountStartedAt = accountMetrics.moduleStarts?.[app] || now;
      const accountPreviousTime = accountMetrics.timeByAppMs?.[app] || 0;
      const next = {
        ...state,
        learnMetrics: {
          ...learnMetrics,
          modulesCompleted: (learnMetrics.modulesCompleted || 0) + 1,
          completedByApp: {
            ...learnMetrics.completedByApp,
            [app]: (learnMetrics.completedByApp?.[app] || 0) + 1,
          },
          timeByAppMs: {
            ...learnMetrics.timeByAppMs,
            [app]: previousTime + Math.max(0, now - startedAt),
          },
          moduleStarts: {
            ...learnMetrics.moduleStarts,
            [app]: now,
          },
          byAccount: accountId ? {
            ...learnMetrics.byAccount,
            [accountId]: {
              ...accountMetrics,
              modulesCompleted: (accountMetrics.modulesCompleted || 0) + 1,
              completedByApp: {
                ...accountMetrics.completedByApp,
                [app]: (accountMetrics.completedByApp?.[app] || 0) + 1,
              },
              timeByAppMs: {
                ...accountMetrics.timeByAppMs,
                [app]: accountPreviousTime + Math.max(0, now - accountStartedAt),
              },
              moduleStarts: {
                ...accountMetrics.moduleStarts,
                [app]: now,
              },
            },
          } : learnMetrics.byAccount,
        },
      };
      return persistSessionState({ ...next, hiddenLog: appendLog(next, { kind: "learn_module_complete", accountId, app }) });
    }
    case "SET_PRACTICE_SUPPORT": {
      const accountId = action.accountId || state.session.currentUserId;
      if (!accountId) return state;
      const current = getPracticeAccountMetrics(state, accountId);
      const nextAccountMetrics = {
        ...current,
        supportMode: action.supportMode || current.supportMode,
        attempt: action.newAttempt ? current.attempt + 1 : current.attempt,
        completedSteps: action.resetSteps ? [] : current.completedSteps,
        completedAt: action.resetSteps ? null : current.completedAt,
      };
      const next = {
        ...state,
        practiceMetrics: {
          ...mergePracticeMetrics(state.practiceMetrics),
          byAccount: {
            ...mergePracticeMetrics(state.practiceMetrics).byAccount,
            [accountId]: nextAccountMetrics,
          },
        },
      };
      return persistSessionState({ ...next, hiddenLog: appendLog(next, { kind: "practice_support", accountId, supportMode: nextAccountMetrics.supportMode }) });
    }
    case "TRACK_PRACTICE_STEP": {
      const accountId = action.accountId || state.session.currentUserId;
      if (!accountId || !action.stepId) return state;
      const current = getPracticeAccountMetrics(state, accountId);
      const completedSteps = current.completedSteps.includes(action.stepId)
        ? current.completedSteps
        : [...current.completedSteps, action.stepId];
      const nextAccountMetrics = {
        ...current,
        completedSteps,
        completedAt: action.isComplete ? Date.now() : current.completedAt,
        checklistCompleted: action.isComplete && current.supportMode === "checklist" ? true : current.checklistCompleted,
        hiddenCompleted: action.isComplete && current.supportMode !== "checklist" ? true : current.hiddenCompleted,
      };
      const practiceMetrics = mergePracticeMetrics(state.practiceMetrics);
      const next = {
        ...state,
        practiceMetrics: {
          ...practiceMetrics,
          byAccount: {
            ...practiceMetrics.byAccount,
            [accountId]: nextAccountMetrics,
          },
        },
      };
      const loggedNext = { ...next, hiddenLog: appendLog(next, { kind: "practice_step", accountId, stepId: action.stepId }) };
      const withProgress = action.isComplete ? appendParticipantProgressRecord(loggedNext, accountId, nextAccountMetrics.completedAt, progressRecordDeps()) : loggedNext;
      return persistSessionState(withProgress);
    }
    case "TRACK_PRACTICE_PROMPT": {
      const accountId = action.accountId || state.session.currentUserId;
      if (!accountId) return state;
      const current = getPracticeAccountMetrics(state, accountId);
      const level = action.level || 1;
      const practiceMetrics = mergePracticeMetrics(state.practiceMetrics);
      const next = {
        ...state,
        practiceMetrics: {
          ...practiceMetrics,
          byAccount: {
            ...practiceMetrics.byAccount,
            [accountId]: {
              ...current,
              supportMode: "prompt",
              promptCount: current.promptCount + 1,
              highestPromptLevel: Math.max(current.highestPromptLevel, level),
            },
          },
        },
      };
      return persistSessionState({ ...next, hiddenLog: appendLog(next, { kind: "practice_prompt", accountId, level }) });
    }
    case "TRACK_PRACTICE_WRONG_STEP": {
      const accountId = action.accountId || state.session.currentUserId;
      if (!accountId) return state;
      const current = getPracticeAccountMetrics(state, accountId);
      const practiceMetrics = mergePracticeMetrics(state.practiceMetrics);
      const next = {
        ...state,
        practiceMetrics: {
          ...practiceMetrics,
          byAccount: {
            ...practiceMetrics.byAccount,
            [accountId]: {
              ...current,
              wrongStepAttempts: current.wrongStepAttempts + 1,
            },
          },
        },
      };
      return persistSessionState({ ...next, hiddenLog: appendLog(next, { kind: "practice_wrong_step", accountId }) });
    }
    case "TRACK_PRACTICE_ANSWER": {
      const accountId = action.accountId || state.session.currentUserId;
      if (!accountId) return state;
      const current = getPracticeAccountMetrics(state, accountId);
      const practiceMetrics = mergePracticeMetrics(state.practiceMetrics);
      const nextAccountMetrics = {
        ...current,
        answerAttempts: (current.answerAttempts || 0) + 1,
        correctAnswers: (current.correctAnswers || 0) + (action.correct ? 1 : 0),
      };
      const next = {
        ...state,
        practiceMetrics: {
          ...practiceMetrics,
          byAccount: {
            ...practiceMetrics.byAccount,
            [accountId]: nextAccountMetrics,
          },
        },
      };
      return persistSessionState({ ...next, hiddenLog: appendLog(next, { kind: "practice_answer", accountId, stepId: action.stepId, correct: Boolean(action.correct) }) });
    }
    case "ADD_CUSTOM_SCENARIO": {
      const scenario = {
        id: `custom-${Date.now()}`,
        title: action.scenario.title || "Custom Scenario",
        complexity: action.scenario.complexity || "Custom",
        apps: action.scenario.apps?.length ? action.scenario.apps : ["messages"],
        mode: action.scenario.mode || state.session.mode,
        description: action.scenario.description || "Custom practice scenario.",
        successCriteria: action.scenario.successCriteria?.length ? action.scenario.successCriteria : ["Complete the assigned task safely."],
      };
      const next = {
        ...state,
        session: {
          ...state.session,
          customScenarios: [scenario, ...state.session.customScenarios],
        },
      };
      return persistSessionState({ ...next, hiddenLog: appendLog(next, { kind: "add_custom_scenario", scenarioId: scenario.id }) });
    }
    case "PUSH_SCENARIO": {
      const scenarioId = action.scenarioId;
      const scenario = [...SCENARIO_LIBRARY, ...state.session.customScenarios].find((item) => item.id === scenarioId);
      const firstCurrentApp = "home";
      const targets = resolvePushTargets(state.session, action.targetId);
      if (!scenario || targets.length === 0) {
        return state;
      }
      const now = Date.now();
      const assignmentResult = applyScenarioAssignment(state.session, {
        mode: "practice",
        scenarioId,
        targets,
        assignmentId: `assign-${now}`,
        now,
        firstCurrentApp,
      });
      const practiceMetrics = mergePracticeMetrics(state.practiceMetrics);
      const assessmentMetrics = mergeAssessmentMetrics(state.assessmentMetrics);
      const nextPracticeByAccount = { ...practiceMetrics.byAccount };
      targets.forEach((targetId) => {
        nextPracticeByAccount[targetId] = {
          ...basePracticeAccountMetrics(),
          scenarioId,
          assignmentId: assignmentResult.assignment.id,
          startedAt: now,
        };
      });
      const next = {
        ...state,
        currentApp: assignmentResult.localTargeted ? firstCurrentApp : state.currentApp,
        tabSwitcherOpen: assignmentResult.localTargeted ? false : state.tabSwitcherOpen,
        appHistory: assignmentResult.localTargeted ? ["home"] : state.appHistory,
        practiceMetrics: {
          ...practiceMetrics,
          byAccount: nextPracticeByAccount,
        },
        assessmentMetrics: removeAccountsFromByAccount(assessmentMetrics, targets),
        session: assignmentResult.session,
      };
      return persistSessionState({ ...next, hiddenLog: appendLog(next, { kind: "push_scenario", scenarioId, targetId: action.targetId }) });
    }
    case "SET_WORKSPACE_VIEW":
      return {
        ...state,
        workspace: {
          ...state.workspace,
          view: action.view,
        },
      };
    case "SCORE_CHECKLIST_ITEM": {
      const next = {
        ...state,
        checklistScores: {
          ...state.checklistScores,
          [action.itemId]: action.score,
        },
      };
      return persistSessionState({ ...next, hiddenLog: appendLog(next, { kind: "score_checklist", itemId: action.itemId, score: action.score }) });
    }
    case "UPDATE_ADMIN_NOTES":
      return persistSessionState({
        ...state,
        adminNotes: action.notes,
      });
    case "LOG_CUE": {
      const cue = {
        id: `cue-${Date.now()}`,
        at: Date.now(),
        app: state.currentApp,
        mode: state.session.mode,
        text: action.text,
      };
      const next = {
        ...state,
        interactionMetrics: {
          ...markFirstAction(state),
          cueCount: state.interactionMetrics.cueCount + 1,
        },
        cueLog: [cue, ...state.cueLog].slice(0, 20),
      };
      return persistSessionState({ ...next, hiddenLog: appendLog(next, { kind: "admin_cue", text: action.text }) });
    }
    case "TRACK_INTERACTION": {
      const base = markFirstAction(state);
      const patch = { ...base };
      if (action.eventType === "click") {
        patch.clicks += 1;
      }
      if (action.eventType === "input_focus") {
        patch.inputFocuses += 1;
      }
      if (action.eventType === "typing_latency") {
        patch.typingStarts += 1;
        patch.typingLatencyTotalMs += Math.max(0, action.valueMs ?? 0);
        patch.typingLatencySamples += 1;
      }
      const baseNext = {
        ...state,
        interactionMetrics: patch,
      };
      const next = updateAssessmentAction(baseNext, action.eventType);
      return persistSessionState({ ...next, hiddenLog: appendLog(next, { kind: action.eventType, target: action.target, valueMs: action.valueMs }) });
    }
    default:
      return state;
  }
}

const VirtualOSContext = createContext(null);

export function VirtualOSProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    const timer = setInterval(() => {
      dispatch({ type: "TICK", delta: CLOCK_SPEED });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    function onStorage(event) {
      if (event.key !== liveStateStorageKey() || !event.newValue) {
        return;
      }
      try {
        const snapshot = JSON.parse(event.newValue);
        if (snapshot?.session) {
          dispatch({ type: "HYDRATE_LIVE_STATE", snapshot });
        }
      } catch {
        // Ignore malformed sync payloads.
      }
    }

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const api = useMemo(() => {
    return {
      state,
      helpers: { minutesToClock, rigidAppointments, todayLabel: calendarMeta.todayLabel, todayDate: calendarMeta.todayDate },
      openApp: (app) => dispatch({ type: "OPEN_APP", app }),
      goHome: () => dispatch({ type: "GO_HOME" }),
      goBack: () => dispatch({ type: "GO_BACK" }),
      toggleTabs: () => dispatch({ type: "TOGGLE_TABS" }),
      setTabsOpen: (open) => dispatch({ type: "SET_TABS", open }),
      addEvent: (event) => dispatch({ type: "ADD_EVENT", event }),
      updateEvent: (id, patch) => dispatch({ type: "UPDATE_EVENT", id, patch }),
      deleteEvent: (id) => dispatch({ type: "DELETE_EVENT", id }),
      trackWhatsAppReply: (threadId) => dispatch({ type: "TRACK_WA_REPLY", threadId }),
      trackWhatsAppConfirmation: (threadId) => dispatch({ type: "TRACK_WA_CONFIRM", threadId }),
      trackWhatsAppFriendConfirmation: (threadId) => dispatch({ type: "TRACK_WA_FRIEND_CONFIRM", threadId }),
      resetEvaluation: () => dispatch({ type: "RESET_EVALUATION" }),
      markEvaluationCompleted: () => dispatch({ type: "MARK_COMPLETED" }),
      saveExperienceRating: (rating, accountId) => dispatch({ type: "SAVE_EXPERIENCE_RATING", rating, accountId }),
      submitExperienceRating: (rating, accountId) => dispatch({ type: "SUBMIT_EXPERIENCE_RATING", rating, accountId }),
      startAssessment: () => dispatch({ type: "START_ASSESSMENT" }),
      createSession: () => dispatch({ type: "CREATE_SESSION" }),
      joinSession: (pin, participantPin) => dispatch({ type: "JOIN_SESSION", pin, participantPin }),
      setPendingUserIdentity: (alias, participantPin) => dispatch({ type: "SET_PENDING_USER_IDENTITY", alias, participantPin }),
      markStimulusRead: (stimulusId) => dispatch({ type: "MARK_STIMULUS_READ", stimulusId }),
      dismissStimulus: (stimulusId) => dispatch({ type: "DISMISS_STIMULUS", stimulusId }),
      setSessionMode: (mode) => dispatch({ type: "SET_SESSION_MODE", mode }),
      setWorkspaceView: (view) => dispatch({ type: "SET_WORKSPACE_VIEW", view }),
      scoreChecklistItem: (itemId, score) => dispatch({ type: "SCORE_CHECKLIST_ITEM", itemId, score }),
      updateAdminNotes: (notes) => dispatch({ type: "UPDATE_ADMIN_NOTES", notes }),
      addUserAccount: (account) => dispatch({ type: "ADD_USER_ACCOUNT", ...account }),
      removeUserAccount: (accountId) => dispatch({ type: "REMOVE_USER_ACCOUNT", accountId }),
      setUserMode: (accountId, mode) => dispatch({ type: "SET_USER_MODE", accountId, mode }),
      setLearnModule: (accountId, app) => dispatch({ type: "SET_LEARN_MODULE", accountId, app }),
      trackLearnAttempt: (app, correct, attemptType, accountId) => dispatch({ type: "TRACK_LEARN_ATTEMPT", app, correct, attemptType, accountId }),
      completeLearnModule: (app, accountId) => dispatch({ type: "COMPLETE_LEARN_MODULE", app, accountId }),
      setPracticeSupport: (supportMode, options = {}) => dispatch({ type: "SET_PRACTICE_SUPPORT", supportMode, ...options }),
      trackPracticeStep: (stepId, isComplete) => dispatch({ type: "TRACK_PRACTICE_STEP", stepId, isComplete }),
      trackPracticePrompt: (level) => dispatch({ type: "TRACK_PRACTICE_PROMPT", level }),
      trackPracticeWrongStep: () => dispatch({ type: "TRACK_PRACTICE_WRONG_STEP" }),
      trackPracticeAnswer: (stepId, correct) => dispatch({ type: "TRACK_PRACTICE_ANSWER", stepId, correct }),
      addCustomScenario: (scenario) => dispatch({ type: "ADD_CUSTOM_SCENARIO", scenario }),
      pushScenario: (scenarioId, targetId) => dispatch({ type: "PUSH_SCENARIO", scenarioId, targetId }),
      pushAssessment: (scenarioId, targetId) => dispatch({ type: "PUSH_ASSESSMENT", scenarioId, targetId }),
      completeAssessment: (accountId, completedAt) => dispatch({ type: "COMPLETE_ASSESSMENT", accountId, completedAt }),
      startAssessmentAssignment: (accountId) => dispatch({ type: "START_ASSESSMENT_ASSIGNMENT", accountId }),
      trackAssessmentStuck: (accountId, idleMs, app) => dispatch({ type: "TRACK_ASSESSMENT_STUCK", accountId, idleMs, app }),
      pushAssessmentPrompt: (accountId, prompt) => dispatch({ type: "PUSH_ASSESSMENT_PROMPT", accountId, ...prompt }),
      trackAssessmentAnswer: (accountId, checkId, correct) => dispatch({ type: "TRACK_ASSESSMENT_ANSWER", accountId, checkId, correct }),
      trackAssessmentStep: (accountId, stepId) => dispatch({ type: "TRACK_ASSESSMENT_STEP", accountId, stepId }),
      logCue: (text) => dispatch({ type: "LOG_CUE", text }),
      trackInteraction: (event) => dispatch({ type: "TRACK_INTERACTION", ...event }),
    };
  }, [state]);

  return <VirtualOSContext.Provider value={api}>{children}</VirtualOSContext.Provider>;
}

export function useVirtualOS() {
  const ctx = useContext(VirtualOSContext);
  if (!ctx) {
    throw new Error("useVirtualOS must be used inside VirtualOSProvider");
  }
  return ctx;
}

