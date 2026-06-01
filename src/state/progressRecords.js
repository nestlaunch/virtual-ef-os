import { SCENARIO_LIBRARY } from "./v2Assessment.js";
import { filterEvidenceActions, filterEvidenceEvents, summarizeInteractions } from "./sessionMetrics.js";
import { getLearnAccountMetrics } from "./learnMetrics.js";

export const PROGRESS_EVIDENCE_ACTION_KINDS = [
  "open_app",
  "go_home",
  "go_back",
  "click",
  "change",
  "input_focus",
  "typing_latency",
  "add_event",
  "update_event",
  "delete_event",
  "wa_reply",
  "wa_confirm",
  "wa_friend_confirm",
  "practice_step",
  "practice_answer",
  "practice_wrong_step",
  "practice_prompt",
  "assessment_prompt",
  "assessment_answer",
  "assessment_step",
  "assessment_stuck",
  "assessment_complete",
  "learn_attempt",
  "learn_module_complete",
];

function defaultGetEventsForAccount(events, accountId) {
  return (events || []).filter((event) => !event.accountId || !accountId || event.accountId === accountId);
}

function defaultCapturesAppointment() {
  return false;
}

function defaultCalculateRuleBreaking() {
  return 0;
}

function progressDeps(deps = {}) {
  return {
    rigidAppointments: deps.rigidAppointments || [],
    getEventsForAccount: deps.getEventsForAccount || defaultGetEventsForAccount,
    capturesAppointment: deps.capturesAppointment || defaultCapturesAppointment,
    calculateRuleBreaking: deps.calculateRuleBreaking || defaultCalculateRuleBreaking,
  };
}

export function createTaskEvidenceSnapshot(state, accountId = null, sinceAt = null, deps = {}) {
  const {
    rigidAppointments,
    getEventsForAccount,
    capturesAppointment,
    calculateRuleBreaking,
  } = progressDeps(deps);
  const calendarEvents = filterEvidenceEvents(getEventsForAccount(state.events, accountId), {
    accountId,
    sinceAt,
    source: "Calendar",
  });
  const relevantActions = filterEvidenceActions(state.hiddenLog, {
    accountId,
    sinceAt,
    kinds: PROGRESS_EVIDENCE_ACTION_KINDS,
  }).slice(-200);
  const relevantWhatsAppLogs = filterEvidenceActions(state.hiddenLog, {
    accountId,
    sinceAt,
    kinds: ["wa_reply", "wa_confirm", "wa_friend_confirm"],
  });
  const whatsappRepliesByThread = relevantWhatsAppLogs
    .filter((entry) => entry.kind === "wa_reply")
    .reduce((acc, entry) => {
      const threadId = entry.threadId || "unknown";
      acc[threadId] = (acc[threadId] || 0) + 1;
      return acc;
    }, {});
  const whatsappConfirmedThreads = relevantWhatsAppLogs
    .filter((entry) => entry.kind === "wa_confirm")
    .reduce((acc, entry) => ({ ...acc, [entry.threadId || "unknown"]: true }), {});
  const whatsappFriendConfirmedThreads = relevantWhatsAppLogs
    .filter((entry) => entry.kind === "wa_friend_confirm")
    .reduce((acc, entry) => ({ ...acc, [entry.threadId || "unknown"]: true }), {});
  const whatsappReplyEntries = Object.entries(accountId ? whatsappRepliesByThread : state.metrics.whatsappReplies || {});
  const capturedRequiredAppointments = accountId
    ? rigidAppointments.filter((appointment) => calendarEvents.some((event) => capturesAppointment(event, appointment))).length
    : rigidAppointments.length - (state.metrics?.omissionErrors || 0);
  const boundedCalendarEntries = typeof sinceAt === "number"
    ? relevantActions.filter((entry) => ["add_event", "update_event"].includes(entry.kind)).length
    : calendarEvents.length;

  return {
    calendar: {
      manualEntries: boundedCalendarEntries,
      latestEntry: calendarEvents.at(-1) || null,
      scheduledFromMessages: capturedRequiredAppointments,
      remainingRequiredAppointments: Math.max(0, rigidAppointments.length - capturedRequiredAppointments),
      ruleBreaks: accountId ? calculateRuleBreaking(calendarEvents) : state.metrics.ruleBreaking,
    },
    whatsapp: {
      totalReplies: whatsappReplyEntries.reduce((sum, [, count]) => sum + count, 0),
      repliedThreads: accountId ? whatsappRepliesByThread : state.metrics.whatsappReplies,
      userConfirmedThreads: accountId ? whatsappConfirmedThreads : state.metrics.whatsappConfirmed,
      contactConfirmedThreads: accountId ? whatsappFriendConfirmedThreads : state.metrics.whatsappFriendConfirmed,
    },
    appMutations: state.appMutations,
    recentActions: relevantActions,
    actionCount: relevantActions.length,
    firstAction: relevantActions[0] || null,
    lastAction: relevantActions.at(-1) || null,
  };
}

export function getParticipantScenarioRecord(state, accountId, completedAt = Date.now(), deps = {}) {
  const participant = state.session.participants.find((item) => item.accountId === accountId);
  if (!participant) {
    return null;
  }
  const account = state.session.userAccounts.find((item) => item.id === accountId);
  const activeScenarios = [...SCENARIO_LIBRARY, ...state.session.customScenarios];
  const participantMode = participant.mode || state.session.userModes?.[accountId] || state.session.mode;
  const assignedLearnApp = state.session.learnModules?.[accountId] || "";
  const participantAssessment = state.assessmentMetrics?.byAccount?.[accountId] || null;
  const participantPractice = state.practiceMetrics?.byAccount?.[accountId] || null;
  const modeScenarioId = participantMode === "assessment"
    ? participantAssessment?.scenarioId
    : participantMode === "practice"
      ? participantPractice?.scenarioId
      : "";
  const scenarioId = modeScenarioId || participant.activeScenarioId || "";
  const scenario = activeScenarios.find((item) => item.id === scenarioId);
  const participantApps = scenario?.apps?.length
    ? scenario.apps
    : assignedLearnApp
      ? [assignedLearnApp === "sms" ? "messages" : assignedLearnApp]
      : [];
  const activeAssessmentMetrics = participantMode === "assessment" ? participantAssessment : null;
  const activePracticeMetrics = participantMode === "practice" ? participantPractice : null;
  const participantAttempt = participantMode === "practice" ? activePracticeMetrics?.attempt || 1 : null;
  const assignmentId = participantMode === "assessment"
    ? participantAssessment?.assignmentId || scenarioId
    : participantMode === "practice"
      ? participantPractice?.assignmentId || scenarioId
      : participantMode === "learn"
        ? state.session.assignments?.[accountId]?.filter((item) => item.mode === "learn").at(-1)?.id || assignedLearnApp
        : scenarioId || assignedLearnApp || "";
  const participantStartedAt = participantMode === "assessment"
    ? participantAssessment?.startedAt || state.session.startedAt
    : participantMode === "practice"
      ? participantPractice?.startedAt || state.session.startedAt
      : state.session.assignments?.[accountId]?.filter((item) => item.mode === "learn").at(-1)?.pushedAt || state.session.startedAt;
  const participantTaskEvidence = createTaskEvidenceSnapshot(state, accountId, participantStartedAt, deps);
  const participantInteractionMetrics = summarizeInteractions(state.hiddenLog, accountId, participantStartedAt);

  return {
    id: `progress-${completedAt}-${accountId}-${participantMode}-${scenarioId || assignedLearnApp || "task"}`,
    accountId,
    alias: account?.alias || participant.label,
    completedAt,
    sessionPin: state.session.pin,
    mode: participantMode,
    scenarioId: scenario?.id || "",
    scenarioTitle: scenario?.title || (participantMode === "learn" ? "Learn module" : "Unassigned practice"),
    scenarioComplexity: scenario?.complexity || "Unassigned",
    assignmentId,
    attempt: participantAttempt,
    supportMode: activePracticeMetrics?.supportMode || null,
    apps: participantApps,
    metrics: participantInteractionMetrics,
    learnMetrics: getLearnAccountMetrics(state, accountId),
    practiceMetrics: activePracticeMetrics,
    assessmentMetrics: activeAssessmentMetrics,
    taskEvidence: participantTaskEvidence,
    cognitiveMetrics: {
      attention: state.metrics.omissionErrors,
      sequencing: state.metrics.ruleBreaking,
      flexibility: participantInteractionMetrics.contextSwitches,
      selfMonitoring: participantInteractionMetrics.cueCount,
      cueingRequired: activeAssessmentMetrics?.highestPromptLevel || activePracticeMetrics?.highestPromptLevel || 0,
      processingSpeedMs: activeAssessmentMetrics?.timeToFirstActionMs || participantInteractionMetrics.timeToFirstActionMs,
      typingLatencyMs: participantInteractionMetrics.typingLatencySamples > 0
        ? participantInteractionMetrics.typingLatencyTotalMs / participantInteractionMetrics.typingLatencySamples
        : null,
    },
    checklistScores: state.checklistScores,
    notes: state.adminNotes,
  };
}

export function appendParticipantProgressRecord(state, accountId, completedAt = Date.now(), deps = {}) {
  const progress = getParticipantScenarioRecord(state, accountId, completedAt, deps);
  if (!progress) {
    return state;
  }
  const assignmentId = progress.assignmentId || progress.id;
  const attempt = progress.mode === "practice" ? progress.attempt || 1 : null;
  const alreadySaved = state.session.records.some((record) => (
    record.kind === "progress"
    && record.assignmentId === assignmentId
    && record.participants?.some((participant) => (
      participant.accountId === accountId
      && (progress.mode !== "practice" || (participant.attempt || 1) === attempt)
    ))
  ));
  if (alreadySaved) {
    return state;
  }
  return {
    ...state,
    session: {
      ...state.session,
      records: [
        {
          id: `record-${completedAt}-${accountId}`,
          kind: "progress",
          pin: state.session.pin,
          completedAt,
          participantCount: 1,
          mode: progress.mode,
          scenarioId: progress.scenarioId,
          scenarioTitle: progress.scenarioTitle,
          assignmentId,
          attempt,
          supportMode: progress.supportMode,
          participants: [progress],
          metrics: progress.metrics,
          learnMetrics: progress.learnMetrics,
          practiceMetrics: progress.practiceMetrics,
          assessmentMetrics: progress.assessmentMetrics,
          taskEvidence: progress.taskEvidence,
          checklistScores: state.checklistScores,
          notes: state.adminNotes,
        },
        ...state.session.records,
      ],
    },
  };
}
