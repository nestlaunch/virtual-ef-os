import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  checkRecordCriterion,
  filterRecordItems,
  getAppCompetency,
  getAssessmentAnswerAccuracy,
  getAssessmentMetric,
  getCognitiveReportRows,
  getCompletedFunctionalStepIds,
  getCriterionDomain,
  getCriterionEvidenceDetail,
  getDischargeRelevantIndicators,
  getFunctionalCompletion,
  formatFunctionalStepId,
  getPracticeAnswerAccuracy,
  getTaskAnswerAccuracy,
  percentChange,
  summarizeCriteriaByDomain,
} from "../src/features/admin/recordsMetrics.js";
import { filterEvidenceActions, filterEvidenceEvents, summarizeInteractions } from "../src/state/sessionMetrics.js";
import { appendParticipantProgressRecord, createTaskEvidenceSnapshot } from "../src/state/progressRecords.js";
import { applyAdminControlledSessionFields, getRecordPayload } from "../src/state/cloudSync.js";
import { getChecklistScoresForAccount } from "../src/state/v2Assessment.js";
import { baseLearnMetrics, getLearnAccountMetrics, updateLearnAccuracy } from "../src/state/learnMetrics.js";
import {
  applyLearnModuleAssignment,
  applyModeSelection,
  applyScenarioAssignment,
  attachExperienceRatingToRecords,
  canJoinActiveSession,
  clearEndedSessionForPush,
  getCurrentAssignment,
  getStimulusStartAt,
  invalidateCompletedSessionPin,
  preserveLocalSessionIdentity,
  resetSessionForNewPin,
  resolveInitialCurrentApp,
  resolvePushTargets,
  shouldAdoptSharedApp,
  startAssessmentTiming,
} from "../src/state/sessionLifecycle.js";
import {
  cleanDateInput,
  dateInputValue,
  datePartsFromValue,
  parseDateInput,
  updateDatePartValue,
} from "../src/features/calendar/dateUtils.js";
import { getDateWheelFieldDisplays, getDateWheelPartDisplay, parseDateWheelPartInput } from "../src/features/calendar/dateWheelInput.js";
import { answerMatches, isCorrectLearnAnswer, normalizeAnswer } from "../src/features/learn/answerMatching.js";
import { completedStepsMap, firstIncompleteIndex, getDetectedObservedStep, getDetectedPracticeStep, getPracticeCompletionPatch, shouldCountPracticeMiss } from "../src/features/practice/practiceProgress.js";
import { buildPracticeGuide, flattenGuideSteps, getActivePracticePage, practicePage, stateSafeAppId } from "../src/features/practice/practiceGuideUtils.js";
import { getLatestUnreadStimulus, getVisibleThreadIdsForState } from "../src/state/stimulusSequence.js";
import { clearAllWhatsAppStorage, clearWhatsAppStorage, getWhatsAppStorageKey, LEGACY_WHATSAPP_STORAGE_KEY, WHATSAPP_STORAGE_PREFIX } from "../src/features/whatsapp/whatsappSession.js";
import { getLocalDeviceSnapshot, getSharedSessionSnapshot, getStoredLiveStateSnapshot, mergeLiveStateSnapshot } from "../src/state/sessionStore.js";
import { applyCloudControlledSessionFields } from "../src/state/cloudSync.js";
import { APP_CATALOG, CHECKLIST_ITEMS, SCENARIO_LIBRARY } from "../src/state/v2Assessment.js";
import { getAssessmentAnswerChecksForCriteria, TASK_ANSWER_CHECKS } from "../src/features/taskAnswerChecks.js";
import { canSubmitAssessmentTask } from "../src/features/assessment/assessmentTaskState.js";
import { isSupportTarget } from "../src/app/supportTargets.js";
import { removeAccountsFromByAccount } from "../src/state/modeMetrics.js";

const mapsRecord = {
  id: "maps-1",
  mode: "assessment",
  scenarioId: "single-maps-route",
  apps: ["maps"],
  taskEvidence: {
    recentActions: [
      { kind: "open_app", app: "maps" },
      { kind: "change", target: "maps-field start select" },
      { kind: "change", target: "maps-field destination select" },
      { kind: "click", target: "maps-route-options Public transport" },
      { kind: "click", target: "maps-directions-btn route" },
    ],
  },
  assessmentMetrics: {
    timeToFirstActionMs: 60000,
    actionIntervalsMs: [20000, 10000, 30000],
    highestPromptLevel: 2,
    stuckAlerts: [{ id: "stuck-1" }],
  },
};

const bankRecord = {
  id: "bank-1",
  mode: "practice",
  scenarioId: "single-bank-payment",
  apps: ["bank"],
  taskEvidence: {
    recentActions: [
      { kind: "open_app", app: "bank" },
      { kind: "click", target: "bank-balance-card" },
      { kind: "click", target: "bank-payee-card Hougang Polyclinic" },
      { kind: "input_focus", target: "bank-amount-form amount" },
      { kind: "click", target: "bank-primary-btn review payment" },
    ],
  },
  practiceMetrics: {
    highestPromptLevel: 1,
    completedSteps: ["one", "two", "three"],
  },
};

const bankInfoRecord = {
  ...bankRecord,
  taskEvidence: {
    ...bankRecord.taskEvidence,
    recentActions: [
      ...bankRecord.taskEvidence.recentActions,
      { kind: "practice_answer", stepId: "check-balance", correct: true },
    ],
  },
  practiceMetrics: {
    ...bankRecord.practiceMetrics,
    answerAttempts: 2,
    correctAnswers: 1,
  },
};

const bankPaymentInfoRecord = {
  ...bankRecord,
  taskEvidence: {
    ...bankRecord.taskEvidence,
    recentActions: [
      ...bankRecord.taskEvidence.recentActions,
      { kind: "practice_answer", stepId: "review-details", correct: true },
    ],
  },
};

const bankSingpassCompleteRecord = {
  ...bankPaymentInfoRecord,
  apps: ["bank", "singpass"],
  taskEvidence: {
    ...bankPaymentInfoRecord.taskEvidence,
    recentActions: [
      ...bankPaymentInfoRecord.taskEvidence.recentActions,
      { kind: "open_app", app: "singpass" },
      { kind: "practice_answer", stepId: "match-singpass-details", correct: true },
      { kind: "singpass_approved", payee: "Hougang Polyclinic", amount: "25.00" },
    ],
  },
};

const bankWrongPaymentInfoRecord = {
  ...bankRecord,
  taskEvidence: {
    ...bankRecord.taskEvidence,
    recentActions: [
      ...bankRecord.taskEvidence.recentActions,
      { kind: "practice_answer", stepId: "review-details", correct: false },
    ],
  },
};

const bankWrongInfoRecord = {
  ...bankRecord,
  taskEvidence: {
    ...bankRecord.taskEvidence,
    recentActions: [
      ...bankRecord.taskEvidence.recentActions,
      { kind: "practice_answer", stepId: "check-balance", correct: false },
    ],
  },
  practiceMetrics: {
    ...bankRecord.practiceMetrics,
    answerAttempts: 1,
    correctAnswers: 0,
  },
};

const mixedRetrievalRecord = {
  id: "mixed-retrieval",
  mode: "practice",
  scenarioId: "multi-payment-appointment",
  apps: ["messages", "calendar", "bank"],
  taskEvidence: {
    recentActions: [
      { kind: "open_app", app: "sms" },
      { kind: "click", target: "doctor" },
      { kind: "open_app", app: "bank" },
      { kind: "practice_answer", stepId: "check-balance", correct: false },
    ],
  },
  practiceMetrics: {
    answerAttempts: 1,
    correctAnswers: 0,
  },
};

const whatsappRecord = {
  id: "wa-1",
  mode: "practice",
  scenarioId: "single-whatsapp-reply",
  apps: ["whatsapp"],
  taskEvidence: {
    whatsapp: { totalReplies: 1 },
    recentActions: [
      { kind: "open_app", app: "whatsapp" },
      { kind: "click", target: "Family Group" },
      { kind: "wa_reply", threadId: "family" },
    ],
  },
};

const calendarLocationRecord = {
  id: "calendar-location",
  mode: "practice",
  scenarioId: "two-calendar-maps",
  apps: ["calendar", "maps"],
  taskEvidence: {
    recentActions: [
      { kind: "open_app", app: "calendar" },
      { kind: "practice_answer", stepId: "calendar-read-location", correct: true },
    ],
  },
};

const wrongCalendarLocationRecord = {
  ...calendarLocationRecord,
  taskEvidence: {
    recentActions: [
      { kind: "open_app", app: "calendar" },
      { kind: "practice_answer", stepId: "calendar-read-location", correct: false },
    ],
  },
};

const assessmentAnswerRecord = {
  ...mapsRecord,
  taskEvidence: {
    ...mapsRecord.taskEvidence,
    recentActions: [
      ...mapsRecord.taskEvidence.recentActions,
      { kind: "assessment_answer", checkId: "route-duration", correct: true },
      { kind: "assessment_answer", checkId: "appointment-details", correct: false },
    ],
  },
  assessmentMetrics: {
    ...mapsRecord.assessmentMetrics,
    answerAttempts: 2,
    correctAnswers: 1,
    completedSteps: ["maps-start-home", "maps-destination-clinic"],
  },
};

const assessmentWrongDurationRecord = {
  ...mapsRecord,
  taskEvidence: {
    ...mapsRecord.taskEvidence,
    recentActions: [
      ...mapsRecord.taskEvidence.recentActions,
      { kind: "assessment_answer", checkId: "route-duration", correct: false },
    ],
  },
  assessmentMetrics: {
    ...mapsRecord.assessmentMetrics,
    answerAttempts: 1,
    correctAnswers: 0,
  },
};

assert.equal(checkRecordCriterion(mapsRecord, "Set start: Home"), true);
assert.equal(checkRecordCriterion(mapsRecord, "Set destination: Clinic B"), true);
assert.equal(checkRecordCriterion(mapsRecord, "Choose Public transport"), true);
assert.equal(checkRecordCriterion(mapsRecord, "Tap Directions and read duration"), true);
assert.equal(checkRecordCriterion(assessmentAnswerRecord, "Tap Directions and read duration"), true);
assert.equal(checkRecordCriterion(assessmentWrongDurationRecord, "Tap Directions and read duration"), false);
assert.deepEqual(getFunctionalCompletion(mapsRecord), { done: 4, total: 4, pct: 100, criteria: [
  "Set start: Home",
  "Set destination: Clinic B",
  "Choose Public transport",
  "Tap Directions and read duration",
] });

assert.equal(checkRecordCriterion(bankRecord, "Choose Hougang Polyclinic"), true);
assert.equal(checkRecordCriterion(bankRecord, "Enter amount: 25.00"), true);
assert.equal(checkRecordCriterion(bankRecord, "Review and approve payment"), true);
assert.equal(getFunctionalCompletion(bankRecord).pct, 57);
assert.equal(checkRecordCriterion(bankSingpassCompleteRecord, "Open Singpass"), true);
assert.equal(checkRecordCriterion(bankSingpassCompleteRecord, "Match recipient and amount"), true);
assert.equal(checkRecordCriterion(bankSingpassCompleteRecord, "Approve payment in Singpass"), true);
assert.equal(getFunctionalCompletion(bankSingpassCompleteRecord).pct, 100);
assert.equal(checkRecordCriterion(bankInfoRecord, "Check total balance: S$2262.60"), true);
assert.equal(checkRecordCriterion(bankWrongInfoRecord, "Check total balance: S$2262.60"), false);
assert.equal(checkRecordCriterion(bankPaymentInfoRecord, "Review before approving"), true);
assert.equal(checkRecordCriterion(bankWrongPaymentInfoRecord, "Review before approving"), false);
assert.equal(checkRecordCriterion(mixedRetrievalRecord, "Read appointment message"), true);
assert.equal(checkRecordCriterion(calendarLocationRecord, "Read location: Clinic B"), true);
assert.equal(checkRecordCriterion(wrongCalendarLocationRecord, "Read location: Clinic B"), false);
assert.equal(getCriterionEvidenceDetail(assessmentAnswerRecord, "Tap Directions and read duration"), "Task-card answer 1/1 correct");
assert.equal(getCriterionEvidenceDetail(wrongCalendarLocationRecord, "Read location: Clinic B"), "Task-card answer 0/1 correct");
assert.equal(getCriterionEvidenceDetail(whatsappRecord, "Send the message"), "1 WhatsApp reply sent");
assert.deepEqual(getPracticeAnswerAccuracy(bankInfoRecord), { correct: 1, attempts: 2, pct: 50 });
assert.deepEqual(getAssessmentAnswerAccuracy(assessmentAnswerRecord), { correct: 1, attempts: 2, pct: 50 });
assert.deepEqual(getTaskAnswerAccuracy(assessmentAnswerRecord), { correct: 1, attempts: 2, pct: 50 });

assert.equal(checkRecordCriterion(whatsappRecord, "Open Family Group"), true);
assert.equal(checkRecordCriterion(whatsappRecord, "Send the message"), true);

assert.equal(getAssessmentMetric(mapsRecord, "avgActionInterval"), 20000);
assert.equal(getAssessmentMetric(mapsRecord, "stuckAlerts"), 1);
assert.equal(getAssessmentMetric(bankRecord, "practiceSteps"), 3);
assert.equal(getAssessmentMetric(assessmentAnswerRecord, "practiceSteps"), 2);
assert.deepEqual(getCompletedFunctionalStepIds({
  practiceMetrics: { completedSteps: ["open-bank", "review"] },
  assessmentMetrics: { completedSteps: ["review", "submit"] },
}), ["open-bank", "review", "submit"]);
assert.equal(formatFunctionalStepId("maps-start-home"), "Maps Start Home");
assert.equal(getAssessmentMetric(bankRecord, "highestPromptLevel"), 1);
assert.deepEqual(removeAccountsFromByAccount({
  byAccount: {
    "user-a": { scenarioId: "single-bank-payment" },
    "user-b": { scenarioId: "single-maps-route" },
  },
}, ["user-a"]), {
  byAccount: {
    "user-b": { scenarioId: "single-maps-route" },
  },
});

assert.equal(getAppCompetency([mapsRecord, bankRecord], "maps"), 100);
assert.equal(filterRecordItems([mapsRecord, bankRecord], { mode: "assessment", app: "maps", scenario: "all" }).length, 1);
assert.equal(percentChange(80000, 60000, true), "25% improved");
assert.equal(getCriterionDomain("Read route duration"), "Information extraction");
assert.equal(getCriterionDomain("Set destination: Clinic B"), "App navigation");
assert.equal(getCriterionDomain("Review and approve payment"), "Self-monitoring");
assert.equal(getCriterionDomain("Review before approving"), "Self-monitoring");
assert.equal(getCriterionDomain("Check Calendar appointment"), "Information extraction");
assert.equal(getCriterionDomain("Set Home to Clinic B"), "App navigation");
assert.equal(getCriterionDomain("Plan route from Home to Clinic B"), "Sequencing");
assert.equal(getCriterionDomain("Pay Hougang Polyclinic S$25.00"), "Task execution");
assert.deepEqual(
  getAssessmentAnswerChecksForCriteria(["Read location: Clinic B", "Review before approving"]).map((check) => check.id),
  ["clinic-location", "payment-details"],
);
assert.deepEqual(
  getAssessmentAnswerChecksForCriteria(["Identify 07 Jun 2026, 3:00 PM, Clinic B"]).map((check) => check.id),
  ["appointment-details"],
);
const infoCriterionPattern = /read|identify|check total balance|check calendar appointment|duration|location|review before approving|review and approve|pay hougang|amount/i;
const scenarioInformationCriteria = SCENARIO_LIBRARY.flatMap((scenario) => (
  scenario.successCriteria
    .filter((criterion) => infoCriterionPattern.test(criterion))
    .map((criterion) => ({ scenarioId: scenario.id, criterion }))
));
const unmappedInformationCriteria = scenarioInformationCriteria.filter(({ criterion }) => (
  getAssessmentAnswerChecksForCriteria([criterion]).length === 0
));
assert.deepEqual(unmappedInformationCriteria, []);
const readinessIndicators = getDischargeRelevantIndicators([
  {
    ...mapsRecord,
    id: "maps-old",
    completedAt: 1000,
    assessmentMetrics: {
      ...mapsRecord.assessmentMetrics,
      timeToFirstActionMs: 90000,
      highestPromptLevel: 3,
      stuckAlerts: [{ id: "old-stuck" }],
    },
  },
  {
    ...assessmentAnswerRecord,
    id: "maps-new",
    completedAt: 2000,
    assessmentMetrics: {
      ...assessmentAnswerRecord.assessmentMetrics,
      timeToFirstActionMs: 25000,
      highestPromptLevel: 1,
      stuckAlerts: [],
    },
  },
]);
assert.equal(readinessIndicators.find((item) => item.label === "Functional consistency").met, true);
assert.equal(readinessIndicators.find((item) => item.label === "Cueing burden").met, true);
assert.equal(readinessIndicators.find((item) => item.label === "Initiation").met, true);
assert.equal(readinessIndicators.find((item) => item.label === "Task engagement").met, true);
assert.equal(readinessIndicators.find((item) => item.label === "Information retrieval").value, "1/2 correct (50%)");
assert.equal(getDischargeRelevantIndicators([]).length, 0);
assert.deepEqual(summarizeCriteriaByDomain(mapsRecord), {
  "App navigation": { total: 3, done: 3 },
  "Information extraction": { total: 1, done: 1 },
});
const cognitiveRows = getCognitiveReportRows(mapsRecord, { ...mapsRecord, assessmentMetrics: { ...mapsRecord.assessmentMetrics, timeToFirstActionMs: 80000, actionIntervalsMs: [40000] } });
assert.equal(cognitiveRows.find((row) => row.label === "Initiation").change, "25% improved");
assert.equal(cognitiveRows.find((row) => row.label === "Working memory / goal maintenance").display, "4/4 steps");
assert.equal(getCognitiveReportRows(bankInfoRecord).find((row) => row.label === "Information retrieval accuracy").display, "1/2 answers");
assert.equal(getCognitiveReportRows(assessmentAnswerRecord).find((row) => row.label === "Information retrieval accuracy").display, "1/2 answers");

const startedAt = 1000;
const mixedActions = [
  { accountId: "user-a", kind: "open_app", app: "sms", at: 2000 },
  { accountId: "user-a", kind: "click", target: "doctor", at: 2500 },
  { accountId: "user-a", kind: "toggle_tabs", at: 2750 },
  { accountId: "user-a", kind: "typing_latency", valueMs: 1200, at: 3000 },
  { accountId: "user-b", kind: "open_app", app: "bank", at: 1800 },
  { accountId: "user-b", kind: "click", target: "bank", at: 2200 },
  { accountId: "user-b", kind: "assessment_prompt", level: 2, at: 5000 },
];

assert.deepEqual(summarizeInteractions(mixedActions, "user-a", startedAt), {
  clicks: 1,
  inputFocuses: 0,
  typingStarts: 1,
  typingLatencyTotalMs: 1200,
  typingLatencySamples: 1,
  backPresses: 0,
  homePresses: 0,
  recentPresses: 1,
  cueCount: 0,
  contextSwitches: 1,
  timeToFirstActionMs: 1000,
});
assert.equal(summarizeInteractions(mixedActions, "user-b", startedAt).cueCount, 1);
assert.equal(summarizeInteractions(mixedActions, null, startedAt).clicks, 2);
assert.deepEqual(
  filterEvidenceActions([
    { accountId: "user-a", kind: "click", at: 1000 },
    { accountId: "user-a", kind: "click", at: 2000 },
    { accountId: "user-b", kind: "click", at: 2500 },
    { accountId: "user-a", kind: "open_app", at: 3000 },
  ], { accountId: "user-a", sinceAt: 1500, kinds: ["click"] }),
  [{ accountId: "user-a", kind: "click", at: 2000 }],
);
assert.deepEqual(
  filterEvidenceEvents([
    { id: "old", accountId: "user-a", source: "Calendar", createdAt: 1000 },
    { id: "new", accountId: "user-a", source: "Calendar", createdAt: 3000 },
    { id: "other", accountId: "user-b", source: "Calendar", createdAt: 4000 },
    { id: "sms", accountId: "user-a", source: "SMS", createdAt: 5000 },
  ], { accountId: "user-a", sinceAt: 2500, source: "Calendar" }).map((event) => event.id),
  ["new"],
);

const progressState = {
  session: {
    pin: "ABCDEF",
    mode: "assessment",
    startedAt: 1000,
    customScenarios: [],
    records: [],
    userModes: { "user-a": "assessment", "user-b": "practice" },
    learnModules: {},
    participants: [
      { accountId: "user-a", label: "Calm Panda", role: "patient", mode: "assessment", activeScenarioId: "single-maps-route" },
      { accountId: "user-b", label: "Bright Otter", role: "patient", mode: "practice", activeScenarioId: "single-bank-payment" },
    ],
    userAccounts: [
      { id: "user-a", alias: "Calm Panda", pin: "1842" },
      { id: "user-b", alias: "Bright Otter", pin: "5093" },
    ],
  },
  events: [
    { id: "a-old", accountId: "user-a", source: "Calendar", createdAt: 900 },
    { id: "a-new", accountId: "user-a", source: "Calendar", createdAt: 2500 },
    { id: "b-new", accountId: "user-b", source: "Calendar", createdAt: 2600 },
  ],
  hiddenLog: [
    { accountId: "user-a", kind: "open_app", app: "maps", at: 1500 },
    { accountId: "user-b", kind: "open_app", app: "bank", at: 1600 },
    { accountId: "user-a", kind: "add_event", eventId: "a-new", at: 2500 },
    { accountId: "user-a", kind: "assessment_answer", checkId: "route-duration", correct: true, at: 3000 },
    { accountId: "user-a", kind: "assessment_complete", at: 3100 },
  ],
  metrics: {
    omissionErrors: 2,
    ruleBreaking: 0,
    whatsappReplies: {},
    whatsappConfirmed: {},
    whatsappFriendConfirmed: {},
    inhibitionFailure: { noiseMs: 0, taskMs: 0 },
  },
  appMutations: { calendar: 0, maps: 0, bank: 0 },
  learnMetrics: baseLearnMetrics(),
  practiceMetrics: { byAccount: {} },
  assessmentMetrics: {
    byAccount: {
      "user-a": {
        scenarioId: "single-maps-route",
        assignmentId: "assess-1",
        startedAt: 1000,
        completedAt: 3200,
        timeToFirstActionMs: 500,
        highestPromptLevel: 1,
        answerAttempts: 1,
        correctAnswers: 1,
      },
    },
  },
  checklistScores: {},
  adminNotes: "steady route planning",
};

const progressEvidence = createTaskEvidenceSnapshot(progressState, "user-a", 1000);
assert.equal(progressEvidence.calendar.manualEntries, 1);
assert.equal(progressEvidence.recentActions.some((entry) => entry.accountId === "user-b"), false);
assert.equal(progressEvidence.recentActions.some((entry) => entry.kind === "assessment_answer"), true);

const progressOnce = appendParticipantProgressRecord(progressState, "user-a", 4000);
assert.equal(progressOnce.session.records.length, 1);
assert.equal(progressOnce.session.records[0].kind, "progress");
assert.equal(progressOnce.session.records[0].assignmentId, "assess-1");
assert.equal(progressOnce.session.records[0].participants[0].scenarioTitle, "Route to Clinic B");
assert.equal(progressOnce.session.records[0].participants[0].taskEvidence.recentActions.some((entry) => entry.kind === "assessment_complete"), true);
assert.equal(Object.hasOwn(progressOnce.session.records[0].participants[0].cognitiveMetrics, "safetyJudgement"), false);
const progressTwice = appendParticipantProgressRecord(progressOnce, "user-a", 5000);
assert.equal(progressTwice.session.records.length, 1);
assert.equal(APP_CATALOG.find((app) => app.id === "bank").domains.includes("safety judgement"), false);
assert.equal(CHECKLIST_ITEMS.some((item) => /assistance|help/i.test(`${item.label} ${item.anchor}`)), false);

const mixedModeProgress = appendParticipantProgressRecord({
  ...progressState,
  hiddenLog: [
    ...progressState.hiddenLog,
    { accountId: "user-b", kind: "practice_step", stepId: "bank-login", at: 2700 },
    { accountId: "user-b", kind: "practice_answer", stepId: "check-balance", correct: true, at: 2800 },
  ],
  practiceMetrics: {
    byAccount: {
      "user-b": {
        scenarioId: "single-bank-payment",
        assignmentId: "practice-current",
        startedAt: 2000,
        completedAt: 3600,
        completedSteps: ["bank-login", "check-balance"],
        answerAttempts: 1,
        correctAnswers: 1,
        highestPromptLevel: 0,
      },
    },
  },
  assessmentMetrics: {
    byAccount: {
      "user-b": {
        scenarioId: "single-maps-route",
        assignmentId: "stale-assessment",
        startedAt: 1000,
        completedAt: 1500,
        highestPromptLevel: 3,
      },
    },
  },
}, "user-b", 6000);
const mixedRecord = mixedModeProgress.session.records[0];
assert.equal(mixedRecord.assignmentId, "practice-current");
assert.equal(mixedRecord.scenarioId, "single-bank-payment");
assert.equal(mixedRecord.participants[0].scenarioTitle, "Pay Clinic Bill");
assert.equal(mixedRecord.participants[0].assessmentMetrics, null);
assert.equal(mixedRecord.participants[0].practiceMetrics.assignmentId, "practice-current");
assert.equal(mixedRecord.participants[0].taskEvidence.recentActions.some((entry) => entry.accountId === "user-a"), false);
const secondPracticeAttempt = appendParticipantProgressRecord({
  ...progressState,
  session: {
    ...progressState.session,
    userModes: { "user-b": "practice" },
    participants: [{
      accountId: "user-b",
      label: "Bright Otter",
      role: "patient",
      mode: "practice",
      activeScenarioId: "single-bank-payment",
    }],
    records: [{
      id: "record-attempt-1",
      kind: "progress",
      assignmentId: "practice-current",
      participants: [{ accountId: "user-b", attempt: 1 }],
    }],
  },
  hiddenLog: [
    { accountId: "user-b", kind: "open_app", app: "bank", at: 2100 },
    { accountId: "user-b", kind: "practice_step", stepId: "login", at: 2200 },
  ],
  practiceMetrics: {
    byAccount: {
      "user-b": {
        scenarioId: "single-bank-payment",
        assignmentId: "practice-current",
        startedAt: 2000,
        completedAt: 4000,
        attempt: 2,
        supportMode: "prompt",
        completedSteps: ["login"],
      },
    },
  },
  assessmentMetrics: { byAccount: {} },
}, "user-b", 7000);
assert.equal(secondPracticeAttempt.session.records.length, 2);
assert.equal(secondPracticeAttempt.session.records[0].attempt, 2);
assert.equal(secondPracticeAttempt.session.records[0].supportMode, "prompt");
assert.equal(secondPracticeAttempt.session.records[0].participants[0].attempt, 2);
const duplicatePracticeAttempt = appendParticipantProgressRecord(secondPracticeAttempt, "user-b", 8000);
assert.equal(duplicatePracticeAttempt.session.records.length, 2);

const localSession = {
  pin: "OLDPIN",
  joined: true,
  deviceId: "device-local",
  currentUserId: "user-a",
  pendingAlias: "Calm Panda",
  pendingUserPin: "1842",
  readStimuli: ["stim-a"],
  dismissedStimuli: ["stim-b"],
};
const sharedSession = {
  pin: "NEWPIN",
  controlRevision: 0,
  mode: "practice",
  participantLimit: 6,
  joined: false,
  joinError: "",
  deviceId: "device-admin",
  currentUserId: "admin",
  pendingAlias: "",
  pendingUserPin: "",
  readStimuli: [],
  dismissedStimuli: [],
  participants: [],
  userAccounts: [],
  removedAccountIds: [],
  assignments: {},
  userModes: {},
  learnModules: {},
  customScenarios: [],
  customStimuli: [],
  records: [],
  events: [],
  experienceRatings: {},
};
assert.deepEqual(preserveLocalSessionIdentity(localSession, sharedSession), {
  ...sharedSession,
  joined: false,
  deviceId: "device-local",
  currentUserId: null,
  pendingAlias: "Calm Panda",
  pendingUserPin: "1842",
  readStimuli: [],
  dismissedStimuli: [],
});
assert.deepEqual(preserveLocalSessionIdentity({
  ...localSession,
  participants: [{ accountId: "user-a", mode: "practice", activeScenarioId: "scenario-old" }],
}, {
  ...sharedSession,
  participants: [{ accountId: "user-a", mode: "practice", activeScenarioId: "scenario-old" }],
}), {
  ...sharedSession,
  deviceId: "device-local",
  joined: true,
  currentUserId: "user-a",
  pendingAlias: "Calm Panda",
  pendingUserPin: "1842",
  readStimuli: ["stim-a"],
  dismissedStimuli: ["stim-b"],
  participants: [{ accountId: "user-a", mode: "practice", activeScenarioId: "scenario-old" }],
});
assert.deepEqual(getLocalDeviceSnapshot({ ...localSession, participants: [{ accountId: "user-a" }] }), {
  deviceId: "device-local",
  joined: true,
  currentUserId: "user-a",
  pendingAlias: "Calm Panda",
  pendingUserPin: "1842",
  readStimuli: ["stim-a"],
  dismissedStimuli: ["stim-b"],
});
assert.deepEqual(getSharedSessionSnapshot({
  ...localSession,
  joinError: "Wrong PIN",
  participants: [{ accountId: "user-a" }],
  userAccounts: [{ id: "user-a" }],
  records: [{ id: "record-1" }],
}), {
  ...localSession,
  controlRevision: 0,
  mode: "practice",
  participantLimit: 6,
  joined: false,
  joinError: "",
  deviceId: null,
  currentUserId: null,
  pendingAlias: "",
  pendingUserPin: "",
  readStimuli: [],
  dismissedStimuli: [],
  participants: [{ accountId: "user-a" }],
  userAccounts: [{ id: "user-a" }],
  removedAccountIds: [],
  assignments: {},
  userModes: {},
  learnModules: {},
  customScenarios: [],
  customStimuli: [],
  records: [{ id: "record-1" }],
  events: [],
  experienceRatings: {},
});
assert.equal(getSharedSessionSnapshot({ userAccounts: [{ id: "user-a", alias: "Calm Panda", pin: "1234" }] }).userAccounts[0].pin, undefined);
assert.deepEqual(preserveLocalSessionIdentity(localSession, {
  pin: "PARTLY",
  participants: [{ accountId: "user-a" }],
}).userModes, {});
assert.deepEqual(mergeLiveStateSnapshot({
  session: {
    pin: "PARTLY",
    participants: [{ accountId: "user-a" }],
  },
  events: [],
}, null).session.learnModules, {});
const patientPublishSnapshot = applyCloudControlledSessionFields({
  session: {
    pin: "PUSHED",
    mode: "practice",
    currentUserId: "user-a",
    participants: [{ accountId: "user-a", role: "patient", mode: "practice", currentApp: "calendar", activeScenarioId: "" }],
    userModes: { "user-a": "practice" },
    assignments: {},
    learnModules: {},
    customStimuli: [],
  },
}, {
  session: {
    pin: "PUSHED",
    mode: "learn",
    participants: [{ accountId: "user-a", role: "patient", mode: "learn", currentApp: "home", activeScenarioId: "learn-calendar" }],
    userModes: { "user-a": "learn" },
    assignments: { "user-a": [{ id: "learn-now", mode: "learn", scenarioId: "learn-calendar" }] },
    learnModules: { "user-a": "calendar" },
    customStimuli: [{ id: "custom-one" }],
  },
}, "user-a");
assert.equal(patientPublishSnapshot.session.participants[0].currentApp, "calendar");
assert.equal(patientPublishSnapshot.session.participants[0].mode, "learn");
assert.deepEqual(patientPublishSnapshot.session.userModes, { "user-a": "learn" });
assert.deepEqual(patientPublishSnapshot.session.learnModules, { "user-a": "calendar" });
assert.equal(patientPublishSnapshot.session.assignments["user-a"][0].id, "learn-now");
assert.equal(patientPublishSnapshot.session.customStimuli[0].id, "custom-one");
const clearedPatientAssignment = applyCloudControlledSessionFields({
  session: {
    pin: "CLEARED",
    participants: [{ accountId: "user-a", mode: "learn", activeScenarioId: "learn-calendar" }],
  },
}, {
  session: {
    pin: "CLEARED",
    mode: "free",
    participants: [{ accountId: "user-a", mode: "free", activeScenarioId: "", currentApp: "home" }],
    assignments: {},
    userModes: { "user-a": "free" },
    learnModules: {},
  },
}, "user-a");
assert.equal(clearedPatientAssignment.session.participants[0].activeScenarioId, "");
const adminControlledSnapshot = applyAdminControlledSessionFields({
  session: {
    pin: "PUSHED",
    mode: "learn",
    controlRevision: 2,
    assignments: { "user-a": [{ id: "old-learn" }] },
    userModes: { "user-a": "learn" },
    learnModules: { "user-a": "calendar" },
    customStimuli: [{ id: "old-message" }],
    customScenarios: [],
  },
}, {
  session: {
    mode: "free",
    controlRevision: 3,
    assignments: {},
    userModes: { "user-a": "free" },
    learnModules: {},
    customStimuli: [],
    customScenarios: [],
  },
});
assert.equal(adminControlledSnapshot.session.mode, "free");
assert.equal(adminControlledSnapshot.session.controlRevision, 3);
assert.deepEqual(adminControlledSnapshot.session.assignments, {});
assert.deepEqual(adminControlledSnapshot.session.learnModules, {});
assert.deepEqual(adminControlledSnapshot.session.customStimuli, []);
const currentLiveSnapshot = getStoredLiveStateSnapshot({
  session: {
    pin: "MERGEA",
    joined: true,
    participants: [{ accountId: "user-a", currentApp: "sms" }],
    userAccounts: [{ id: "user-a", alias: "Calm Panda" }],
    customScenarios: [],
    records: [{ id: "record-current", completedAt: 20 }],
    assignments: { "user-a": [{ id: "assign-a", scenarioId: "single-maps-route" }] },
    userModes: { "user-a": "assessment" },
    learnModules: { "user-a": "calendar" },
  },
  currentMinutes: 600,
  currentApp: "sms",
  appHistory: [],
  tabSwitcherOpen: false,
  events: [{ id: "event-a", accountId: "user-a" }],
  scheduledSourceIds: ["sms-doctor-main"],
  contextSwitches: 1,
  appMutations: {},
  lastOpenMutationSnapshot: {},
  metrics: {},
  interactionMetrics: {},
  learnMetrics: baseLearnMetrics(),
  practiceMetrics: {
    byAccount: {
      "user-a": { scenarioId: "single-messages-details", completedSteps: ["sms-open-doctor"] },
    },
  },
  assessmentMetrics: {
    byAccount: {
      "user-a": { scenarioId: "single-maps-route", actionCount: 2 },
    },
  },
  checklistScores: {},
  adminNotes: "",
  cueLog: [],
  hiddenLog: [{ at: 20, accountId: "user-a", kind: "open_app", app: "sms" }],
});
const mergedLiveSnapshot = mergeLiveStateSnapshot(currentLiveSnapshot, {
  ...currentLiveSnapshot,
  session: {
    ...currentLiveSnapshot.session,
    participants: [{ accountId: "user-b", currentApp: "bank" }],
    userAccounts: [{ id: "user-b", alias: "Bright Otter" }],
    records: [{ id: "record-previous", completedAt: 10 }],
    assignments: { "user-b": [{ id: "assign-b", scenarioId: "single-bank-payment" }] },
    userModes: { "user-b": "practice" },
    learnModules: { "user-b": "bank" },
  },
  events: [{ id: "event-b", accountId: "user-b" }],
  appMutations: { bank: 2 },
  learnMetrics: {
    byAccount: {
      "user-b": {
        modulesCompleted: 1,
        completedByApp: { bank: 1 },
        timeByAppMs: { bank: 12000 },
        attempts: { correct: 2, total: 3 },
        byApp: { bank: { correct: 2, total: 3 } },
      },
    },
  },
  practiceMetrics: {
    byAccount: {
      "user-b": { scenarioId: "single-bank-payment", completedSteps: ["bank-login"] },
    },
  },
  assessmentMetrics: {
    byAccount: {
      "user-b": { scenarioId: "multi-clinic-day", actionCount: 4 },
    },
  },
  hiddenLog: [{ at: 10, accountId: "user-b", kind: "open_app", app: "bank" }],
});
assert.deepEqual(mergedLiveSnapshot.session.participants.map((item) => item.accountId).sort(), ["user-a", "user-b"]);
assert.deepEqual(mergedLiveSnapshot.session.userAccounts.map((item) => item.id).sort(), ["user-a", "user-b"]);
assert.deepEqual(mergedLiveSnapshot.session.records.map((item) => item.id).sort(), ["record-current", "record-previous"]);
assert.deepEqual(Object.keys(mergedLiveSnapshot.session.assignments).sort(), ["user-a", "user-b"]);
assert.deepEqual(mergedLiveSnapshot.session.userModes, { "user-a": "assessment", "user-b": "practice" });
assert.deepEqual(mergedLiveSnapshot.session.learnModules, { "user-a": "calendar", "user-b": "bank" });
assert.deepEqual(mergedLiveSnapshot.events.map((item) => item.id).sort(), ["event-a", "event-b"]);
assert.deepEqual(mergedLiveSnapshot.hiddenLog.map((item) => item.accountId).sort(), ["user-a", "user-b"]);
assert.equal(mergedLiveSnapshot.appMutations.bank, 2);
assert.deepEqual(Object.keys(mergedLiveSnapshot.practiceMetrics.byAccount).sort(), ["user-a", "user-b"]);
assert.deepEqual(Object.keys(mergedLiveSnapshot.assessmentMetrics.byAccount).sort(), ["user-a", "user-b"]);
assert.equal(mergedLiveSnapshot.learnMetrics.byAccount["user-b"].modulesCompleted, 1);
assert.deepEqual(mergedLiveSnapshot.learnMetrics.attempts, { correct: 2, total: 3 });
assert.deepEqual(mergedLiveSnapshot.learnMetrics.byApp.bank, { correct: 2, total: 3 });
const newPinMerge = mergeLiveStateSnapshot(currentLiveSnapshot, {
  ...currentLiveSnapshot,
  session: {
    ...currentLiveSnapshot.session,
    pin: "OLDPIN",
    participants: [{ accountId: "old-user", currentApp: "bank" }],
    assignments: { "old-user": [{ id: "old-assignment" }] },
    records: [{ id: "old-record", completedAt: 1 }],
  },
  events: [{ id: "old-event", accountId: "old-user" }],
  hiddenLog: [{ at: 1, accountId: "old", kind: "open_app" }],
});
assert.equal(newPinMerge.session.pin, "MERGEA");
assert.deepEqual(newPinMerge.session.participants.map((item) => item.accountId), ["user-a"]);
assert.deepEqual(Object.keys(newPinMerge.session.assignments), ["user-a"]);
assert.deepEqual(newPinMerge.session.records.map((item) => item.id), ["record-current"]);
assert.deepEqual(newPinMerge.events.map((item) => item.id), ["event-a"]);
assert.equal(newPinMerge.hiddenLog.some((entry) => entry.accountId === "old"), false);
const removedAccountMerge = mergeLiveStateSnapshot({
  ...currentLiveSnapshot,
  session: {
    ...currentLiveSnapshot.session,
    participants: [{ accountId: "user-a", currentApp: "sms" }],
    userAccounts: [{ id: "user-a", alias: "Calm Panda" }],
    removedAccountIds: ["user-b"],
    assignments: {
      "user-a": [{ id: "assign-a", scenarioId: "single-maps-route" }],
    },
    userModes: { "user-a": "practice" },
    learnModules: {},
  },
  events: [{ id: "event-a", accountId: "user-a" }],
  learnMetrics: baseLearnMetrics(),
  practiceMetrics: { byAccount: { "user-a": { scenarioId: "single-messages-details" } } },
  assessmentMetrics: { byAccount: { "user-a": { scenarioId: "single-maps-route" } } },
  hiddenLog: [{ at: 20, accountId: "user-a", kind: "open_app", app: "sms" }],
}, {
  ...currentLiveSnapshot,
  session: {
    ...currentLiveSnapshot.session,
    participants: [{ accountId: "user-b", currentApp: "bank" }],
    userAccounts: [{ id: "user-b", alias: "Bright Otter" }],
    removedAccountIds: [],
    assignments: { "user-b": [{ id: "assign-b", scenarioId: "single-bank-payment" }] },
    userModes: { "user-b": "practice" },
    learnModules: { "user-b": "bank" },
  },
  events: [{ id: "event-b", accountId: "user-b" }],
  learnMetrics: {
    byAccount: {
      "user-b": {
        modulesCompleted: 1,
        attempts: { correct: 1, total: 1 },
        byApp: { bank: { correct: 1, total: 1 } },
      },
    },
  },
  practiceMetrics: { byAccount: { "user-b": { scenarioId: "single-bank-payment" } } },
  assessmentMetrics: { byAccount: { "user-b": { scenarioId: "multi-clinic-day" } } },
  hiddenLog: [{ at: 10, accountId: "user-b", kind: "open_app", app: "bank" }],
});
assert.deepEqual(removedAccountMerge.session.removedAccountIds, ["user-b"]);
assert.deepEqual(removedAccountMerge.session.participants.map((item) => item.accountId), ["user-a"]);
assert.deepEqual(removedAccountMerge.session.userAccounts.map((item) => item.id), ["user-a"]);
assert.deepEqual(Object.keys(removedAccountMerge.session.assignments), ["user-a"]);
assert.equal(removedAccountMerge.session.userModes["user-b"], undefined);
assert.equal(removedAccountMerge.session.learnModules["user-b"], undefined);
assert.equal(removedAccountMerge.events.some((event) => event.accountId === "user-b"), false);
assert.equal(removedAccountMerge.hiddenLog.some((entry) => entry.accountId === "user-b"), false);
assert.equal(removedAccountMerge.practiceMetrics.byAccount["user-b"], undefined);
assert.equal(removedAccountMerge.assessmentMetrics.byAccount["user-b"], undefined);
assert.equal(removedAccountMerge.learnMetrics.byAccount["user-b"], undefined);
assert.deepEqual(attachExperienceRatingToRecords([{
  id: "record-rating",
  participants: [
    { accountId: "user-a", alias: "Calm Panda" },
    { accountId: "user-b", alias: "Bright Otter" },
  ],
}], "user-a", 4, 12345), [{
  id: "record-rating",
  experienceRatings: { "user-a": 4 },
  participants: [
    { accountId: "user-a", alias: "Calm Panda", experienceRating: 4, experienceRatedAt: 12345 },
    { accountId: "user-b", alias: "Bright Otter" },
  ],
}]);

const isolatedLearn = updateLearnAccuracy(
  updateLearnAccuracy(baseLearnMetrics(), "calendar", true, "user-a"),
  "calendar",
  false,
  "user-b",
);
assert.deepEqual(isolatedLearn.attempts, { correct: 1, total: 2 });
assert.deepEqual(getLearnAccountMetrics(isolatedLearn, "user-a").attempts, { correct: 1, total: 1 });
assert.deepEqual(getLearnAccountMetrics(isolatedLearn, "user-b").attempts, { correct: 0, total: 1 });
assert.deepEqual(getLearnAccountMetrics(isolatedLearn, "user-a").byApp.calendar, { correct: 1, total: 1 });
assert.deepEqual(getLearnAccountMetrics(isolatedLearn, "user-b").byApp.calendar, { correct: 0, total: 1 });
assert.deepEqual(preserveLocalSessionIdentity({
  ...localSession,
  participants: [{ accountId: "user-a", mode: "practice", activeScenarioId: "scenario-old" }],
}, {
  ...sharedSession,
  participants: [{ accountId: "user-a", mode: "assessment", activeScenarioId: "scenario-new" }],
  assignments: { "user-a": [{ scenarioId: "scenario-new", pushedAt: 9000 }] },
}).readStimuli, []);
assert.deepEqual(preserveLocalSessionIdentity({
  ...localSession,
  joined: true,
  participants: [{ accountId: "user-a", mode: "practice", activeScenarioId: "scenario-old" }],
}, {
  ...sharedSession,
  pin: "BRANDN",
  participants: [],
  userAccounts: [{ id: "user-a", alias: "Calm Panda" }],
}), {
  ...sharedSession,
  pin: "BRANDN",
  deviceId: "device-local",
  joined: false,
  currentUserId: null,
  pendingAlias: "Calm Panda",
  pendingUserPin: "1842",
  readStimuli: [],
  dismissedStimuli: [],
  participants: [],
  userAccounts: [{ id: "user-a", alias: "Calm Panda" }],
});

const localState = {
  session: {
    currentUserId: "user-a",
    participants: [{ accountId: "user-a", mode: "practice", activeScenarioId: "scenario-1" }],
  },
};
assert.equal(shouldAdoptSharedApp(localState, {
  session: { participants: [{ accountId: "user-a", mode: "practice", activeScenarioId: "scenario-1" }] },
}), false);
assert.equal(shouldAdoptSharedApp(localState, {
  session: { participants: [{ accountId: "user-a", mode: "assessment", activeScenarioId: "scenario-2" }] },
}), true);
assert.equal(shouldAdoptSharedApp(localState, {
  session: { participants: [{ accountId: "user-b", mode: "assessment", activeScenarioId: "scenario-2" }] },
}), false);
assert.equal(resolveInitialCurrentApp({
  currentApp: "bank",
  session: { participants: [{ accountId: "user-a", currentApp: "calendar" }] },
}, { currentUserId: "user-a" }), "calendar");
assert.equal(resolveInitialCurrentApp({
  currentApp: "instructions",
  session: { participants: [] },
}, { currentUserId: "user-missing" }), "home");
assert.equal(resolveInitialCurrentApp({ currentApp: "maps" }, null), "maps");

assert.equal(invalidateCompletedSessionPin({ pin: "ABCDEF" }, "GHIJKL", 1000).pin, "GHIJKL");
assert.deepEqual(clearEndedSessionForPush({ completedAt: 1, endingStartedAt: 2, endedAt: 3, pin: "GHIJKL" }), {
  completedAt: null,
  endingStartedAt: null,
  endedAt: null,
  pin: "GHIJKL",
});
assert.equal(canJoinActiveSession({ pin: "ABCDEF" }), true);
assert.equal(canJoinActiveSession({ pin: "ABCDEF", endingStartedAt: 1000 }), false);
assert.equal(canJoinActiveSession({ pin: "ABCDEF", completedAt: 1000 }), false);
assert.equal(canJoinActiveSession({ pin: "ABCDEF", endedAt: 1000 }), false);
assert.deepEqual(startAssessmentTiming({
  startedAt: 1000,
  startedByUserAt: null,
  completedAt: 2000,
  lastActionAt: 1200,
  timeToFirstActionMs: 200,
  actionCount: 3,
  tapCount: 2,
  actionIntervalsMs: [100, 200],
  currentPrompt: { id: "prompt-1" },
  promptResponseTimesMs: [300],
  highestPromptLevel: 2,
}, 5000), {
  startedAt: 1000,
  startedByUserAt: 5000,
  completedAt: null,
  lastActionAt: 5000,
  timeToFirstActionMs: null,
  actionCount: 0,
  tapCount: 0,
  actionIntervalsMs: [],
  currentPrompt: null,
  promptResponseTimesMs: [],
  highestPromptLevel: 2,
});
assert.deepEqual(resetSessionForNewPin({
  pin: "OLDPIN",
  joined: true,
  joinError: "Old error",
  participants: [{ accountId: "user-a" }],
  currentUserId: "user-a",
  userModes: { "user-a": "assessment" },
  assignments: { "user-a": [{ id: "old-assignment" }] },
  learnModules: { "user-a": "calendar" },
  experienceRatings: { "user-a": 4 },
  records: [{ id: "record-1" }],
  userAccounts: [{ id: "user-a" }],
  customScenarios: [{ id: "custom-1" }],
}, { pin: "NEWPIN", deviceId: "device-a", startedAt: 7000 }), {
  pin: "NEWPIN",
  controlRevision: 0,
  joined: false,
  joinError: "",
  deviceId: "device-a",
  participants: [],
  currentUserId: null,
  userModes: {},
  assignments: {},
  readStimuli: [],
  dismissedStimuli: [],
  learnModules: {},
  experienceRatings: {},
  startedAt: 7000,
  firstEntryAt: null,
  completedAt: null,
  endingStartedAt: null,
  endedAt: null,
  records: [{ id: "record-1" }],
  userAccounts: [{ id: "user-a" }],
  customScenarios: [{ id: "custom-1" }],
  customStimuli: [],
});
assert.deepEqual(resolvePushTargets({
  participants: [
    { role: "patient", accountId: "user-a" },
    { role: "patient", accountId: "user-b" },
    { role: "admin", accountId: "admin" },
  ],
}, "all"), ["user-a", "user-b"]);
assert.deepEqual(resolvePushTargets({ participants: [{ role: "patient", accountId: "user-a" }] }, "user-a"), ["user-a"]);
assert.deepEqual(resolvePushTargets({ participants: [{ role: "patient", accountId: "user-a" }] }, "user-missing"), []);
assert.equal(getCurrentAssignment({
  assignments: {
    "user-a": [
      { id: "old-practice", mode: "practice", scenarioId: "single-bank-payment" },
      { id: "new-assessment", mode: "assessment", scenarioId: "single-maps-route" },
    ],
  },
}, "user-a", "practice").id, "old-practice");
assert.equal(getCurrentAssignment({
  assignments: {
    "user-a": [
      { id: "old-practice", mode: "practice", scenarioId: "single-bank-payment" },
      { id: "new-assessment", mode: "assessment", scenarioId: "single-maps-route" },
    ],
  },
}, "user-a").id, "new-assessment");
assert.equal(getCurrentAssignment({ assignments: {} }, "user-a", "practice"), null);
const assignmentResult = applyScenarioAssignment({
  currentUserId: "user-a",
  completedAt: 1,
  endingStartedAt: 2,
  endedAt: 3,
  readStimuli: ["old"],
  dismissedStimuli: ["old-dismissed"],
  assignments: {},
  learnModules: { "user-a": "sms", "user-b": "bank" },
  userModes: {},
  participants: [
    { role: "patient", accountId: "user-a", currentApp: "sms", mode: "learn", activeScenarioId: "" },
    { role: "patient", accountId: "user-b", currentApp: "bank", mode: "free", activeScenarioId: "" },
  ],
}, {
  mode: "practice",
  scenarioId: "scenario-next",
  targets: ["user-a"],
  assignmentId: "assign-next",
  now: 6000,
});
assert.equal(assignmentResult.localTargeted, true);
assert.deepEqual(assignmentResult.session.readStimuli, []);
assert.equal(assignmentResult.session.completedAt, null);
assert.equal(assignmentResult.session.userModes["user-a"], "practice");
assert.equal(assignmentResult.session.learnModules["user-a"], undefined);
assert.equal(assignmentResult.session.learnModules["user-b"], "bank");
assert.equal(assignmentResult.session.participants[0].currentApp, "home");
assert.equal(assignmentResult.session.participants[1].currentApp, "bank");
assert.equal(assignmentResult.session.assignments["user-a"][0].id, "assign-next");
assert.equal(assignmentResult.session.controlRevision, 1);
const allAssignmentResult = applyScenarioAssignment({
  currentUserId: "user-a",
  completedAt: 1,
  endingStartedAt: 2,
  endedAt: 3,
  readStimuli: ["old"],
  dismissedStimuli: ["old-dismissed"],
  assignments: { "user-a": [{ id: "old-a" }], "user-b": [{ id: "old-b" }] },
  learnModules: { "user-a": "sms", "user-b": "bank" },
  userModes: { "user-a": "learn", "user-b": "free" },
  participants: [
    { role: "patient", accountId: "user-a", currentApp: "sms", mode: "learn", activeScenarioId: "learn-sms" },
    { role: "patient", accountId: "user-b", currentApp: "bank", mode: "free", activeScenarioId: "" },
  ],
}, {
  mode: "assessment",
  scenarioId: "scenario-all",
  targets: ["user-a", "user-b"],
  assignmentId: "assign-all",
  now: 6100,
});
assert.equal(allAssignmentResult.localTargeted, true);
assert.equal(allAssignmentResult.session.completedAt, null);
assert.deepEqual(allAssignmentResult.session.readStimuli, []);
assert.equal(allAssignmentResult.session.userModes["user-a"], "assessment");
assert.equal(allAssignmentResult.session.userModes["user-b"], "assessment");
assert.equal(allAssignmentResult.session.learnModules["user-a"], undefined);
assert.equal(allAssignmentResult.session.learnModules["user-b"], undefined);
assert.equal(allAssignmentResult.session.participants[0].currentApp, "home");
assert.equal(allAssignmentResult.session.participants[1].currentApp, "home");
assert.equal(allAssignmentResult.session.participants[0].activeScenarioId, "scenario-all");
assert.equal(allAssignmentResult.session.participants[1].activeScenarioId, "scenario-all");
assert.equal(allAssignmentResult.session.assignments["user-a"].at(-1).id, "assign-all");
assert.equal(allAssignmentResult.session.assignments["user-b"].at(-1).id, "assign-all");
const learnAssignmentResult = applyLearnModuleAssignment({
  currentUserId: "user-a",
  completedAt: 1,
  endingStartedAt: 2,
  endedAt: 3,
  assignments: { "user-a": [{ id: "old-learn", mode: "learn", scenarioId: "learn-calendar" }] },
  learnModules: { "user-a": "calendar" },
  userModes: { "user-a": "learn" },
  participants: [
    { role: "patient", accountId: "user-a", currentApp: "home" },
    { role: "patient", accountId: "user-b", currentApp: "home" },
  ],
}, {
  accountId: "user-a",
  app: "calendar",
  assignmentId: "new-learn",
  now: 5000,
});
assert.equal(learnAssignmentResult.localTargeted, true);
assert.equal(learnAssignmentResult.session.completedAt, null);
assert.equal(learnAssignmentResult.session.assignments["user-a"].at(-1).id, "new-learn");
assert.equal(learnAssignmentResult.session.learnModules["user-a"], "calendar");
assert.equal(learnAssignmentResult.session.participants[0].activeScenarioId, "learn-calendar");
assert.equal(learnAssignmentResult.session.participants[1].currentApp, "home");
assert.equal(learnAssignmentResult.session.controlRevision, 1);
const isolatedLearnAssignmentResult = applyLearnModuleAssignment({
  currentUserId: "user-a",
  assignments: { "user-a": [{ id: "old-a" }], "user-b": [{ id: "old-b" }] },
  learnModules: { "user-a": "calendar", "user-b": "sms" },
  userModes: { "user-a": "practice", "user-b": "learn" },
  participants: [
    { role: "patient", accountId: "user-a", currentApp: "calendar", mode: "practice", activeScenarioId: "scenario-a" },
    { role: "patient", accountId: "user-b", currentApp: "sms", mode: "learn", activeScenarioId: "learn-sms" },
  ],
}, {
  accountId: "user-a",
  app: "bank",
  assignmentId: "learn-bank-a",
  now: 6200,
});
assert.equal(isolatedLearnAssignmentResult.localTargeted, true);
assert.equal(isolatedLearnAssignmentResult.session.userModes["user-a"], "learn");
assert.equal(isolatedLearnAssignmentResult.session.userModes["user-b"], "learn");
assert.equal(isolatedLearnAssignmentResult.session.learnModules["user-a"], "bank");
assert.equal(isolatedLearnAssignmentResult.session.learnModules["user-b"], "sms");
assert.equal(isolatedLearnAssignmentResult.session.participants[0].currentApp, "bank");
assert.equal(isolatedLearnAssignmentResult.session.participants[1].currentApp, "sms");
assert.equal(isolatedLearnAssignmentResult.session.participants[1].activeScenarioId, "learn-sms");
assert.equal(applyLearnModuleAssignment({ participants: [] }, { accountId: "missing", app: "calendar", assignmentId: "x", now: 1 }), null);
const modeSelectionResult = applyModeSelection({
  currentUserId: "user-a",
  completedAt: 1,
  endingStartedAt: 2,
  endedAt: 3,
  readStimuli: ["read-old"],
  dismissedStimuli: ["dismiss-old"],
  assignments: {
    "user-a": [{ id: "old-practice", mode: "practice", scenarioId: "single-bank-payment" }],
    "user-b": [{ id: "keep-learn", mode: "learn", scenarioId: "learn-sms" }],
  },
  learnModules: { "user-a": "bank", "user-b": "sms" },
  userModes: { "user-a": "practice", "user-b": "learn" },
  participants: [
    { role: "patient", accountId: "user-a", currentApp: "bank", mode: "practice", activeScenarioId: "single-bank-payment" },
    { role: "patient", accountId: "user-b", currentApp: "sms", mode: "learn", activeScenarioId: "learn-sms" },
  ],
}, {
  accountId: "user-a",
  mode: "assessment",
  now: 7000,
});
assert.equal(modeSelectionResult.localTargeted, true);
assert.equal(modeSelectionResult.session.completedAt, null);
assert.deepEqual(modeSelectionResult.session.readStimuli, []);
assert.equal(modeSelectionResult.session.userModes["user-a"], "assessment");
assert.equal(modeSelectionResult.session.userModes["user-b"], "learn");
assert.equal(modeSelectionResult.session.assignments["user-a"], undefined);
assert.equal(modeSelectionResult.session.assignments["user-b"].at(-1).id, "keep-learn");
assert.equal(modeSelectionResult.session.learnModules["user-a"], undefined);
assert.equal(modeSelectionResult.session.learnModules["user-b"], "sms");
assert.equal(modeSelectionResult.session.participants[0].activeScenarioId, "");
assert.equal(modeSelectionResult.session.participants[0].currentApp, "home");
assert.equal(modeSelectionResult.session.participants[1].activeScenarioId, "learn-sms");
assert.equal(modeSelectionResult.session.controlRevision, 1);
assert.equal(applyModeSelection({ participants: [] }, { accountId: "missing", mode: "free", now: 1 }), null);
assert.equal(getStimulusStartAt({ startedAt: 1000, assignments: { "user-a": [{ pushedAt: 4000 }] } }, "user-a"), 4000);
assert.equal(getStimulusStartAt({ startedAt: 1000, assignments: {} }, "user-a"), 1000);
assert.equal(getStimulusStartAt({
  startedAt: 1000,
  userModes: { "user-a": "practice" },
  assignments: {
    "user-a": [
      { mode: "learn", pushedAt: 3000 },
      { mode: "practice", pushedAt: 5000 },
      { mode: "assessment", pushedAt: 7000 },
    ],
  },
}, "user-a"), 5000);
assert.equal(getStimulusStartAt({
  startedAt: 1000,
  userModes: { "user-a": "free" },
  assignments: { "user-a": [{ mode: "practice", pushedAt: 5000 }] },
}, "user-a"), 1000);
const stimulusState = {
  session: {
    startedAt: 1000,
    currentUserId: "user-a",
    readStimuli: [],
    dismissedStimuli: [],
    userModes: { "user-a": "practice" },
    assignments: { "user-a": [{ id: "assign-stim", mode: "practice", scenarioId: "single-whatsapp-reply", pushedAt: 10000 }] },
  },
};
assert.deepEqual(getVisibleThreadIdsForState("whatsapp", stimulusState, 18000), []);
assert.deepEqual(getVisibleThreadIdsForState("whatsapp", stimulusState, 20000), ["jia-wei"]);
assert.equal(getLatestUnreadStimulus(stimulusState, 20000).id, "wa-jia-wei");
assert.equal(getWhatsAppStorageKey(stimulusState.session), `${WHATSAPP_STORAGE_PREFIX}:user-a:assign-stim`);
assert.equal(getWhatsAppStorageKey({
  ...stimulusState.session,
  userModes: { "user-a": "practice" },
  assignments: {
    "user-a": [
      { id: "old-learn", mode: "learn", pushedAt: 9000 },
      { id: "practice-active", mode: "practice", pushedAt: 10000 },
      { id: "assessment-newer", mode: "assessment", pushedAt: 11000 },
    ],
  },
}, "practice"), `${WHATSAPP_STORAGE_PREFIX}:user-a:practice-active`);

function createStorageMock(seed) {
  const store = new Map(Object.entries(seed));
  return {
    get length() {
      return store.size;
    },
    key(index) {
      return [...store.keys()][index] || null;
    },
    removeItem(key) {
      store.delete(key);
    },
    has(key) {
      return store.has(key);
    },
  };
}
const storageMock = createStorageMock({
  [LEGACY_WHATSAPP_STORAGE_KEY]: "old",
  [`${WHATSAPP_STORAGE_PREFIX}:user-a:one`]: "one",
  [`${WHATSAPP_STORAGE_PREFIX}:user-b:two`]: "two",
  unrelated: "keep",
});
clearWhatsAppStorage(storageMock, `${WHATSAPP_STORAGE_PREFIX}:user-a:one`);
assert.equal(storageMock.has(LEGACY_WHATSAPP_STORAGE_KEY), false);
assert.equal(storageMock.has(`${WHATSAPP_STORAGE_PREFIX}:user-a:one`), false);
assert.equal(storageMock.has(`${WHATSAPP_STORAGE_PREFIX}:user-b:two`), true);
assert.equal(storageMock.has("unrelated"), true);
clearAllWhatsAppStorage(storageMock);
assert.equal(storageMock.has(`${WHATSAPP_STORAGE_PREFIX}:user-b:two`), false);
assert.equal(storageMock.has("unrelated"), true);

assert.deepEqual(parseDateInput("07062026"), { date: 7, month: 5, year: 2026 });
assert.equal(parseDateInput("31022026"), null);
assert.equal(cleanDateInput("07/06/2026"), "07062026");
assert.equal(dateInputValue({ date: 7, month: 5, year: 2026 }), "07062026");
assert.deepEqual(datePartsFromValue("07062026", null), { date: 7, month: 5, year: 2026 });
assert.deepEqual(updateDatePartValue({ date: 31, month: 4, year: 2026 }, "month", 5), { date: 30, month: 5, year: 2026 });
assert.equal(parseDateWheelPartInput("date", "07", { daysInMonth: 30 }), 7);
assert.equal(parseDateWheelPartInput("date", "32", { daysInMonth: 30 }), null);
assert.equal(parseDateWheelPartInput("month", "Jun"), 5);
assert.equal(parseDateWheelPartInput("month", "6"), 5);
assert.equal(parseDateWheelPartInput("year", "2026", { minYear: 2025, maxYear: 2032 }), 2026);
assert.equal(parseDateWheelPartInput("year", "2035", { minYear: 2025, maxYear: 2032 }), null);
assert.equal(getDateWheelPartDisplay({ value: "08", textContent: "wrong" }), "08");
assert.equal(getDateWheelPartDisplay({ textContent: " Jun " }), "Jun");
assert.deepEqual(getDateWheelFieldDisplays({
  querySelectorAll: () => [{ value: "07" }, { value: "Jun" }, { value: "2026" }],
}), ["07", "Jun", "2026"]);

const practiceSteps = [
  { id: "open-app", isDone: (event) => event.type === "app" && event.app === "sms" },
  { id: "read-info", isDone: (event) => event.type === "answer" },
];
const emptyCompletedMap = completedStepsMap([]);
assert.equal(firstIncompleteIndex(practiceSteps, emptyCompletedMap), 0);
assert.equal(getDetectedPracticeStep(practiceSteps, emptyCompletedMap, { type: "app", app: "sms" })?.id, "open-app");
assert.equal(getDetectedPracticeStep(practiceSteps, emptyCompletedMap, { type: "answer" }), null);
assert.equal(getDetectedObservedStep(practiceSteps, emptyCompletedMap, { type: "answer" })?.id, "read-info");
assert.equal(getDetectedPracticeStep(practiceSteps, emptyCompletedMap, { type: "app", app: "sms" }, "open-app"), null);
assert.deepEqual(getPracticeCompletionPatch(practiceSteps, emptyCompletedMap, "open-app"), { stepId: "open-app", isComplete: false });
const oneDoneMap = completedStepsMap(["open-app"]);
assert.equal(firstIncompleteIndex(practiceSteps, oneDoneMap), 1);
assert.deepEqual(getPracticeCompletionPatch(practiceSteps, oneDoneMap, "read-info"), { stepId: "read-info", isComplete: true });
assert.equal(getPracticeCompletionPatch(practiceSteps, oneDoneMap, "open-app"), null);
assert.equal(shouldCountPracticeMiss({ id: "date-step" }, {
  type: "click",
  target: { closest: (selector) => selector.includes(".date-wheel-fields"), matches: () => false },
}), false);
assert.equal(shouldCountPracticeMiss({ id: "date-step" }, {
  type: "change",
  target: { closest: (selector) => selector.includes(".date-wheel-fields"), matches: () => false },
}), false);
assert.equal(shouldCountPracticeMiss({ id: "title-step" }, {
  type: "change",
  target: { closest: (selector) => selector.includes(".title-input"), matches: () => false },
}), false);
assert.equal(shouldCountPracticeMiss({ id: "app-step" }, {
  type: "click",
  target: { closest: () => null, matches: () => false },
}), true);
assert.equal(shouldCountPracticeMiss({ id: "answer-step", answers: [{ label: "Yes", correct: true }] }, {
  type: "click",
  target: { closest: () => null, matches: () => false },
}), false);
const fallbackPracticeGuide = buildPracticeGuide({
  id: "fallback",
  title: "Fallback task",
  description: "Fallback practice.",
  successCriteria: ["Open app"],
}, {
  title: "Current App",
  steps: [{ id: "open" }],
});
assert.equal(stateSafeAppId("Current App!"), "current-app-");
assert.deepEqual(flattenGuideSteps(fallbackPracticeGuide).map((step) => step.id), ["open"]);
assert.equal(getActivePracticePage({
  pages: [
    practicePage("home", "home", "Home screen", [{ id: "open-app" }]),
    practicePage("app", "sms", "Messages page", [{ id: "read" }]),
  ],
}, { "open-app": true }, "sms").page.id, "app");
assert.equal(isSupportTarget({
  closest: (selector) => selector.includes("[data-support-ui]"),
}), true);
assert.equal(isSupportTarget({
  closest: () => null,
}), false);
assert.equal(TASK_ANSWER_CHECKS.clinicLocation.answers.length >= 3, true);
assert.equal(TASK_ANSWER_CHECKS.paymentDetails.answers.length >= 3, true);
assert.equal(canSubmitAssessmentTask([], {}), true);
assert.equal(canSubmitAssessmentTask([TASK_ANSWER_CHECKS.clinicLocation], {}), false);
assert.equal(canSubmitAssessmentTask([TASK_ANSWER_CHECKS.clinicLocation], { "clinic-location": "wrong" }), true);
assert.equal(canSubmitAssessmentTask([TASK_ANSWER_CHECKS.clinicLocation, TASK_ANSWER_CHECKS.routeDuration], { "clinic-location": "correct" }), false);
assert.equal(canSubmitAssessmentTask([TASK_ANSWER_CHECKS.clinicLocation, TASK_ANSWER_CHECKS.routeDuration], { "clinic-location": "correct", "route-duration": "wrong" }), true);

assert.equal(normalizeAnswer("07 June 2026, 3pm"), "7 jun 2026 3 pm");
assert.equal(answerMatches("7 june 2026 3pm", "07 Jun 2026 03:00 PM"), true);
assert.equal(answerMatches("7/6/2026 3pm clinic b", "07 Jun 2026, 3:00 PM, Clinic B"), true);
assert.equal(answerMatches("07 Jun 2026 1500 Clinic B", "07 Jun 2026, 3:00 PM, Clinic B"), true);
assert.equal(answerMatches("June 7 2026 3 pm Clinic B", "07/06/2026 1500 Clinic B"), true);
assert.equal(answerMatches("08 June 2026 3pm", "07 Jun 2026 03:00 PM"), false);
assert.equal(answerMatches("6 July 2026 3pm clinic b", "07 Jun 2026, 3:00 PM, Clinic B"), false);
assert.equal(answerMatches("06/07/2026 3pm clinic b", "07 Jun 2026, 3:00 PM, Clinic B"), false);
assert.equal(answerMatches("7/6/2026 4pm clinic b", "07 Jun 2026, 3:00 PM, Clinic B"), false);
assert.equal(answerMatches("7/6/2026 3pm clinic a", "07 Jun 2026, 3:00 PM, Clinic B"), false);
assert.equal(isCorrectLearnAnswer("2262.60", [{ label: "S$2262.60", correct: true }]), true);
assert.equal(isCorrectLearnAnswer("14", [{ label: "14 min", correct: true }]), true);
assert.equal(isCorrectLearnAnswer("Clinic C", TASK_ANSWER_CHECKS.clinicLocation.answers), false);
assert.equal(isCorrectLearnAnswer("Hougang Polyclinic, S$250.00", TASK_ANSWER_CHECKS.paymentDetails.answers), false);
const practiceGuideSource = readFileSync(new URL("../src/features/practice/practiceGuides.js", import.meta.url), "utf8");
const mapsAppSource = readFileSync(new URL("../src/features/maps/MapsApp.jsx", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../src/app/App.jsx", import.meta.url), "utf8");
const assessmentOverlaySource = readFileSync(new URL("../src/features/assessment/AssessmentOverlays.jsx", import.meta.url), "utf8");
SCENARIO_LIBRARY
  .filter((scenario) => scenario.id.startsWith("single-"))
  .forEach((scenario) => {
    assert.equal(practiceGuideSource.includes(`"${scenario.id}"`), true, `${scenario.id} should have a page-aware practice guide`);
  });
assert.equal(practiceGuideSource.includes('practicePage("home-to-sms", "home", "Home screen"'), true);
assert.equal(practiceGuideSource.includes('practicePage("home-to-bank", "home", "Home screen"'), true);
assert.equal(practiceGuideSource.includes("function isDinnerDateTimeSet"), true);
assert.equal(practiceGuideSource.includes('start: "18:30", end: "20:00"'), true);
assert.equal(practiceGuideSource.includes('event.target.value.trim().toLowerCase() === "dinner"'), true);
assert.equal(practiceGuideSource.includes('event.target.value.trim().toLowerCase() === "psychiatry appointment"'), true);
assert.equal(mapsAppSource.includes('id: "home", name: "Home"'), true);
assert.equal(mapsAppSource.includes('"home|hougang-polyclinic": { transit: 14'), true);
assert.equal(appSource.includes('onClick={onOnlineMode}'), true);
assert.equal(appSource.includes('<JoinSession />'), true);
assert.equal(assessmentOverlaySource.includes('className="assessment-offline-results"'), true);
assert.equal(assessmentOverlaySource.includes('state.workspace?.mode === "local"'), true);

const separatedScores = {
  checklistScoresByAccount: {
    "patient-a": { sequences_steps: 4 },
    "patient-b": { sequences_steps: 1 },
  },
};
assert.equal(getChecklistScoresForAccount(separatedScores, "patient-a").sequences_steps, 4);
assert.equal(getChecklistScoresForAccount(separatedScores, "patient-b").sequences_steps, 1);
const checklistPayload = getRecordPayload(
  { id: "record-1", mode: "assessment" },
  { accountId: "patient-a", checklistScores: { sequences_steps: 4 } },
  "session-1",
);
assert.deepEqual(checklistPayload.functional.checklist, { sequences_steps: 4 });

console.log("recordsMetrics regression tests passed");
