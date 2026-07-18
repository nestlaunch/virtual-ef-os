import { initialEvents, calendarMeta } from "./seedData";
import { baseLearnMetrics } from "./learnMetrics";

const MINUTES_PER_DAY = 24 * 60;

export function minutesToClock(minutes) {
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

export function capturesAppointment(event, appointment) {
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

export function calculateRuleBreaking(events) {
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

export function getEventsForAccount(events, accountId) {
  return events.filter((event) => !event.accountId || !accountId || event.accountId === accountId);
}

export function countCalendarErrors(state, rigidAppointments) {
  const accountEvents = getEventsForAccount(state.events, state.session.currentUserId);
  const omissionErrors = rigidAppointments.filter((appointment) => (
    !state.scheduledSourceIds.includes(appointment.id)
    && !accountEvents.some((event) => event.source === "Calendar" && capturesAppointment(event, appointment))
  )).length;
  return omissionErrors + calculateRuleBreaking(accountEvents) + countIncompleteErrors(accountEvents);
}

export function recalcMetrics(state, rigidAppointments) {
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

export function baseMetrics(rigidAppointments = []) {
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

export function basePracticeMetrics() {
  return {
    byAccount: {},
  };
}

export function basePracticeAccountMetrics() {
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
    promptHistory: [],
    wrongStepAttempts: 0,
    answerAttempts: 0,
    correctAnswers: 0,
    checklistCompleted: false,
    hiddenCompleted: false,
  };
}

export function baseAssessmentMetrics() {
  return {
    byAccount: {},
  };
}

export function baseAssessmentAccountMetrics() {
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

export function mergeAssessmentMetrics(metrics) {
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

export function getAssessmentAccountMetrics(state, accountId) {
  return {
    ...baseAssessmentAccountMetrics(),
    ...(state.assessmentMetrics?.byAccount?.[accountId] || {}),
  };
}

export function mergePracticeMetrics(metrics) {
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

export function getPracticeAccountMetrics(state, accountId) {
  return {
    ...basePracticeAccountMetrics(),
    ...(state.practiceMetrics?.byAccount?.[accountId] || {}),
  };
}

export function progressRecordDeps(rigidAppointments) {
  return {
    rigidAppointments,
    getEventsForAccount,
    capturesAppointment,
    calculateRuleBreaking,
  };
}

export function resetEvaluationState(state, rigidAppointments) {
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
      singpass: 0,
      settings: 0,
      home: 0,
    },
    lastOpenMutationSnapshot: {
      calendar: 0,
      sms: 0,
      whatsapp: 0,
      maps: 0,
      bank: 0,
      singpass: 0,
      settings: 0,
      home: 0,
    },
    metrics: baseMetrics(rigidAppointments),
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
    singpass: {
      transaction: null,
    },
    learnMetrics: baseLearnMetrics(),
    practiceMetrics: basePracticeMetrics(),
    assessmentMetrics: baseAssessmentMetrics(),
    checklistScoresByAccount: {},
    adminNotes: "",
    cueLog: [],
    hiddenLog: [],
  };
}

export function resetCalendarForTaskChange(state, rigidAppointments) {
  return {
    ...state,
    events: initialEvents,
    scheduledSourceIds: initialEvents.map((event) => event.sourceId).filter(Boolean),
    appMutations: {
      ...state.appMutations,
      calendar: 0,
    },
    lastOpenMutationSnapshot: {
      ...state.lastOpenMutationSnapshot,
      calendar: 0,
    },
    metrics: baseMetrics(rigidAppointments),
    singpass: {
      transaction: null,
    },
  };
}
