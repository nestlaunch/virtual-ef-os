import { useEffect, useState } from "react";
import { formatParticipantOption, getParticipantCode } from "../../state/participantIdentity";
import { getCurrentAssignment } from "../../state/sessionLifecycle";
import { APP_CATALOG, CHECKLIST_ITEMS, LEARN_APP_CATALOG, SCORE_LABELS, SCENARIO_LIBRARY, SESSION_MODES, formatAlias, getChecklistScoresForAccount } from "../../state/v2Assessment";
import { formalThreads, weeklyRules, whatsappThreads } from "../../state/seedData";
import { useVirtualOS } from "../../state/VirtualOSContext";
import { PRACTICE_GUIDES, PRACTICE_PAGE_OVERRIDES } from "../practice/practiceGuides";
import { buildPracticeGuide, flattenGuideSteps } from "../practice/practiceGuideUtils";
import { getDoctorAppointmentTarget, getTaskAnswerIds } from "../taskAnswerChecks";
import { checkRecordCriterion, filterRecordItems, getAppCompetency, getAssessmentMetric, getCognitiveReportRows, getCriterionDomain, getCriterionEvidenceDetail, getFunctionalCompletion, getScenarioForRecord, getTaskAnswerAccuracy, percentChange } from "./recordsMetrics";

const QUICK_CUES = [
  "Read the instruction again.",
  "Check the date and time before saving.",
  "Look for a safety warning.",
  "Pause and review before confirming.",
];

const ASSESSMENT_PROMPTS = [
  { level: 1, label: "General", text: "Take another look at the task." },
  { level: 2, label: "Goal", text: "What information do you need to find first?" },
  { level: 3, label: "App", text: "Which app might contain the information you need?" },
  { level: 4, label: "Step", text: "Open the relevant app and look for the key details." },
  { level: 5, label: "Action", text: "Tap the item that contains the next piece of information." },
];

const ASSESSMENT_DOMAINS = [
  { id: "initiation", label: "Initiation", evidence: "Time to first action, idle periods, response after prompt." },
  { id: "attention", label: "Sustained attention", evidence: "Maintains engagement without prolonged non-progress pauses." },
  { id: "information", label: "Information extraction", evidence: "Finds correct date, time, location, amount, recipient, or route detail." },
  { id: "sequencing", label: "Sequencing", evidence: "Completes required actions in a logical order." },
  { id: "goal", label: "Working memory / goal maintenance", evidence: "Carries task details across screens and apps." },
  { id: "flexibility", label: "Cognitive flexibility", evidence: "Switches apps or strategy when the task requires it." },
  { id: "errors", label: "Error awareness / correction", evidence: "Detects and corrects wrong entries without direct instruction." },
  { id: "efficiency", label: "Processing efficiency", evidence: "Action intervals, task time, and excessive toggling." },
  { id: "cueing", label: "Cueing required", evidence: "Specific therapist prompts needed after independent-first attempt." },
];

const PATIENT_THEME_PALETTE = [
  { tile: "#e7f1ff", page: "#f3f8ff", accent: "#4f83c2", ink: "#214f82" },
  { tile: "#f0eaff", page: "#f8f5ff", accent: "#8068b2", ink: "#543f82" },
  { tile: "#e4f6ee", page: "#f2fbf7", accent: "#4c9877", ink: "#28674e" },
  { tile: "#fff0df", page: "#fff8f0", accent: "#c78345", ink: "#805022" },
  { tile: "#fbe8ef", page: "#fff5f8", accent: "#b96786", ink: "#7d3f59" },
  { tile: "#edf3df", page: "#f7faef", accent: "#78934f", ink: "#4f682e" },
];

function statusFrom(ok, mixed = false) {
  if (ok) return "Tracked";
  return mixed ? "Emerging" : "Insufficient evidence";
}

const REQUIRED_APPOINTMENTS = formalThreads.flatMap((thread) => thread.messages).map((message) => message.appointment).filter(Boolean);
const REQUIRED_APPOINTMENT_COUNT = REQUIRED_APPOINTMENTS.length;
const DOCTOR_APPOINTMENT_TARGET = getDoctorAppointmentTarget();

function formatDuration(ms) {
  if (typeof ms !== "number" || ms < 0) return "-";
  const totalSeconds = Math.floor(ms / 1000);
  return `${Math.floor(totalSeconds / 60)}m ${String(totalSeconds % 60).padStart(2, "0")}s`;
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString() : "-";
}

function formatScore(score) {
  return score === null || score === undefined ? "Not scored" : `${score} - ${SCORE_LABELS[score]}`;
}

function getSessionAccounts(state) {
  const accountsById = new Map((state.session.userAccounts || []).map((account) => [account.id, account]));
  (state.session.participants || []).forEach((participant) => {
    if (!participant?.accountId || accountsById.has(participant.accountId)) {
      return;
    }
    accountsById.set(participant.accountId, {
      id: participant.accountId,
      alias: participant.alias || participant.label || `Device ${accountsById.size + 1}`,
      pin: "",
      fromLiveParticipant: true,
    });
  });
  return [...accountsById.values()];
}

function formatClockTime(minutes) {
  if (typeof minutes !== "number") return "-";
  const h24 = Math.floor(minutes / 60);
  const mm = String(minutes % 60).padStart(2, "0");
  const suffix = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 || 12;
  return `${h12}:${mm} ${suffix}`;
}

function formatCalendarDate(event) {
  if (!event) return "-";
  return new Date(event.year, event.month, event.date).toLocaleDateString("en-US", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

function fmtTime(minutes) {
  const h = String(Math.floor((minutes ?? 0) / 60)).padStart(2, "0");
  const m = String((minutes ?? 0) % 60).padStart(2, "0");
  return `${h}:${m}`;
}

function text(value) {
  return String(value || "").toLowerCase();
}

function titleHasAny(event, keywords) {
  const title = text(event.title);
  return keywords.some((keyword) => title.includes(keyword));
}

function isExactMatch(event, target) {
  const sameDate = event.date === target.date
    && (event.month ?? target.month) === target.month
    && (event.year ?? target.year) === target.year;
  if (!sameDate) {
    return false;
  }
  return Math.abs((event.start ?? 0) - target.start) <= 30;
}

function hasLocationErrorMatch(event, target) {
  const sameDate = event.date === target.date
    && (event.month ?? target.month) === target.month
    && (event.year ?? target.year) === target.year;
  const sameTime = Math.abs((event.start ?? 0) - target.start) <= 30;
  return (sameDate && !sameTime) || (!sameDate && sameTime);
}

function evaluateFixedAppointment(events, target, keywords) {
  if (!target) {
    return { status: "pending", evidence: "Missing target" };
  }

  const exact = events.find((event) => isExactMatch(event, target));
  if (exact) {
    return {
      status: "ok",
      evidence: `Matched ${exact.date}/${(exact.month ?? target.month) + 1}/${exact.year ?? target.year} ${fmtTime(exact.start)}`,
    };
  }

  const related = events.filter((event) => titleHasAny(event, keywords));
  if (related.length > 0) {
    const sample = related[0];
    return {
      status: "error",
      evidence: `Found related entry (${sample.title}) at ${sample.date}/${(sample.month ?? target.month) + 1}/${sample.year ?? target.year} ${fmtTime(sample.start)} but date/time mismatch`,
    };
  }

  return {
    status: "pending",
    evidence: `Expected ${target.date}/${target.month + 1}/${target.year} ${fmtTime(target.start)}`,
  };
}

function evaluateFriendTask(events, keywords, isValidFn, expectation) {
  const related = events.filter((event) => !event.rigid && titleHasAny(event, keywords));
  if (related.length === 0) {
    return { status: "pending", evidence: expectation };
  }

  const valid = related.find(isValidFn);
  if (valid) {
    return {
      status: "ok",
      evidence: `Matched ${valid.title} at ${valid.date}/${(valid.month ?? new Date().getMonth()) + 1}/${valid.year ?? new Date().getFullYear()} ${fmtTime(valid.start)}`,
    };
  }

  const sample = related[0];
  return {
    status: "error",
    evidence: `Found ${sample.title} at ${fmtTime(sample.start)} but does not meet timing rule`,
  };
}

function buildAccuracyMetrics(events, targets) {
  let accuracyScore = 0;
  let locationErrors = 0;
  let omissionErrors = 0;

  targets.forEach((target) => {
    const exact = events.some((event) => isExactMatch(event, target));
    if (exact) {
      accuracyScore += 1;
      return;
    }

    const location = events.some((event) => hasLocationErrorMatch(event, target));
    if (location) {
      locationErrors += 1;
      return;
    }

    omissionErrors += 1;
  });

  const incompleteErrors = events.filter((event) => {
    const missingName = !String(event.title || "").trim() || text(event.title) === "untitled";
    const missingDuration = typeof event.end !== "number" || typeof event.start !== "number" || event.end <= event.start;
    return missingName || missingDuration;
  }).length;

  return {
    totalEntered: events.length,
    accuracyScore,
    accuracyTotal: targets.length,
    locationErrors,
    omissionErrors,
    incompleteErrors,
  };
}

function buildCapturedEvaluation(state, helpers) {
  const doctorAppt = helpers.rigidAppointments.find((appointment) => appointment.id === "sms-doctor-main");
  const polyAppt = helpers.rigidAppointments.find((appointment) => appointment.id === "sms-polyclinic-main");
  const jiaReplyCount = state.metrics.whatsappReplies["jia-wei"] ?? 0;
  const nadiahReplyCount = state.metrics.whatsappReplies.nadiah ?? 0;
  const doctorEval = evaluateFixedAppointment(state.events, doctorAppt, ["doctor", "psy", "psychiatry", "clinic b"]);
  const polyEval = evaluateFixedAppointment(state.events, polyAppt, ["poly", "polyclinic"]);
  const jiaEventEval = evaluateFriendTask(
    state.events,
    ["jia", "wei"],
    (event) => (event.start ?? 0) >= 15 * 60,
    "Expected: Jia Wei meeting entered with afternoon timing (>=15:00)"
  );
  const nadiahEventEval = evaluateFriendTask(
    state.events,
    ["nadiah"],
    (event) => (event.start ?? 0) >= 15 * 60,
    "Expected: Nadiah meeting entered after 15:00"
  );
  const familyDinnerEval = evaluateFriendTask(
    state.events,
    ["family", "dinner"],
    (event) => (event.start ?? 0) >= 18 * 60 + 30,
    "Expected: Family dinner entered in evening (>=18:30)"
  );
  const targets = helpers.rigidAppointments.filter((appointment) => (
    appointment.id === "sms-doctor-main" || appointment.id === "sms-polyclinic-main"
  ));

  return {
    checks: [
      { task: "Calendar: Psychiatry appointment entered", status: doctorEval.status, evidence: doctorEval.evidence },
      { task: "Calendar: Polyclinic appointment entered", status: polyEval.status, evidence: polyEval.evidence },
      { task: "WhatsApp: Replied to Jia Wei", status: jiaReplyCount > 0 ? "ok" : "pending", evidence: `Replies: ${jiaReplyCount}` },
      { task: "WhatsApp: Replied to Nadiah", status: nadiahReplyCount > 0 ? "ok" : "pending", evidence: `Replies: ${nadiahReplyCount}` },
      {
        task: "WhatsApp: Contact confirmed meeting with Jia Wei",
        status: state.metrics.whatsappFriendConfirmed["jia-wei"] ? "ok" : "pending",
        evidence: state.metrics.whatsappFriendConfirmed["jia-wei"] ? "Detected contact acknowledgement" : "Not detected",
      },
      { task: "Calendar: Friend appointment from Jia Wei chat entered", status: jiaEventEval.status, evidence: jiaEventEval.evidence },
      { task: "Calendar: Friend appointment from Nadiah chat entered", status: nadiahEventEval.status, evidence: nadiahEventEval.evidence },
      { task: "Calendar: Family dinner appointment entered", status: familyDinnerEval.status, evidence: familyDinnerEval.evidence },
    ],
    accuracy: buildAccuracyMetrics(state.events, targets),
  };
}

function getCalendarEvidence(state, accountId = null) {
  const userEvents = state.events.filter((event) => event.source === "Calendar" && eventBelongsToAccount(event, accountId));
  const scheduledFromMessages = accountId
    ? REQUIRED_APPOINTMENTS.filter((appointment) => userEvents.some((event) => isExactMatch(event, appointment))).length
    : Math.max(0, REQUIRED_APPOINTMENT_COUNT - state.metrics.omissionErrors);
  return {
    createdCount: userEvents.length,
    latest: userEvents.at(-1) || null,
    scheduledFromMessages,
    remainingRequired: Math.max(0, REQUIRED_APPOINTMENT_COUNT - scheduledFromMessages),
    ruleBreaks: userEvents.filter((event, index) => userEvents.some((other, otherIndex) => otherIndex !== index && event.date === other.date && event.start < other.end && other.start < event.end)).length,
  };
}

function getWhatsAppEvidence(state, accountId = null) {
  const logs = getAccountLogs(state, accountId);
  const repliesByThread = logs
    .filter((entry) => entry.kind === "wa_reply")
    .reduce((acc, entry) => {
      const threadId = entry.threadId || "unknown";
      acc[threadId] = (acc[threadId] || 0) + 1;
      return acc;
    }, {});
  const userConfirmed = logs
    .filter((entry) => entry.kind === "wa_confirm")
    .reduce((acc, entry) => ({ ...acc, [entry.threadId || "unknown"]: true }), {});
  const friendConfirmed = logs
    .filter((entry) => entry.kind === "wa_friend_confirm")
    .reduce((acc, entry) => ({ ...acc, [entry.threadId || "unknown"]: true }), {});
  const repliedThreads = Object.entries(repliesByThread)
    .filter(([, count]) => count > 0)
    .map(([threadId, count]) => ({
      threadId,
      count,
      sender: whatsappThreads.find((thread) => thread.id === threadId)?.sender || threadId,
      userConfirmed: Boolean(userConfirmed[threadId]),
      friendConfirmed: Boolean(friendConfirmed[threadId]),
    }));

  return {
    totalReplies: Object.values(repliesByThread).reduce((sum, count) => sum + count, 0),
    confirmedCount: Object.values(userConfirmed).filter(Boolean).length,
    friendConfirmedCount: Object.values(friendConfirmed).filter(Boolean).length,
    repliedThreads,
  };
}

function describeLogEntry(entry) {
  const labels = {
    open_app: `Opened ${entry.app}`,
    go_home: "Pressed Home",
    go_back: `Pressed Back to ${entry.to}`,
    toggle_tabs: "Opened Recent apps",
    add_event: "Added Calendar event",
    update_event: "Updated Calendar event",
    wa_reply: `Replied in WhatsApp: ${whatsappThreads.find((thread) => thread.id === entry.threadId)?.sender || entry.threadId}`,
    wa_confirm: `Confirmed WhatsApp plan: ${whatsappThreads.find((thread) => thread.id === entry.threadId)?.sender || entry.threadId}`,
    wa_friend_confirm: `Received WhatsApp confirmation: ${whatsappThreads.find((thread) => thread.id === entry.threadId)?.sender || entry.threadId}`,
    click: `Clicked ${entry.target || "screen"}`,
    input_focus: `Focused ${entry.target || "input"}`,
    typing_latency: `Started typing after ${formatDuration(entry.valueMs)}`,
    admin_cue: `Cue given: ${entry.text}`,
    orientation_control: `Tried phone control: ${entry.target}`,
    practice_step: `Completed task step: ${entry.stepId}`,
    practice_prompt: `Used help level ${entry.level}${entry.text ? `: ${entry.text}` : ""}`,
    practice_wrong_step: "Made a non-matching task action and continued",
    practice_answer: `Checked task information${entry.correct ? " correctly" : " and reviewed it again"}`,
    assessment_started_by_user: "Started independent assessment",
    assessment_step: `Completed observed assessment step: ${entry.stepId}`,
    assessment_prompt: `Clinician prompt level ${entry.level}: ${entry.text}`,
    assessment_complete: "Submitted assessment",
    start_local_mode: "Started local practice session",
    return_to_main_page: "Returned to the main page",
  };
  return labels[entry.kind] || entry.kind || "Activity";
}

function MiniInterfacePreview({ app, mode, selected }) {
  const current = app || "instructions";
  return (
    <div className={`mini-phone-preview ${current} ${selected ? "selected" : ""}`}>
      <div className="mini-status"><span>16:54</span><span>5G 61</span></div>
      <span className={`mini-mode-pill ${mode || "practice"}`}>{mode || "practice"}</span>
      {current === "home" ? <div className="mini-home-grid">{Array.from({ length: 6 }).map((_, i) => <span key={i} />)}</div> : null}
      {current === "sms" ? <><strong>Messages</strong><p>Doctor appointment</p><p>Polyclinic</p><p>Bank alert</p></> : null}
      {current === "whatsapp" ? <><strong>WhatsApp</strong><p>Jia Wei</p><p>Nadiah</p><span className="mini-bubble">Can meet?</span></> : null}
      {current === "calendar" ? <><strong>Calendar</strong><div className="mini-calendar-grid">{Array.from({ length: 21 }).map((_, i) => <span key={i} className={i === 8 ? "marked" : ""} />)}</div></> : null}
      {current === "maps" ? <><strong>Maps</strong><div className="mini-route" /><span className="mini-pin one" /><span className="mini-pin two" /></> : null}
      {current === "bank" ? <><strong>Practice Bank</strong><p>Total balance</p><span className="mini-warning">Scam check</span></> : null}
      {current === "singpass" ? <><strong>Singpass</strong><p>Digital IC</p><p>Approval request</p><span className="mini-warning">Review details</span></> : null}
      {current === "instructions" || current === "settings" ? <><strong>{current === "settings" ? "Settings" : "Instructions"}</strong><p>Waiting for task</p></> : null}
      <div className="mini-nav" />
    </div>
  );
}

function LiveDeviceEvidence({ state, accountId }) {
  if (!accountId) {
    return null;
  }
  const hasAnyEvidence = state.hiddenLog.some((entry) => entry.accountId === accountId)
    || state.events.some((event) => event.accountId === accountId);
  if (!hasAnyEvidence) {
    return <div className="device-evidence muted">Awaiting live activity sync</div>;
  }
  const calendar = getCalendarEvidence(state, accountId);
  const whatsapp = getWhatsAppEvidence(state, accountId);
  return (
    <div className="device-evidence">
      <span>Calendar input <strong>{calendar.createdCount}</strong></span>
      <span>WhatsApp replies <strong>{whatsapp.totalReplies}</strong></span>
      <span>Confirmed plans <strong>{whatsapp.confirmedCount}</strong></span>
    </div>
  );
}

export function AdminPanel() {
  const {
    state,
    helpers,
    openApp,
    createSession,
    setUserMode,
    setLearnModule,
    pushScenario,
    pushAssessment,
    pushAssessmentPrompt,
    pushCustomStimulus,
    removeCustomStimulus,
    trackAssessmentStuck,
    setPracticeSupport,
    scoreChecklistItem,
    updateAdminNotes,
    addUserAccount,
    removeUserAccount,
    logCue,
    markEvaluationCompleted,
  } = useVirtualOS();

  const [activeTab, setActiveTab] = useState("current");
  const [sessionView, setSessionView] = useState("waiting");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [selectedAccountIds, setSelectedAccountIds] = useState([]);
  const [pendingMode, setPendingMode] = useState(state.session.mode || "practice");
  const [targetUserId, setTargetUserId] = useState("all");
  const [learnAppId, setLearnAppId] = useState(LEARN_APP_CATALOG[0].id);
  const [scenarioId, setScenarioId] = useState(SCENARIO_LIBRARY[0]?.id || "");
  const [assessmentScenarioId, setAssessmentScenarioId] = useState(SCENARIO_LIBRARY.find((scenario) => scenario.complexity === "Multi-app")?.id || SCENARIO_LIBRARY[0]?.id || "");
  const [freeStimulusApp, setFreeStimulusApp] = useState("whatsapp");
  const [freeStimulusTitle, setFreeStimulusTitle] = useState("Jia Wei");
  const [freeStimulusMessage, setFreeStimulusMessage] = useState("Can we meet later today?");
  const [freeStimulusEncouragement, setFreeStimulusEncouragement] = useState("Open the message and respond naturally.");
  const [newAlias, setNewAlias] = useState("");
  const [newPin, setNewPin] = useState("");
  const [modeConfirmText, setModeConfirmText] = useState("");

  const joinedPatients = state.session.participants.filter((p) => p.role === "patient");
  const sessionAccounts = getSessionAccounts(state);
  const selectedAccount = sessionAccounts.find((account) => account.id === selectedAccountId);
  const selectedParticipant = state.session.participants.find((participant) => participant.accountId === selectedAccountId);
  const fallbackParticipant = joinedPatients.length === 1 ? joinedPatients[0] : null;
  const fallbackAccount = fallbackParticipant
    ? sessionAccounts.find((account) => account.id === fallbackParticipant.accountId)
    : null;
  const modeTargetAccount = selectedAccount || fallbackAccount;
  const modeTargetParticipant = selectedParticipant || fallbackParticipant;
  const selectedAssignmentAccounts = selectedAccountIds
    .map((accountId) => sessionAccounts.find((account) => account.id === accountId))
    .filter((account) => account && joinedPatients.some((participant) => participant.accountId === account.id));
  const currentMode = modeTargetAccount
    ? modeTargetParticipant?.mode || state.session.userModes[modeTargetAccount.id] || state.session.mode
    : state.session.mode;
  const settingsMode = pendingMode;
  const metrics = state.interactionMetrics;
  const selectedChecklistScores = getChecklistScoresForAccount(state, selectedAccount?.id || fallbackAccount?.id);
  const scoredItems = Object.values(selectedChecklistScores).filter((score) => score !== null).length;
  const averageTypingLatency = metrics.typingLatencySamples > 0 ? metrics.typingLatencyTotalMs / metrics.typingLatencySamples : null;
  const assessmentAccount = selectedAccount || fallbackAccount;
  const assessmentAccountId = assessmentAccount?.id;
  const assessmentMetrics = assessmentAccountId ? state.assessmentMetrics?.byAccount?.[assessmentAccountId] : null;
  const assessmentIdleMs = assessmentMetrics?.lastActionAt ? Date.now() - assessmentMetrics.lastActionAt : null;

  useEffect(() => {
    if (!selectedAccountId && fallbackAccount) {
      setSelectedAccountId(fallbackAccount.id);
      setSelectedAccountIds([fallbackAccount.id]);
      setTargetUserId(fallbackAccount.id);
      setPendingMode(state.session.userModes[fallbackAccount.id] || fallbackParticipant?.mode || state.session.mode);
    }
  }, [fallbackAccount, fallbackParticipant?.mode, selectedAccountId, state.session.mode, state.session.userModes]);

  function submitAccount(event) {
    event.preventDefault();
    addUserAccount({ alias: newAlias, pin: newPin.length === 4 ? newPin : undefined });
    setNewAlias("");
    setNewPin("");
  }

  function selectAccount(accountId) {
    setSelectedAccountId(accountId);
    setTargetUserId(accountId);
    setPendingMode(state.session.userModes[accountId] || state.session.mode);
    setModeConfirmText("");
  }

  function toggleAssignmentAccount(accountId) {
    const alreadySelected = selectedAccountIds.includes(accountId);
    const nextSelectedIds = alreadySelected
      ? selectedAccountIds.filter((id) => id !== accountId)
      : [...selectedAccountIds, accountId];
    setSelectedAccountIds(nextSelectedIds);
    const nextFocusedId = alreadySelected
      ? (selectedAccountId === accountId ? nextSelectedIds[0] || "" : selectedAccountId)
      : accountId;
    setSelectedAccountId(nextFocusedId);
    setTargetUserId(nextSelectedIds.length === joinedPatients.length ? "all" : nextFocusedId || "all");
    if (nextFocusedId) {
      setPendingMode(state.session.userModes[nextFocusedId] || state.session.mode);
    }
    setModeConfirmText("");
  }

  function removeConnectedPatient(account) {
    const label = formatAlias(account.alias);
    if (!window.confirm(`Remove ${label} from Connected patients? This also deletes this de-identified profile and its saved progress records.`)) {
      return;
    }
    removeUserAccount(account.id);
    setSelectedAccountIds((accountIds) => accountIds.filter((id) => id !== account.id));
    if (selectedAccountId === account.id) {
      setSelectedAccountId("");
      setTargetUserId("all");
      setSessionView("waiting");
      setModeConfirmText("");
    }
  }

  function confirmEndSession() {
    if (window.confirm("End this session for all joined users? They will have 30 seconds before the rating overlay appears.")) {
      markEvaluationCompleted();
    }
  }

  function createNewSessionPin() {
    if (joinedPatients.length > 0 && !window.confirm("Create a new session PIN? Joined patients will need to reconnect using the new PIN.")) {
      return;
    }
    createSession();
    setSelectedAccountId("");
    setSelectedAccountIds([]);
    setTargetUserId("all");
    setSessionView("waiting");
  }

  function getAssignmentTargetIds() {
    const connectedIds = new Set(joinedPatients.map((participant) => participant.accountId));
    const selectedIds = selectedAccountIds.filter((accountId) => connectedIds.has(accountId));
    if (selectedIds.length > 0) return selectedIds;
    return modeTargetAccount && connectedIds.has(modeTargetAccount.id) ? [modeTargetAccount.id] : [];
  }

  function pushPracticeScenario(targetIds = getAssignmentTargetIds()) {
    if (!scenarioId || targetIds.length === 0) return;
    targetIds.forEach((accountId) => pushScenario(scenarioId, accountId));
    openApp("home");
  }

  function pushAssessmentScenario(targetIds = getAssignmentTargetIds()) {
    if (!assessmentScenarioId || targetIds.length === 0) return;
    targetIds.forEach((accountId) => pushAssessment(assessmentScenarioId, accountId));
    openApp("home");
  }

  function pushFreeStimulus(targetIds = getAssignmentTargetIds()) {
    if (!freeStimulusMessage.trim() || targetIds.length === 0) return;
    targetIds.forEach((accountId) => pushCustomStimulus({
        app: freeStimulusApp,
        targetId: accountId,
        title: freeStimulusTitle,
        message: freeStimulusMessage,
        preview: freeStimulusMessage,
        instructions: freeStimulusEncouragement,
      }));
    openApp(freeStimulusApp === "sms" ? "sms" : "whatsapp");
  }

  useEffect(() => {
    if (!assessmentAccountId || getAccountMode(state, assessmentAccount) !== "assessment" || !assessmentMetrics?.startedAt) {
      return;
    }
    if (assessmentIdleMs !== null && assessmentIdleMs >= 30000 && (!assessmentMetrics.lastStuckAlertAt || Date.now() - assessmentMetrics.lastStuckAlertAt >= 30000)) {
      trackAssessmentStuck(assessmentAccountId, assessmentIdleMs, selectedParticipant?.currentApp || state.currentApp);
    }
  }, [assessmentAccount, assessmentAccountId, assessmentIdleMs, assessmentMetrics?.lastStuckAlertAt, assessmentMetrics?.startedAt, selectedParticipant?.currentApp, state, state.currentMinutes, trackAssessmentStuck]);

  function startLearnModule(targetIds = getAssignmentTargetIds()) {
    const app = LEARN_APP_CATALOG.find((item) => item.id === learnAppId) || LEARN_APP_CATALOG[0];
    if (targetIds.length === 0) {
      return;
    }
    targetIds.filter(Boolean).forEach((accountId) => setLearnModule(accountId, app.currentApp));
    openApp(app.currentApp);
  }

  function confirmModeForSelectedUser() {
    if (!modeTargetAccount) {
      return;
    }
    if (
      pendingMode === "assessment"
      && currentMode !== "assessment"
      && !window.confirm(`Begin independent Assessment for ${formatAlias(modeTargetAccount.alias)}? Step-by-step guidance will be hidden.`)
    ) {
      return;
    }
    setUserMode(modeTargetAccount.id, pendingMode);
    setModeConfirmText(`Sent. ${formatAlias(modeTargetAccount.alias)}'s screen will now change to ${SESSION_MODES.find((mode) => mode.id === pendingMode)?.label || pendingMode}.`);
  }

  function assignActivity() {
    const targetIds = getAssignmentTargetIds();
    const targetAccounts = targetIds
      .map((accountId) => sessionAccounts.find((account) => account.id === accountId))
      .filter(Boolean);
    if (targetAccounts.length === 0) return;
    const assessmentTargets = targetAccounts.filter((account) => getAccountMode(state, account) !== "assessment");
    if (
      pendingMode === "assessment"
      && assessmentTargets.length > 0
      && !window.confirm(`Begin independent Assessment for ${targetAccounts.length === 1 ? formatAlias(targetAccounts[0].alias) : `${targetAccounts.length} selected patients`}? Step-by-step guidance will be hidden.`)
    ) {
      return;
    }
    targetIds.forEach((accountId) => setUserMode(accountId, pendingMode));
    if (pendingMode === "learn") startLearnModule(targetIds);
    if (pendingMode === "practice") pushPracticeScenario(targetIds);
    if (pendingMode === "assessment") pushAssessmentScenario(targetIds);
    if (pendingMode === "free") pushFreeStimulus(targetIds);
    setModeConfirmText(`Assigned to ${targetAccounts.map((account) => formatAlias(account.alias)).join(", ")}.`);
    setSessionView("live");
  }

  if (false) {
    return (
    <section className={`admin-console ${activeTab === "records" ? "records-view" : ""}`}>
      <header className="admin-top-panel">
        <div>
          <span>Session PIN</span>
          <strong>{state.session.pin}</strong>
        </div>
        <nav className="admin-tabs">
          <button type="button" className={activeTab === "current" ? "active" : ""} onClick={() => setActiveTab("current")}>Current Session</button>
          <button type="button" className={activeTab === "records" ? "active" : ""} onClick={() => setActiveTab("records")}>Past Sessions</button>
        </nav>
        <button type="button" className="admin-gear-btn" onClick={() => setSettingsOpen((open) => !open)} aria-label="Settings">⚙</button>
      </header>

      {activeTab === "records" ? null : (
        <section className="admin-live-panel">
          <div className="admin-panel-head">
            <div>
              <h2>Live User Interfaces</h2>
              <p>{state.session.participants.filter((p) => p.role === "patient").length}/{state.session.participantLimit} devices joined</p>
            </div>
            <button type="button" className="admin-secondary" onClick={createSession}>New PIN</button>
          </div>
          <div className="device-grid live-grid">
            {Array.from({ length: state.session.participantLimit }).map((_, index) => {
              const device = joinedPatients[index];
              const account = device ? sessionAccounts.find((item) => item.id === device.accountId) : null;
              const isSelected = Boolean(account && account.id === selectedAccountId);
              return (
                <button
                  key={device?.accountId || `empty-${index}`}
                  type="button"
                  className={`device-card ${device ? "online" : ""} ${isSelected ? "selected" : ""}`}
                  onClick={() => account && selectAccount(account.id)}
                  disabled={!account}
                >
                  <div className="device-card-head">
                    <span className="device-slot">Device {index + 1}</span>
                    <strong>{account ? formatAlias(account.alias) : "Waiting"}</strong>
                    {account ? <em className="device-participant-code">{getParticipantCode(account)}</em> : null}
                  </div>
                  <MiniInterfacePreview app={device?.currentApp} mode={device?.mode} selected={isSelected} />
                  <LiveDeviceEvidence state={state} accountId={account?.id} />
                  <p>{device ? `Current app: ${device.currentApp || "instructions"}` : "No user joined"}</p>
                  <p>{device?.mode === "learn" ? "Learn module active" : "No active learn module"}</p>
                  <em>{device ? `Last seen: ${formatDate(device.lastSeenAt)}` : "Available"}</em>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <aside className="admin-control-panel">
        {settingsOpen ? (
          <AccountSettings
            state={state}
            sessionAccounts={sessionAccounts}
            newAlias={newAlias}
            newPin={newPin}
            setNewAlias={setNewAlias}
            setNewPin={setNewPin}
            submitAccount={submitAccount}
            removeUserAccount={removeUserAccount}
          />
        ) : activeTab === "records" ? (
          <PastRecords records={state.session.records} />
        ) : (
          <>
            <section className="selected-user-sticky" aria-live="polite">
              {modeTargetAccount ? (
                <>
                  <div>
                    <span>Selected user</span>
                    <strong>{formatAlias(modeTargetAccount.alias)}</strong>
                    <em>{getParticipantCode(modeTargetAccount)}</em>
                  </div>
                  <div>
                    <span>Current mode</span>
                    <strong>{modeTargetParticipant?.mode || state.session.userModes[modeTargetAccount.id] || state.session.mode}</strong>
                    <em>{modeTargetParticipant?.currentApp ? `In ${modeTargetParticipant.currentApp}` : "Waiting for activity"}</em>
                  </div>
                </>
              ) : (
                <p>Select a joined user to configure, run, or observe a session.</p>
              )}
            </section>

            <nav className="session-workflow-tabs" aria-label="Current session workflow">
              <button type="button" className={sessionView === "run" ? "active" : ""} onClick={() => setSessionView("run")}>Run session</button>
              <button type="button" className={sessionView === "configure" ? "active" : ""} onClick={() => setSessionView("configure")}>Configure</button>
              <button type="button" className={sessionView === "observe" ? "active" : ""} onClick={() => setSessionView("observe")}>Observe</button>
            </nav>

            {sessionView === "configure" ? (
              <>
                <section className="admin-section selected-user-control">
                  <h3>Choose mode</h3>
                  <p className="admin-muted">
                    Currently on <strong>{SESSION_MODES.find((mode) => mode.id === currentMode)?.label || currentMode}</strong>. Choose a new mode, then press the send button below.
                  </p>
                  <div className="mode-control large">
                    {SESSION_MODES.map((mode) => (
                      <button
                        key={mode.id}
                        type="button"
                        className={pendingMode === mode.id ? "active" : ""}
                        onClick={() => {
                          setPendingMode(mode.id);
                          setModeConfirmText("");
                        }}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                  <ModeInterface mode={pendingMode} />
                  <button
                    type="button"
                    className="admin-primary enter-mode-btn"
                    disabled={!modeTargetAccount}
                    onClick={confirmModeForSelectedUser}
                  >
                    {modeTargetAccount
                      ? `Send ${SESSION_MODES.find((mode) => mode.id === pendingMode)?.label || pendingMode} to ${formatAlias(modeTargetAccount.alias)}`
                      : "Select a user first"}
                  </button>
                  {modeConfirmText ? <p className="mode-confirm-text">{modeConfirmText}</p> : null}
                </section>

                <ModeAwareSettingsPanel
                  mode={settingsMode}
                  learnAppId={learnAppId}
                  setLearnAppId={setLearnAppId}
                  scenarioId={scenarioId}
                  setScenarioId={setScenarioId}
                  targetUserId={targetUserId}
                  setTargetUserId={setTargetUserId}
                  userAccounts={sessionAccounts}
                  startLearnModule={startLearnModule}
                  pushPracticeScenario={pushPracticeScenario}
                  assessmentScenarioId={assessmentScenarioId}
                  setAssessmentScenarioId={setAssessmentScenarioId}
                  pushAssessmentScenario={pushAssessmentScenario}
                  freeStimulusApp={freeStimulusApp}
                  setFreeStimulusApp={setFreeStimulusApp}
                  freeStimulusTitle={freeStimulusTitle}
                  setFreeStimulusTitle={setFreeStimulusTitle}
                  freeStimulusMessage={freeStimulusMessage}
                  setFreeStimulusMessage={setFreeStimulusMessage}
                  freeStimulusEncouragement={freeStimulusEncouragement}
                  setFreeStimulusEncouragement={setFreeStimulusEncouragement}
                  pushFreeStimulus={pushFreeStimulus}
                  state={state}
                  removeCustomStimulus={removeCustomStimulus}
                />
              </>
            ) : null}

            {sessionView === "run" ? (
              <>
                <section className="admin-section session-actions-panel">
                  <h3>Run session</h3>
                  <p className="admin-muted">Monitor the current task and use the least assistance required.</p>
                  <button type="button" className="admin-danger" onClick={confirmEndSession} disabled={Boolean(state.session.completedAt)}>
                    {state.session.completedAt ? "Session Ended" : "End Session"}
                  </button>
                </section>
                <EvaluationPanel
                  metrics={metrics}
                  helpers={helpers}
                  averageTypingLatency={averageTypingLatency}
                  state={state}
                  selectedAccount={selectedAccount}
                  scoredItems={scoredItems}
                  scoreChecklistItem={scoreChecklistItem}
                  updateAdminNotes={updateAdminNotes}
                  logCue={logCue}
                  openApp={openApp}
                  setPracticeSupport={setPracticeSupport}
                  pushAssessmentPrompt={pushAssessmentPrompt}
                  removeCustomStimulus={removeCustomStimulus}
                />
              </>
            ) : null}

            {sessionView === "observe" ? (
              <>
                <SessionTimeline state={state} selectedAccount={selectedAccount || fallbackAccount} />
                <LiveActivityEvidence state={state} averageTypingLatency={averageTypingLatency} selectedAccount={selectedAccount || fallbackAccount} />
              </>
            ) : null}
          </>
        )}
      </aside>
    </section>
    );
  }

  return (
    <ClinicianAdminShell
      state={state}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      sessionView={sessionView}
      setSessionView={setSessionView}
      joinedPatients={joinedPatients}
      sessionAccounts={sessionAccounts}
      selectedAccountId={selectedAccountId}
      selectedAccountIds={selectedAccountIds}
      selectAccount={selectAccount}
      toggleAssignmentAccount={toggleAssignmentAccount}
      selectedAssignmentAccounts={selectedAssignmentAccounts}
      modeTargetAccount={modeTargetAccount}
      modeTargetParticipant={modeTargetParticipant}
      currentMode={currentMode}
      pendingMode={pendingMode}
      setPendingMode={setPendingMode}
      createNewSessionPin={createNewSessionPin}
      newAlias={newAlias}
      newPin={newPin}
      setNewAlias={setNewAlias}
      setNewPin={setNewPin}
      submitAccount={submitAccount}
      removeUserAccount={removeUserAccount}
      removeConnectedPatient={removeConnectedPatient}
      learnAppId={learnAppId}
      setLearnAppId={setLearnAppId}
      scenarioId={scenarioId}
      setScenarioId={setScenarioId}
      assessmentScenarioId={assessmentScenarioId}
      setAssessmentScenarioId={setAssessmentScenarioId}
      freeStimulusApp={freeStimulusApp}
      setFreeStimulusApp={setFreeStimulusApp}
      freeStimulusTitle={freeStimulusTitle}
      setFreeStimulusTitle={setFreeStimulusTitle}
      freeStimulusMessage={freeStimulusMessage}
      setFreeStimulusMessage={setFreeStimulusMessage}
      freeStimulusEncouragement={freeStimulusEncouragement}
      setFreeStimulusEncouragement={setFreeStimulusEncouragement}
      assignActivity={assignActivity}
      modeConfirmText={modeConfirmText}
      setPracticeSupport={setPracticeSupport}
      pushAssessmentPrompt={pushAssessmentPrompt}
      removeCustomStimulus={removeCustomStimulus}
      averageTypingLatency={averageTypingLatency}
      updateAdminNotes={updateAdminNotes}
      logCue={logCue}
      checklistScores={selectedChecklistScores}
      scoredItems={scoredItems}
      scoreChecklistItem={scoreChecklistItem}
      confirmEndSession={confirmEndSession}
    />
  );
}

function ClinicianAdminShell({
  state, activeTab, setActiveTab, sessionView, setSessionView, joinedPatients, sessionAccounts,
  selectedAccountId, selectedAccountIds, selectAccount, toggleAssignmentAccount, selectedAssignmentAccounts,
  modeTargetAccount, modeTargetParticipant, currentMode,
  pendingMode, setPendingMode, createNewSessionPin, newAlias, newPin, setNewAlias, setNewPin,
  submitAccount, removeUserAccount, removeConnectedPatient, learnAppId, setLearnAppId, scenarioId, setScenarioId,
  assessmentScenarioId, setAssessmentScenarioId, freeStimulusApp, setFreeStimulusApp,
  freeStimulusTitle, setFreeStimulusTitle, freeStimulusMessage, setFreeStimulusMessage,
  freeStimulusEncouragement, setFreeStimulusEncouragement, assignActivity, modeConfirmText,
  setPracticeSupport, pushAssessmentPrompt, removeCustomStimulus, averageTypingLatency,
  updateAdminNotes, logCue, checklistScores, scoredItems, scoreChecklistItem, confirmEndSession,
}) {
  const connectedAccounts = joinedPatients
    .map((participant) => sessionAccounts.find((account) => account.id === participant.accountId))
    .filter(Boolean)
    .slice(0, state.session.participantLimit);
  const selectedPatientIndex = Math.max(0, connectedAccounts.findIndex((account) => account.id === modeTargetAccount?.id));
  const selectedPatientTheme = PATIENT_THEME_PALETTE[selectedPatientIndex % PATIENT_THEME_PALETTE.length];

  return (
    <section
      className={`admin-console clinician-admin-shell ${modeTargetAccount ? "patient-theme-active" : ""}`}
      style={{
        "--patient-page": selectedPatientTheme.page,
        "--patient-accent": selectedPatientTheme.accent,
        "--patient-ink": selectedPatientTheme.ink,
      }}
    >
      <header className="admin-top-panel clinician-admin-header">
        <div className="admin-brand-block"><span>Daily Digital</span><strong>Clinician workspace</strong></div>
        <nav className="admin-tabs clinician-primary-nav" aria-label="Clinician workspace">
          <button type="button" className={activeTab === "patients" ? "active" : ""} onClick={() => setActiveTab("patients")}>Patients &amp; access</button>
          <button type="button" className={activeTab === "current" ? "active" : ""} onClick={() => setActiveTab("current")}>Current session</button>
          <button type="button" className={activeTab === "records" ? "active" : ""} onClick={() => setActiveTab("records")}>Records</button>
        </nav>
        <div className="session-pin-compact"><span>Session PIN</span><strong>{state.session.pin}</strong></div>
      </header>

      {activeTab === "patients" ? (
        <main className="clinician-page">
          <PageHeading title="Patients & access" description="Create de-identified profiles and help patients join the simulated phone session." />
          <div className="patient-access-grid">
            <section className="admin-section join-instructions-card">
              <span className="section-kicker">Joining instructions</span><h2>Connect to this session</h2>
              <ol><li>Open the patient join page on the patient device.</li><li>Enter session PIN <strong>{state.session.pin}</strong>.</li><li>Select the patient’s de-identified profile and enter their 4-digit PIN.</li></ol>
              <div className="join-session-status"><strong>{joinedPatients.length}</strong><span>of {state.session.participantLimit} patients connected</span></div>
              <button type="button" className="admin-secondary" onClick={createNewSessionPin}>Create new session PIN</button>
            </section>
            <AccountSettings state={state} sessionAccounts={sessionAccounts} newAlias={newAlias} newPin={newPin} setNewAlias={setNewAlias} setNewPin={setNewPin} submitAccount={submitAccount} removeUserAccount={removeUserAccount} />
          </div>
          <PatientRoster state={state} joinedPatients={joinedPatients} sessionAccounts={sessionAccounts} selectedAccountId={selectedAccountId} selectAccount={selectAccount} removeConnectedPatient={removeConnectedPatient} />
        </main>
      ) : null}

      {activeTab === "current" ? (
        <main className="clinician-page current-session-page">
          <PageHeading title="Current session" description={joinedPatients.length ? "Guide the session from patient arrival through documentation." : "Start by helping a patient join this session."} />
          <nav className="session-workflow-tabs clinician-stepper" aria-label="Current session workflow">
            {[["waiting", "1", "Waiting room"], ["setup", "2", "Setup activity"], ["live", "3", "Live observation"], ["finish", "4", "Finish & document"]].map(([id, number, label]) => (
              <button key={id} type="button" className={sessionView === id ? "active" : ""} disabled={id !== "waiting" && !modeTargetAccount} onClick={() => setSessionView(id)}><span>{number}</span>{label}</button>
            ))}
          </nav>

          {sessionView === "waiting" ? (
            <section className="session-stage">
              <StageHeading number="1" title="Waiting room" description="Confirm that the correct patient is connected before assigning an activity." />
              {joinedPatients.length === 0 ? <div className="clinician-empty-state"><strong>No patients connected yet</strong><p>Ask the patient to enter session PIN <b>{state.session.pin}</b> on the join page.</p><button type="button" className="admin-primary" onClick={() => setActiveTab("patients")}>View joining instructions</button></div> : <><PatientRoster state={state} joinedPatients={joinedPatients} sessionAccounts={sessionAccounts} selectedAccountId={selectedAccountId} selectedAccountIds={selectedAccountIds} toggleAccountSelection={toggleAssignmentAccount} selectAccount={selectAccount} removeConnectedPatient={removeConnectedPatient} compact multiSelect /><div className="stage-primary-action"><button type="button" className="admin-primary" disabled={selectedAssignmentAccounts.length === 0} onClick={() => setSessionView("setup")}>{selectedAssignmentAccounts.length === 0 ? "Select at least one patient" : selectedAssignmentAccounts.length === 1 ? `Set up activity for ${formatAlias(selectedAssignmentAccounts[0].alias)}` : `Set up activity for ${selectedAssignmentAccounts.length} patients`}</button></div></>}
            </section>
          ) : null}

          {sessionView !== "waiting" ? <PatientAliasSwitcher accounts={connectedAccounts} participantLimit={state.session.participantLimit} selectedAccountId={modeTargetAccount?.id} selectedAccountIds={selectedAccountIds} selectAccount={selectAccount} toggleAccountSelection={toggleAssignmentAccount} multiSelect={sessionView === "setup"} /> : null}

          {sessionView === "setup" ? <ActivitySetupPanel accounts={selectedAssignmentAccounts} pendingMode={pendingMode} setPendingMode={setPendingMode} learnAppId={learnAppId} setLearnAppId={setLearnAppId} scenarioId={scenarioId} setScenarioId={setScenarioId} assessmentScenarioId={assessmentScenarioId} setAssessmentScenarioId={setAssessmentScenarioId} freeStimulusApp={freeStimulusApp} setFreeStimulusApp={setFreeStimulusApp} freeStimulusTitle={freeStimulusTitle} setFreeStimulusTitle={setFreeStimulusTitle} freeStimulusMessage={freeStimulusMessage} setFreeStimulusMessage={setFreeStimulusMessage} freeStimulusEncouragement={freeStimulusEncouragement} setFreeStimulusEncouragement={setFreeStimulusEncouragement} assignActivity={assignActivity} modeConfirmText={modeConfirmText} /> : null}

          {sessionView === "live" ? (
            <section className="session-stage live-observation-stage">
              <StageHeading number="3" title="Live observation" description="Observe first, then use the least assistance required. Objective events and clinician notes remain separate." action={<button type="button" className="admin-secondary" onClick={() => setSessionView("finish")}>Finish session</button>} />
              {!modeTargetAccount ? <div className="clinician-empty-state"><strong>Select a connected patient first</strong><button type="button" className="admin-primary" onClick={() => setSessionView("waiting")}>Return to waiting room</button></div> : <div className="live-observation-grid"><div className="live-primary-column"><EvaluationPanel state={state} selectedAccount={modeTargetAccount} setPracticeSupport={setPracticeSupport} pushAssessmentPrompt={pushAssessmentPrompt} removeCustomStimulus={removeCustomStimulus} /><ClinicianObservationTools state={state} updateAdminNotes={updateAdminNotes} logCue={logCue} /></div><div className="live-evidence-column"><SessionTimeline state={state} selectedAccount={modeTargetAccount} /><LiveActivityEvidence state={state} averageTypingLatency={averageTypingLatency} selectedAccount={modeTargetAccount} /></div></div>}
            </section>
          ) : null}

          {sessionView === "finish" ? <FinishDocumentationPanel state={state} account={modeTargetAccount} checklistScores={checklistScores} scoredItems={scoredItems} scoreChecklistItem={scoreChecklistItem} updateAdminNotes={updateAdminNotes} confirmEndSession={confirmEndSession} setSessionView={setSessionView} /> : null}
        </main>
      ) : null}

      {activeTab === "records" ? <main className="clinician-page records-page"><PageHeading title="Records" description="Review patient progress, individual attempts, and supporting functional-cognition evidence." /><PastRecords records={state.session.records} /></main> : null}
    </section>
  );
}

function PageHeading({ title, description }) {
  return <header className="clinician-page-heading"><div><h1>{title}</h1><p>{description}</p></div></header>;
}

function StageHeading({ number, title, description, action = null }) {
  return <div className="stage-heading"><div><span>Step {number}</span><h2>{title}</h2><p>{description}</p></div>{action}</div>;
}

function PatientAliasSwitcher({ accounts, participantLimit, selectedAccountId, selectedAccountIds = [], selectAccount, toggleAccountSelection, multiSelect = false }) {
  const slots = Array.from({ length: participantLimit }, (_, index) => accounts[index] || null);
  return (
    <nav className="patient-alias-switcher" aria-label="Switch selected patient">
      {slots.map((account, index) => {
        const theme = PATIENT_THEME_PALETTE[index % PATIENT_THEME_PALETTE.length];
        const selected = account && (multiSelect ? selectedAccountIds.includes(account.id) : account.id === selectedAccountId);
        return (
          <button
            key={account?.id || `empty-patient-${index}`}
            type="button"
            className={selected ? "selected" : ""}
            style={{ "--tile-color": theme.tile, "--tile-accent": theme.accent, "--tile-ink": theme.ink }}
            onClick={() => account && (multiSelect ? toggleAccountSelection(account.id) : selectAccount(account.id))}
            disabled={!account}
            aria-pressed={account ? selected : undefined}
            aria-label={account ? `${account.alias}${selected ? ", selected for assignment" : multiSelect ? ", not selected for assignment" : ""}` : `Patient slot ${index + 1}, waiting for connection`}
          >
            {account?.alias || ""}
          </button>
        );
      })}
    </nav>
  );
}

function PatientRoster({ state, joinedPatients, sessionAccounts, selectedAccountId, selectedAccountIds = [], selectAccount, toggleAccountSelection, removeConnectedPatient, compact = false, multiSelect = false }) {
  return <section className={`admin-section patient-roster ${compact ? "compact" : ""}`}><div className="roster-heading"><div><span className="section-kicker">Connected patients</span><h2>{joinedPatients.length ? `${joinedPatients.length} connected` : "No patients connected"}</h2>{multiSelect ? <p className="admin-muted">Select every patient who should receive the same activity.</p> : null}</div><span className="capacity-label">{joinedPatients.length}/{state.session.participantLimit} places used</span></div>{joinedPatients.length === 0 ? <p className="admin-muted">Connected patients will appear here automatically.</p> : <div className="patient-roster-list">{joinedPatients.map((participant) => { const account = sessionAccounts.find((item) => item.id === participant.accountId); if (!account) return null; const selected = multiSelect ? selectedAccountIds.includes(account.id) : account.id === selectedAccountId; return <article key={account.id} className={selected ? "selected" : ""}><button type="button" className="patient-roster-select" onClick={() => multiSelect ? toggleAccountSelection(account.id) : selectAccount(account.id)} aria-pressed={selected}><span className="patient-avatar">{formatAlias(account.alias).slice(0, 1)}</span><span className="patient-roster-identity"><strong>{formatAlias(account.alias)}</strong><em>{getParticipantCode(account)} · {participant.currentApp ? `In ${participant.currentApp}` : "Waiting"}</em><span className={`connection-status ${participant.mode || "practice"}`}>{participant.mode || "practice"}</span></span><b>{selected ? "Selected" : "Select"}</b></button><button type="button" className="patient-roster-remove" onClick={() => removeConnectedPatient(account)} aria-label={`Remove ${formatAlias(account.alias)} from connected patients`}>Remove</button></article>; })}</div>}</section>;
}

function ActivitySetupPanel({ accounts, pendingMode, setPendingMode, learnAppId, setLearnAppId, scenarioId, setScenarioId, assessmentScenarioId, setAssessmentScenarioId, freeStimulusApp, setFreeStimulusApp, freeStimulusTitle, setFreeStimulusTitle, freeStimulusMessage, setFreeStimulusMessage, freeStimulusEncouragement, setFreeStimulusEncouragement, assignActivity, modeConfirmText }) {
  const selectedLearnApp = LEARN_APP_CATALOG.find((app) => app.id === learnAppId) || LEARN_APP_CATALOG[0];
  const activeScenarioId = pendingMode === "assessment" ? assessmentScenarioId : scenarioId;
  const selectedScenario = SCENARIO_LIBRARY.find((scenario) => scenario.id === activeScenarioId) || SCENARIO_LIBRARY[0];
  const purposeDescriptions = { learn: "Teach with guidance", practice: "Practise with graded help", assessment: "Observe independently", free: "Explore without a structured task" };
  return (
    <section className="session-stage activity-setup-stage">
      <StageHeading number="2" title="Setup activity" description="Choose the clinical purpose and activity, then review one clear assignment before starting." />
      {accounts.length === 0 ? <div className="clinician-empty-state"><strong>Select at least one connected patient before assigning an activity.</strong></div> : (
        <div className="activity-composer">
          <section className="admin-section">
            <span className="section-kicker">1. Clinical purpose</span>
            <div className="mode-control large clinician-mode-control">{SESSION_MODES.map((mode) => <button key={mode.id} type="button" className={pendingMode === mode.id ? "active" : ""} onClick={() => setPendingMode(mode.id)}><strong>{mode.label}</strong><span>{purposeDescriptions[mode.id]}</span></button>)}</div>
            <ModeInterface mode={pendingMode} />
          </section>
          <section className="admin-section activity-choice-card">
            <span className="section-kicker">2. Activity</span>
            {pendingMode === "learn" ? <><label><span>Teaching module</span><select value={learnAppId} onChange={(event) => setLearnAppId(event.target.value)}>{LEARN_APP_CATALOG.map((app) => <option key={app.id} value={app.id}>{app.label}</option>)}</select></label><div className="assignment-preview"><strong>{selectedLearnApp.label}</strong><p>{selectedLearnApp.purpose}</p></div></> : null}
            {pendingMode === "practice" || pendingMode === "assessment" ? <><label><span>Activity</span><select value={activeScenarioId} onChange={(event) => pendingMode === "assessment" ? setAssessmentScenarioId(event.target.value) : setScenarioId(event.target.value)}>{SCENARIO_LIBRARY.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.title}</option>)}</select></label><div className="assignment-preview"><strong>{selectedScenario.title}</strong><span>{selectedScenario.complexity} · {selectedScenario.apps.map((appId) => APP_CATALOG.find((app) => app.id === appId)?.label || appId).join(", ")}</span><p>{selectedScenario.description}</p><em>{selectedScenario.successCriteria.join(" → ")}</em></div></> : null}
            {pendingMode === "free" ? <div className="free-activity-fields"><label><span>App</span><select value={freeStimulusApp} onChange={(event) => setFreeStimulusApp(event.target.value)}><option value="whatsapp">WhatsApp</option><option value="sms">Messages</option></select></label><label><span>Sender or title</span><input value={freeStimulusTitle} onChange={(event) => setFreeStimulusTitle(event.target.value)} /></label><label><span>Message</span><textarea rows={3} value={freeStimulusMessage} onChange={(event) => setFreeStimulusMessage(event.target.value)} /></label><label><span>Patient instruction</span><textarea rows={3} value={freeStimulusEncouragement} onChange={(event) => setFreeStimulusEncouragement(event.target.value)} /></label></div> : null}
          </section>
          <section className="assignment-review-card"><div><span>3. Review assignment</span><strong>{accounts.length === 1 ? formatAlias(accounts[0].alias) : `${accounts.length} selected patients`} will begin {SESSION_MODES.find((mode) => mode.id === pendingMode)?.label || pendingMode}</strong><p className="assignment-target-aliases">{accounts.map((account) => formatAlias(account.alias)).join(", ")}</p><p>{pendingMode === "learn" ? selectedLearnApp.label : pendingMode === "free" ? `${freeStimulusApp === "sms" ? "Messages" : "WhatsApp"}: ${freeStimulusTitle}` : selectedScenario.title}</p></div><button type="button" className="admin-primary" disabled={(pendingMode === "free" && !freeStimulusMessage.trim()) || accounts.length === 0} onClick={assignActivity}>{accounts.length === 1 ? "Start activity" : `Start activity for ${accounts.length}`}</button></section>
          {modeConfirmText ? <p className="mode-confirm-text">{modeConfirmText}</p> : null}
        </div>
      )}
    </section>
  );
}

function ClinicianObservationTools({ state, updateAdminNotes, logCue }) {
  return (
    <section className="admin-section clinician-observation-tools">
      <span className="section-kicker">Clinician observations</span><h3>Notes and cues</h3>
      <p className="admin-muted">Record what you observed. Cue buttons log assistance already given; they do not interrupt the patient’s screen.</p>
      <label><span>Session notes</span><textarea rows={5} value={state.adminNotes} onChange={(event) => updateAdminNotes(event.target.value)} placeholder="Record strategies, errors, awareness, and clinically relevant context…" /></label>
      <div className="cue-button-list">{QUICK_CUES.map((cue) => <button key={cue} type="button" onClick={() => logCue(cue)}>{cue}</button>)}</div>
      {state.cueLog?.length ? <p className="cue-count-summary">{state.cueLog.length} cue{state.cueLog.length === 1 ? "" : "s"} recorded this session.</p> : null}
    </section>
  );
}

function FinishDocumentationPanel({ state, account, checklistScores, scoredItems, scoreChecklistItem, updateAdminNotes, confirmEndSession, setSessionView }) {
  return (
    <section className="session-stage finish-documentation-stage">
      <StageHeading number="4" title="Finish & document" description="Review objective evidence, complete clinician ratings, and save the session record." />
      {!account ? <div className="clinician-empty-state"><strong>Select a patient before completing documentation.</strong><button type="button" className="admin-primary" onClick={() => setSessionView("waiting")}>Choose patient</button></div> : (
        <div className="finish-grid">
          <section className="admin-section"><span className="section-kicker">Clinician ratings</span><h3>Functional task checklist</h3><p className="admin-muted">Rate observed performance using the clinical anchors. These ratings support interpretation and are not diagnostic scores.</p><div className="clinician-checklist">{CHECKLIST_ITEMS.map((item) => <fieldset key={item.id}><legend><strong>{item.label}</strong><span>{item.domain}</span><p>{item.anchor}</p></legend><div>{[0, 1, 2, 3, 4].map((score) => <label key={score} className={checklistScores[item.id] === score ? "selected" : ""}><input type="radio" name={`score-${item.id}`} checked={checklistScores[item.id] === score} onChange={() => scoreChecklistItem(item.id, score, account.id)} /><strong>{score}</strong><span>{SCORE_LABELS[score]}</span></label>)}</div></fieldset>)}</div></section>
          <aside><section className="admin-section finish-summary-card"><span className="section-kicker">Completion</span><h3>{formatAlias(account.alias)}</h3><p><strong>{scoredItems}/{CHECKLIST_ITEMS.length}</strong> checklist items rated</p><p><strong>{state.cueLog?.length || 0}</strong> clinician cues recorded</p><p><strong>{state.session.completedAt ? "Finished" : "In progress"}</strong> session status</p></section><section className="admin-section"><label><span>Final clinical note</span><textarea rows={8} value={state.adminNotes} onChange={(event) => updateAdminNotes(event.target.value)} placeholder="Summarise performance, support required, and relevant context…" /></label></section><button type="button" className="admin-danger finish-session-button" disabled={Boolean(state.session.completedAt)} onClick={confirmEndSession}>{state.session.completedAt ? "Session finished and saved" : "Finish session and save record"}</button><button type="button" className="admin-secondary" onClick={() => setSessionView("live")}>Return to live observation</button></aside>
        </div>
      )}
    </section>
  );
}

function ModeInterface({ mode }) {
  const content = {
    learn: ["Guided interface", "Highlights or cues should point the user to the safest correct option."],
    practice: ["Scenario practice", "Choose and push a Practice scenario below to start one-step guidance with graded assistance."],
    assessment: ["Independent assessment", "No blocking prompts. Observe natural performance and errors against the assigned task."],
    free: ["Unrestricted interface", "The user can press whatever they want without task prompts, gating, or Learn guidance."],
  }[mode] || ["Mode", "Select a mode."];
  return (
    <div className={`mode-interface ${mode}`}>
      <strong>{content[0]}</strong>
      <p>{content[1]}</p>
    </div>
  );
}

function AccountSettings({ state, sessionAccounts, newAlias, newPin, setNewAlias, setNewPin, submitAccount, removeUserAccount }) {
  function confirmRemoveAccount(account) {
    const label = formatAlias(account.alias);
    if (window.confirm(`Delete ${label} and all saved progress records for this profile? This cannot be undone.`)) {
      removeUserAccount(account.id);
    }
  }

  return (
    <section className="admin-section">
      <h3>De-identified patient profiles</h3>
      <div className="account-grid">
        {sessionAccounts.map((account) => (
          <div key={account.id}>
            <span><strong>{formatAlias(account.alias)}</strong><em>{getParticipantCode(account)} · {account.pin ? `PIN ${account.pin}` : account.fromLiveParticipant ? "Joined from another device" : "PIN stored in backend"}</em></span>
            <button type="button" className="account-delete-btn" aria-label={`Delete ${formatAlias(account.alias)} data`} onClick={() => confirmRemoveAccount(account)}>
              <span aria-hidden="true">🗑</span>
            </button>
          </div>
        ))}
      </div>
      <form className="admin-inline-form" onSubmit={submitAccount}>
        <input value={newAlias} onChange={(event) => setNewAlias(event.target.value)} placeholder="Patient alias, e.g. Calm Panda" />
        <input value={newPin} onChange={(event) => setNewPin(event.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="4-digit PIN" inputMode="numeric" />
        <button type="submit">Add profile</button>
      </form>
    </section>
  );
}

function ModeAwareSettingsPanel({
  mode,
  learnAppId,
  setLearnAppId,
  scenarioId,
  setScenarioId,
  targetUserId,
  setTargetUserId,
  userAccounts,
  startLearnModule,
  pushPracticeScenario,
  assessmentScenarioId,
  setAssessmentScenarioId,
  pushAssessmentScenario,
  freeStimulusApp,
  setFreeStimulusApp,
  freeStimulusTitle,
  setFreeStimulusTitle,
  freeStimulusMessage,
  setFreeStimulusMessage,
  freeStimulusEncouragement,
  setFreeStimulusEncouragement,
  pushFreeStimulus,
  state,
  removeCustomStimulus,
}) {
  if (mode === "learn") {
    return (
      <LearnModuleControls
        learnAppId={learnAppId}
        setLearnAppId={setLearnAppId}
        targetUserId={targetUserId}
        setTargetUserId={setTargetUserId}
        userAccounts={userAccounts}
        startLearnModule={startLearnModule}
      />
    );
  }
  if (mode === "practice") {
    return (
      <PracticeScenarioControls
        scenarioId={scenarioId}
        setScenarioId={setScenarioId}
        targetUserId={targetUserId}
        setTargetUserId={setTargetUserId}
        userAccounts={userAccounts}
        pushPracticeScenario={pushPracticeScenario}
      />
    );
  }
  if (mode === "assessment") {
    return (
      <AssessmentScenarioControls
        scenarioId={assessmentScenarioId}
        setScenarioId={setAssessmentScenarioId}
        targetUserId={targetUserId}
        setTargetUserId={setTargetUserId}
        userAccounts={userAccounts}
        pushAssessmentScenario={pushAssessmentScenario}
      />
    );
  }
  return (
    <FreeModeControls
      targetUserId={targetUserId}
      setTargetUserId={setTargetUserId}
      userAccounts={userAccounts}
      freeStimulusApp={freeStimulusApp}
      setFreeStimulusApp={setFreeStimulusApp}
      freeStimulusTitle={freeStimulusTitle}
      setFreeStimulusTitle={setFreeStimulusTitle}
      freeStimulusMessage={freeStimulusMessage}
      setFreeStimulusMessage={setFreeStimulusMessage}
      freeStimulusEncouragement={freeStimulusEncouragement}
      setFreeStimulusEncouragement={setFreeStimulusEncouragement}
      pushFreeStimulus={pushFreeStimulus}
      state={state}
      removeCustomStimulus={removeCustomStimulus}
    />
  );
}

function FreeModeControls({
  targetUserId,
  setTargetUserId,
  userAccounts,
  freeStimulusApp,
  setFreeStimulusApp,
  freeStimulusTitle,
  setFreeStimulusTitle,
  freeStimulusMessage,
  setFreeStimulusMessage,
  freeStimulusEncouragement,
  setFreeStimulusEncouragement,
  pushFreeStimulus,
  state,
  removeCustomStimulus,
}) {
  const freeStimuli = state?.session?.customStimuli || [];
  return (
    <section className="admin-section learn-module-panel free-stimulus-panel">
      <h3>Free Mode Settings</h3>
      <p className="admin-muted">Use Free mode for unstructured exploration. Admin can push a custom SMS or WhatsApp message without Practice checklist, Assessment scoring, or Learn guidance.</p>
      <div className="push-grid free-push-grid">
        <label>
          <span>App</span>
          <select value={freeStimulusApp} onChange={(event) => setFreeStimulusApp(event.target.value)}>
            <option value="whatsapp">WhatsApp</option>
            <option value="sms">SMS</option>
          </select>
        </label>
        <label>
          <span>Target</span>
          <select value={targetUserId} onChange={(event) => setTargetUserId(event.target.value)}>
            <option value="all">All users</option>
            {userAccounts.map((account) => <option key={account.id} value={account.id}>{formatParticipantOption(account)}</option>)}
          </select>
        </label>
        <label>
          <span>Sender / title</span>
          <input value={freeStimulusTitle} onChange={(event) => setFreeStimulusTitle(event.target.value)} placeholder="e.g. Jia Wei, Doctor, Bank" />
        </label>
      </div>
      <label className="free-message-field">
        <span>Message</span>
        <textarea value={freeStimulusMessage} onChange={(event) => setFreeStimulusMessage(event.target.value)} rows={3} placeholder="Type the custom message that should appear." />
      </label>
      <label className="free-message-field">
        <span>Task card instructions</span>
        <textarea value={freeStimulusEncouragement} onChange={(event) => setFreeStimulusEncouragement(event.target.value)} rows={3} placeholder="Instructions shown beside the phone in Free mode" />
      </label>
      <button type="button" className="admin-primary" onClick={pushFreeStimulus}>Push Custom Message</button>
      <div className="learn-guide-card">
        <strong>Free mode behaviour</strong>
        <span>No checklist, Learn highlight, or Assessment scoring overlay is shown.</span>
        <p>The pushed item appears as a normal thread inside the selected app and a side task card with your custom instructions.</p>
      </div>
      <div className="free-input-manager">
        <strong>Pushed Inputs</strong>
        {freeStimuli.length === 0 ? (
          <p className="admin-muted">No custom FREE inputs have been pushed yet.</p>
        ) : (
          freeStimuli.map((stimulus) => (
            <div key={stimulus.id} className="free-input-row">
              <span>{stimulus.app === "sms" ? "SMS" : "WhatsApp"}</span>
              <div>
                <strong>{stimulus.title}</strong>
                <p>{stimulus.preview || stimulus.message}</p>
                <em>{targetLabelForStimulus(state, stimulus)} - {formatDate(stimulus.pushedAt)}</em>
              </div>
              <button
                type="button"
                onClick={() => window.confirm(`Remove "${stimulus.title}" from FREE mode?`) && removeCustomStimulus(stimulus.id)}
              >
                Remove
              </button>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function LearnModuleControls({ learnAppId, setLearnAppId, targetUserId, setTargetUserId, userAccounts, startLearnModule }) {
  const selectedApp = LEARN_APP_CATALOG.find((app) => app.id === learnAppId) || LEARN_APP_CATALOG[0];
  return (
    <section className="admin-section learn-module-panel">
      <h3>Learn Mode Settings</h3>
      <p className="admin-muted">Choose an app, then press the send button. Changing the dropdown alone will not change the patient's screen.</p>
      <div className="push-grid">
        <label>
          <span>App</span>
          <select value={learnAppId} onChange={(event) => setLearnAppId(event.target.value)}>
            {LEARN_APP_CATALOG.map((app) => <option key={app.id} value={app.id}>{app.label}</option>)}
          </select>
        </label>
        <label>
          <span>Target</span>
          <select value={targetUserId} onChange={(event) => setTargetUserId(event.target.value)}>
            <option value="all">All users</option>
            {userAccounts.map((account) => <option key={account.id} value={account.id}>{formatParticipantOption(account)}</option>)}
          </select>
        </label>
        <button type="button" className="admin-primary" onClick={startLearnModule}>Send {selectedApp.label} Learn Module</button>
      </div>
      <div className="learn-guide-card">
        <strong>{selectedApp.label} Learn Module</strong>
        <span>{selectedApp.purpose}</span>
        <p>Starts a guided, app-specific Learn module with exact target values and click guidance.</p>
        <em>Use this for first-time teaching before pushing Practice scenarios.</em>
      </div>
    </section>
  );
}

function PracticeScenarioControls({ scenarioId, setScenarioId, targetUserId, setTargetUserId, userAccounts, pushPracticeScenario }) {
  const selectedScenario = SCENARIO_LIBRARY.find((scenario) => scenario.id === scenarioId) || SCENARIO_LIBRARY[0];
  const groupedScenarios = SCENARIO_LIBRARY.reduce((acc, scenario) => {
    if (!acc[scenario.complexity]) acc[scenario.complexity] = [];
    acc[scenario.complexity].push(scenario);
    return acc;
  }, {});
  return (
    <section className="admin-section learn-module-panel">
      <h3>Practice Scenario Push</h3>
      <p className="admin-muted">Choose a task, then press the send button to change the patient's task card.</p>
      <div className="push-grid">
        <label>
          <span>Scenario</span>
          <select value={scenarioId} onChange={(event) => setScenarioId(event.target.value)}>
            {Object.entries(groupedScenarios).map(([group, scenarios]) => (
              <optgroup key={group} label={group}>
                {scenarios.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.title}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
        <label>
          <span>Target</span>
          <select value={targetUserId} onChange={(event) => setTargetUserId(event.target.value)}>
            <option value="all">All users</option>
            {userAccounts.map((account) => <option key={account.id} value={account.id}>{formatParticipantOption(account)}</option>)}
          </select>
        </label>
        <button type="button" className="admin-primary" onClick={pushPracticeScenario}>Send Practice Task</button>
      </div>
      <div className="learn-guide-card">
        <strong>{selectedScenario.title}</strong>
        <span>{selectedScenario.complexity} | {selectedScenario.apps.map((appId) => APP_CATALOG.find((app) => app.id === appId)?.label || appId).join(", ")}</span>
        <p>{selectedScenario.description}</p>
        <em>{selectedScenario.successCriteria.join(" -> ")}</em>
      </div>
    </section>
  );
}

function AssessmentScenarioControls({ scenarioId, setScenarioId, targetUserId, setTargetUserId, userAccounts, pushAssessmentScenario }) {
  const selectedScenario = SCENARIO_LIBRARY.find((scenario) => scenario.id === scenarioId) || SCENARIO_LIBRARY[0];
  const groupedScenarios = SCENARIO_LIBRARY.reduce((acc, scenario) => {
    if (!acc[scenario.complexity]) acc[scenario.complexity] = [];
    acc[scenario.complexity].push(scenario);
    return acc;
  }, {});
  return (
    <section className="admin-section learn-module-panel assessment-settings-panel">
      <h3>Assessment Settings</h3>
      <p className="admin-muted">Choose a task, then press the send button. No Learn module or Practice checklist will be shown.</p>
      <div className="push-grid">
        <label>
          <span>Scenario</span>
          <select value={scenarioId} onChange={(event) => setScenarioId(event.target.value)}>
            {Object.entries(groupedScenarios).map(([group, scenarios]) => (
              <optgroup key={group} label={group}>
                {scenarios.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.title}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
        <label>
          <span>Target</span>
          <select value={targetUserId} onChange={(event) => setTargetUserId(event.target.value)}>
            <option value="all">All users</option>
            {userAccounts.map((account) => <option key={account.id} value={account.id}>{formatParticipantOption(account)}</option>)}
          </select>
        </label>
        <button type="button" className="admin-primary" onClick={pushAssessmentScenario}>Send Assessment Task</button>
      </div>
      <div className="learn-guide-card">
        <strong>{selectedScenario.title}</strong>
        <span>{selectedScenario.complexity} | {selectedScenario.apps.map((appId) => APP_CATALOG.find((app) => app.id === appId)?.label || appId).join(", ")}</span>
        <p>{selectedScenario.description}</p>
        <em>Stuck ping triggers after 30s without meaningful action. Therapist prompts are recorded as cueing required.</em>
      </div>
    </section>
  );
}

function pct(correct, total) {
  return total > 0 ? `${Math.round((correct / total) * 100)}%` : "-";
}

function getLearnAppTime(learn, app, activeLearnApps = new Set(), now = Date.now()) {
  const saved = learn.timeByAppMs?.[app] || 0;
  const running = activeLearnApps.has(app) && learn.moduleStarts?.[app]
    ? Math.max(0, now - learn.moduleStarts[app])
    : 0;
  return saved + running;
}

function getLearnTotalTime(learn, activeLearnApps = new Set(), now = Date.now()) {
  return LEARN_APP_CATALOG.reduce((sum, app) => sum + getLearnAppTime(learn, app.currentApp, activeLearnApps, now), 0);
}

function getAccountMode(state, account) {
  if (!account) return state.session.mode;
  const participant = state.session.participants.find((item) => item.accountId === account.id);
  return participant?.mode || state.session.userModes[account.id] || state.session.mode;
}

function getActiveScenarioForAccount(state, accountId) {
  if (!accountId) return null;
  const mode = state.session.userModes?.[accountId]
    || state.session.participants.find((item) => item.accountId === accountId)?.mode
    || state.session.mode;
  const assignment = getCurrentAssignment(state.session, accountId, mode) || getCurrentAssignment(state.session, accountId);
  if (!assignment) return null;
  return SCENARIO_LIBRARY.find((scenario) => scenario.id === assignment.scenarioId) || null;
}

function getScenarioGuideSteps(scenario) {
  if (!scenario) return [];
  const firstApp = scenario.apps?.[0];
  const guide = buildPracticeGuide(scenario, firstApp ? PRACTICE_GUIDES[firstApp] : null, PRACTICE_PAGE_OVERRIDES);
  return flattenGuideSteps(guide);
}

function targetAccountsForStimulus(state, stimulus) {
  if (!stimulus) return [];
  const sessionAccounts = getSessionAccounts(state);
  if (!stimulus.targetId || stimulus.targetId === "all") {
    const joinedIds = new Set(state.session.participants.filter((participant) => participant.role === "patient").map((participant) => participant.accountId));
    return sessionAccounts.filter((account) => joinedIds.has(account.id));
  }
  return sessionAccounts.filter((account) => account.id === stimulus.targetId);
}

function targetLabelForStimulus(state, stimulus) {
  if (!stimulus?.targetId || stimulus.targetId === "all") {
    return "All joined users";
  }
  const account = getSessionAccounts(state).find((item) => item.id === stimulus.targetId);
  return account ? formatAlias(account.alias) : "Removed user";
}

function getFreeMonitorRows(state, selectedAccount = null) {
  const logs = state.hiddenLog || [];
  return (state.session.customStimuli || [])
    .filter((stimulus) => !selectedAccount || !stimulus.targetId || stimulus.targetId === "all" || stimulus.targetId === selectedAccount.id)
    .map((stimulus) => {
      const targets = selectedAccount ? [selectedAccount] : targetAccountsForStimulus(state, stimulus);
      const targetIds = targets.map((account) => account.id);
      const relevantLogs = logs.filter((entry) => (
        (!targetIds.length || targetIds.includes(entry.accountId))
        && (!stimulus.pushedAt || entry.at >= stimulus.pushedAt)
      ));
      const readCount = targets.filter((account) => logs.some((entry) => entry.kind === "stimulus_read" && entry.stimulusId === stimulus.id && entry.accountId === account.id)).length;
      const appOpenCount = targets.filter((account) => relevantLogs.some((entry) => entry.kind === "open_app" && entry.app === stimulus.app && entry.accountId === account.id)).length;
      const replyCount = stimulus.app === "whatsapp"
        ? relevantLogs.filter((entry) => entry.kind === "wa_reply" && entry.threadId === stimulus.threadId).length
        : 0;
      const lastAction = relevantLogs.at(-1);
      return {
        stimulus,
        targets,
        readCount,
        appOpenCount,
        replyCount,
        lastAction,
      };
    });
}

function FreeMonitoringPanel({ state, selectedAccount, removeCustomStimulus }) {
  const rows = getFreeMonitorRows(state, selectedAccount);
  return (
    <section className="admin-section practice-control-panel free-monitor-panel">
      <h3>Free Mode Monitoring</h3>
      <p className="admin-muted">
        {selectedAccount
          ? `Monitoring custom FREE inputs for ${formatAlias(selectedAccount.alias)}.`
          : "Select a live user to filter monitoring, or review all pushed FREE inputs below."}
      </p>
      {rows.length === 0 ? (
        <div className="practice-admin-block">
          <p className="admin-muted">No active custom FREE input for this view.</p>
        </div>
      ) : (
        <div className="free-monitor-list">
          {rows.map(({ stimulus, targets, readCount, appOpenCount, replyCount, lastAction }) => (
            <article key={stimulus.id} className="free-monitor-card">
              <header>
                <span>{stimulus.app === "sms" ? "SMS" : "WhatsApp"}</span>
                <button
                  type="button"
                  onClick={() => window.confirm(`Remove "${stimulus.title}" from FREE mode?`) && removeCustomStimulus(stimulus.id)}
                >
                  Remove
                </button>
              </header>
              <strong>{stimulus.title}</strong>
              <p>{stimulus.preview || stimulus.message}</p>
              {stimulus.instructions ? <em>{stimulus.instructions}</em> : null}
              <div className="free-monitor-stats">
                <div><span>Target</span><strong>{selectedAccount ? formatAlias(selectedAccount.alias) : targetLabelForStimulus(state, stimulus)}</strong></div>
                <div><span>Read</span><strong>{readCount}/{Math.max(1, targets.length)}</strong></div>
                <div><span>Opened app</span><strong>{appOpenCount}/{Math.max(1, targets.length)}</strong></div>
                <div><span>Replies</span><strong>{stimulus.app === "whatsapp" ? replyCount : "N/A"}</strong></div>
              </div>
              <footer>
                <span>Sent {formatDate(stimulus.pushedAt)}</span>
                <span>Last action: {lastAction ? `${lastAction.kind} at ${formatDate(lastAction.at)}` : "None yet"}</span>
              </footer>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function EvaluationPanel({ state, selectedAccount, setPracticeSupport, pushAssessmentPrompt, removeCustomStimulus }) {
  const selectedMode = getAccountMode(state, selectedAccount);
  if (selectedMode === "practice") {
    return <PracticeControlPanel state={state} selectedAccount={selectedAccount} setPracticeSupport={setPracticeSupport} />;
  }
  if (selectedMode === "assessment") {
    return <AssessmentControlPanel state={state} selectedAccount={selectedAccount} pushAssessmentPrompt={pushAssessmentPrompt} />;
  }
  if (selectedMode === "free") {
    return <FreeMonitoringPanel state={state} selectedAccount={selectedAccount} removeCustomStimulus={removeCustomStimulus} />;
  }

  const accountId = selectedAccount?.id || state.session.currentUserId;
  const learn = state.learnMetrics?.byAccount?.[accountId] || state.learnMetrics || {};
  const attempts = learn.attempts || { correct: 0, total: 0 };
  const activeLearnApps = accountId && state.session.learnModules?.[accountId]
    ? new Set([state.session.learnModules[accountId]])
    : new Set(Object.values(state.session.learnModules || {}));
  const now = Date.now();
  const totalTime = getLearnTotalTime(learn, activeLearnApps, now);

  return (
    <section className="admin-section learn-evaluation-panel">
      <h3>Learn Mode Evaluation</h3>
      <div className="learn-eval-summary">
        <div><span>Modules completed</span><strong>{learn.modulesCompleted || 0}</strong></div>
        <div><span>Time spent on modules</span><strong>{formatDuration(totalTime)}</strong></div>
        <div>
          <span>Accurate clicks / answers</span>
          <strong>{pct(attempts.correct || 0, attempts.total || 0)}</strong>
          <p>{attempts.correct || 0}/{attempts.total || 0} accurate</p>
        </div>
      </div>
      <div className="learn-eval-apps">
        <div className="learn-eval-row head">
          <span>App</span>
          <span>Completed</span>
          <span>Time</span>
          <span>Accuracy</span>
        </div>
      {LEARN_APP_CATALOG.map((app) => {
        const appMetrics = learn.byApp?.[app.currentApp] || { correct: 0, total: 0 };
        return (
          <div key={app.id} className="learn-eval-row">
            <strong>{app.label}</strong>
            <span>{learn.completedByApp?.[app.currentApp] || 0}</span>
            <span>{formatDuration(getLearnAppTime(learn, app.currentApp, activeLearnApps, now))}</span>
            <span>{pct(appMetrics.correct || 0, appMetrics.total || 0)}</span>
          </div>
        );
      })}
      </div>
    </section>
  );
}

function PracticeControlPanel({ state, selectedAccount, setPracticeSupport }) {
  const accountId = selectedAccount?.id || state.session.currentUserId;
  const activeScenario = getActiveScenarioForAccount(state, accountId);
  const metrics = state.practiceMetrics?.byAccount?.[accountId] || {};
  const startedAt = metrics.startedAt || activeScenario?.pushedAt;
  const elapsed = startedAt ? (metrics.completedAt || Date.now()) - startedAt : null;
  const completedSteps = metrics.completedSteps || [];
  const completedStepSet = new Set(completedSteps);
  const guideSteps = getScenarioGuideSteps(activeScenario);
  const checklist = buildAssessmentChecklist(state, activeScenario, accountId);
  const completedChecklist = checklist.filter((item) => item.done).length;
  const latestPrompt = getLatestPromptText(metrics);
  const supportLabel = metrics.supportMode === "checklist" ? "One-step guidance" : "Independent attempt with graded help";
  const status = !activeScenario ? "No scenario pushed" : metrics.completedAt ? "Completed" : completedSteps.length > 0 ? "In progress" : "Not started";

  function setSupport(supportMode, options = {}) {
    if (!accountId) return;
    setPracticeSupport(supportMode, { accountId, ...options });
  }

  return (
    <section className="admin-section practice-control-panel">
      <h3>Practice Control Panel</h3>
      {!selectedAccount ? <p className="admin-muted">Select a live user to control checklist support and view practice progress.</p> : null}
      <div className="practice-admin-block">
        <h4>Active Practice Scenario</h4>
        {activeScenario ? (
          <>
            <strong>{activeScenario.title}</strong>
            <span>{activeScenario.complexity} | {activeScenario.apps.map((appId) => APP_CATALOG.find((app) => app.id === appId)?.label || appId).join(", ")}</span>
            <p>{activeScenario.description}</p>
            <ul>
              {activeScenario.successCriteria.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </>
        ) : (
          <p className="admin-muted">Push a Practice scenario above to start structured practice.</p>
        )}
      </div>

      <div className="practice-admin-grid">
        <div><span>Status</span><strong>{status}</strong></div>
        <div><span>Support</span><strong>{supportLabel}</strong></div>
        <div><span>Attempt</span><strong>{metrics.attempt || 1}</strong></div>
        <div><span>Time</span><strong>{elapsed === null ? "-" : formatDuration(elapsed)}</strong></div>
        <div><span>Steps completed</span><strong>{guideSteps.length ? `${completedSteps.length}/${guideSteps.length}` : completedSteps.length}</strong></div>
        <div><span>Prompts</span><strong>{metrics.promptCount || 0}</strong></div>
        <div><span>Latest prompt</span><strong>{latestPrompt || "None used"}</strong></div>
        <div><span>Wrong-step attempts</span><strong>{metrics.wrongStepAttempts || 0}</strong></div>
      </div>

      <div className="practice-admin-block">
        <h4>Live Step Capture</h4>
        {guideSteps.length === 0 ? (
          <p className="admin-muted">Push a Practice scenario to see live task-step detection.</p>
        ) : (
          <div className="assessment-checklist-capture">
            {guideSteps.map((step) => (
              <div key={step.id} className={completedStepSet.has(step.id) ? "done" : ""}>
                <span>{completedStepSet.has(step.id) ? "OK" : ""}</span>
                <strong>{step.label}</strong>
                <em>{completedStepSet.has(step.id) ? "Detected live" : "Awaiting correct action"}</em>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="practice-admin-block">
        <h4>Live Scenario Outcome Capture</h4>
        {checklist.length === 0 ? (
          <p className="admin-muted">Push a Practice scenario to see objective scenario outcomes.</p>
        ) : (
          <>
            <p className="admin-muted">{completedChecklist}/{checklist.length} required scenario outcomes detected in real time.</p>
            <div className="assessment-checklist-capture">
              {checklist.map((item) => (
                <div key={item.criterion} className={item.done ? "done" : ""}>
                  <span>{item.done ? "OK" : ""}</span>
                  <strong>{item.criterion}</strong>
                  <em>{item.evidence}</em>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="practice-admin-block">
        <h4>Guidance Controls</h4>
        <div className="practice-admin-actions">
          <button type="button" onClick={() => setSupport("checklist")} disabled={!accountId || !activeScenario}>Show one-step guidance</button>
          <button type="button" onClick={() => setSupport("prompt")} disabled={!accountId || !activeScenario}>Use independent view</button>
          <button type="button" onClick={() => setSupport("checklist", { newAttempt: true, resetSteps: true })} disabled={!accountId || !activeScenario}>Restart with guidance</button>
          <button type="button" onClick={() => setSupport("prompt", { newAttempt: true, resetSteps: true })} disabled={!accountId || !activeScenario}>Restart independently</button>
        </div>
      </div>

      <div className="practice-admin-block">
        <h4>Carryover Markers</h4>
        <p>Completed with step guidance: <strong>{metrics.checklistCompleted ? "Yes" : "No"}</strong></p>
        <p>Completed independently: <strong>{metrics.hiddenCompleted ? "Yes" : "No"}</strong></p>
      </div>
    </section>
  );
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function hasOpenedApp(state, app, accountId = null) {
  return state.hiddenLog.some((entry) => (
    (!accountId || !entry.accountId || entry.accountId === accountId)
    && entry.kind === "open_app"
    && entry.app === app
  ));
}

function hasLogKind(state, kind, accountId = null) {
  return state.hiddenLog.some((entry) => (
    (!accountId || !entry.accountId || entry.accountId === accountId)
    && entry.kind === kind
  ));
}

function hasCorrectTaskAnswer(state, ids, accountId = null) {
  const idSet = new Set(ids);
  return state.hiddenLog.some((entry) => (
    (!accountId || !entry.accountId || entry.accountId === accountId)
    && (
      (entry.kind === "practice_answer" && (idSet.has(entry.stepId) || idSet.has(entry.answerCheckId)))
      || (entry.kind === "assessment_answer" && idSet.has(entry.checkId))
    )
    && entry.correct
  ));
}

function hasClickTarget(state, targetText, accountId = null) {
  const needle = text(targetText);
  return state.hiddenLog.some((entry) => (
    (!accountId || !entry.accountId || entry.accountId === accountId)
    && entry.kind === "click"
    && text(entry.target).includes(needle)
  ));
}

function getAccountLogs(state, accountId = null) {
  return (state.hiddenLog || []).filter((entry) => !accountId || entry.accountId === accountId);
}

function eventBelongsToAccount(event, accountId) {
  return !accountId || !event.accountId || event.accountId === accountId;
}

function hasPsychiatryCalendarEntry(state, accountId = null) {
  return state.events.some((event) => (
    eventBelongsToAccount(event, accountId)
    &&
    event.source === "Calendar"
    && titleHasAny(event, ["psy", "psychiatry", "doctor"])
    && event.date === DOCTOR_APPOINTMENT_TARGET.date
    && (event.month ?? DOCTOR_APPOINTMENT_TARGET.month) === DOCTOR_APPOINTMENT_TARGET.month
    && (event.year ?? DOCTOR_APPOINTMENT_TARGET.year) === DOCTOR_APPOINTMENT_TARGET.year
    && Math.abs((event.start ?? 0) - DOCTOR_APPOINTMENT_TARGET.start) <= 30
  ));
}

function hasDinnerCalendarEntry(state, accountId = null) {
  return state.events.some((event) => (
    eventBelongsToAccount(event, accountId)
    &&
    event.source === "Calendar"
    && titleHasAny(event, ["dinner", "family"])
    && event.date === DOCTOR_APPOINTMENT_TARGET.date
    && (event.month ?? DOCTOR_APPOINTMENT_TARGET.month) === DOCTOR_APPOINTMENT_TARGET.month
    && (event.year ?? DOCTOR_APPOINTMENT_TARGET.year) === DOCTOR_APPOINTMENT_TARGET.year
    && (event.start ?? 0) >= 18 * 60
  ));
}

function checkAssessmentCriterion(state, criterion, accountId = null) {
  const c = text(criterion);
  if (c.includes("open messages")) return { done: hasOpenedApp(state, "sms", accountId), evidence: "Messages opened" };
  if (c.includes("open calendar")) return { done: hasOpenedApp(state, "calendar", accountId), evidence: "Calendar opened" };
  if (c.includes("open maps")) return { done: hasOpenedApp(state, "maps", accountId), evidence: "Maps opened" };
  if (c.includes("open bank")) return { done: hasOpenedApp(state, "bank", accountId), evidence: "Bank opened" };
  if (c.includes("open singpass")) return { done: hasOpenedApp(state, "singpass", accountId), evidence: "Singpass opened" };
  if (c.includes("open family")) return { done: hasClickTarget(state, "family", accountId) || hasOpenedApp(state, "whatsapp", accountId), evidence: "Family/WhatsApp opened" };
  if (c.includes("doctor") || c.includes("read doctor") || c.includes("identify")) {
    const answered = hasCorrectTaskAnswer(state, getTaskAnswerIds("appointmentDetails"), accountId);
    return {
      done: answered || hasClickTarget(state, "sms-doctor", accountId) || hasClickTarget(state, "doctor", accountId) || hasPsychiatryCalendarEntry(state, accountId),
      evidence: answered ? "Appointment details answer correct" : "Doctor appointment information accessed or used",
    };
  }
  if (c.includes("psychiatry") || c.includes("save appointment") || c.includes("save event") || /\bset\s+\d{1,2}\s+[a-z]{3}/i.test(c) || c.includes("set 3:00")) {
    return { done: hasPsychiatryCalendarEntry(state, accountId), evidence: "Matching psychiatry calendar entry found" };
  }
  if (c.includes("dinner") && c.includes("calendar")) {
    return { done: hasDinnerCalendarEntry(state, accountId), evidence: "Dinner calendar entry found" };
  }
  if (c.includes("type:") || c.includes("send:") || c.includes("send the message") || c.includes("reply")) {
    const totalReplies = getAccountLogs(state, accountId).filter((entry) => entry.kind === "wa_reply").length;
    return { done: totalReplies > 0, evidence: `${totalReplies} WhatsApp repl${totalReplies === 1 ? "y" : "ies"} sent` };
  }
  if (c.includes("route") || c.includes("travel duration") || c.includes("home to clinic")) {
    return {
      done: hasOpenedApp(state, "maps", accountId) && state.hiddenLog.some((entry) => (
        (!accountId || !entry.accountId || entry.accountId === accountId)
        && (text(entry.target).includes("directions") || text(entry.target).includes("route"))
      )),
      evidence: "Maps route interaction detected",
    };
  }
  if (c.includes("match recipient") || c.includes("match singpass")) {
    return {
      done: hasOpenedApp(state, "singpass", accountId) && (hasLogKind(state, "assessment_answer", accountId) || hasLogKind(state, "practice_answer", accountId)),
      evidence: "Singpass matching answer checked",
    };
  }
  if (c.includes("approve payment in singpass")) {
    return {
      done: hasLogKind(state, "singpass_approved", accountId),
      evidence: hasLogKind(state, "singpass_approved", accountId) ? "Singpass approval detected" : "Awaiting Singpass approval",
    };
  }
  if (c.includes("balance") || c.includes("hougang") || c.includes("payment") || c.includes("approve")) {
    return {
      done: hasOpenedApp(state, "bank", accountId) && state.hiddenLog.some((entry) => (
        (!accountId || !entry.accountId || entry.accountId === accountId)
        && (text(entry.target).includes("bank-primary") || text(entry.target).includes("review") || text(entry.target).includes("confirm"))
      )),
      evidence: "Bank payment interaction detected",
    };
  }
  return { done: false, evidence: "Awaiting evidence" };
}

function buildAssessmentChecklist(state, scenario, accountId = null) {
  if (!scenario) return [];
  return scenario.successCriteria.map((criterion) => ({
    criterion,
    ...checkAssessmentCriterion(state, criterion, accountId),
  }));
}

function getPromptItems(metrics = {}) {
  return (metrics.promptHistory || []).map((prompt) => ({
    id: prompt.id || `${prompt.at || ""}-${prompt.level || ""}-${prompt.text || ""}`,
    at: prompt.at,
    app: prompt.app || "current app",
    stepId: prompt.stepId || "",
    label: prompt.label || "",
    text: prompt.text || `Prompt level ${prompt.level || 1} recorded`,
    respondedAt: prompt.respondedAt,
    responseMs: prompt.responseMs,
  }));
}

function getLatestPromptText(metrics = {}) {
  return getPromptItems(metrics)[0]?.text || "";
}

function summarizeCriteriaByDomain(checklist) {
  return checklist.reduce((acc, item) => {
    const domain = getCriterionDomain(item.criterion);
    if (!acc[domain]) {
      acc[domain] = { total: 0, done: 0, evidence: [] };
    }
    acc[domain].total += 1;
    if (item.done) {
      acc[domain].done += 1;
    }
    acc[domain].evidence.push(`${item.done ? "done" : "pending"}: ${item.criterion}`);
    return acc;
  }, {});
}

function buildFunctionalCognitionTracking(state, metrics, checklist, elapsed, accountId = null) {
  const completed = checklist.filter((item) => item.done).length;
  const total = checklist.length;
  const completionRatio = total > 0 ? completed / total : 0;
  const avgInterval = average(metrics.actionIntervalsMs || []);
  const promptLevel = metrics.highestPromptLevel || 0;
  const latestPrompt = getLatestPromptText(metrics);
  const stuckCount = metrics.stuckAlerts?.length || 0;
  const domainSummary = summarizeCriteriaByDomain(checklist);
  const accountLogs = getAccountLogs(state, accountId);
  const contextSwitches = accountLogs.filter((entry) => ["open_app", "go_home", "go_back"].includes(entry.kind)).length;
  const corrections = accountLogs.filter((entry) => ["update_event", "delete_event"].includes(entry.kind)).length;
  const rows = [
    {
      label: "Initiation",
      status: statusFrom(metrics.timeToFirstActionMs !== null && metrics.timeToFirstActionMs !== undefined),
      evidence: metrics.timeToFirstActionMs === null || metrics.timeToFirstActionMs === undefined
        ? "No independent action recorded yet."
        : `First action after ${formatDuration(metrics.timeToFirstActionMs)}.`,
    },
    {
      label: "Sustained task engagement",
      status: statusFrom(stuckCount === 0 && (metrics.actionCount || 0) > 0, stuckCount > 0),
      evidence: stuckCount > 0 ? `${stuckCount} stuck ping${stuckCount === 1 ? "" : "s"} triggered.` : `${metrics.actionCount || 0} actions without a stuck ping.`,
    },
    {
      label: "Working memory / goal maintenance",
      status: statusFrom(completionRatio >= 0.75, completionRatio > 0),
      evidence: `${contextSwitches} app switch${contextSwitches === 1 ? "" : "es"} with ${completed}/${total || 0} task requirements completed.`,
    },
    {
      label: "Cognitive flexibility",
      status: statusFrom(contextSwitches > 0 && completionRatio > 0, contextSwitches > 0),
      evidence: `${contextSwitches} context switch${contextSwitches === 1 ? "" : "es"} recorded for this account.`,
    },
    {
      label: "Self-monitoring / error correction",
      status: statusFrom(corrections > 0, checklist.some((item) => getCriterionDomain(item.criterion) === "Self-monitoring" && item.done)),
      evidence: `${corrections} calendar edit/delete correction${corrections === 1 ? "" : "s"} recorded for this account.`,
    },
    {
      label: "Processing efficiency",
      status: statusFrom(Boolean(avgInterval || elapsed), (metrics.actionCount || 0) > 0),
      evidence: `Average between actions: ${formatDuration(avgInterval)}. Total assessment time: ${formatDuration(elapsed)}.`,
    },
    {
      label: "Cueing required",
      status: promptLevel === 0 ? "Independent so far" : "Prompt used",
      evidence: promptLevel === 0 ? "No therapist prompt used." : latestPrompt || `${metrics.promptHistory?.length || 0} prompt${metrics.promptHistory?.length === 1 ? "" : "s"} pushed.`,
    },
  ];
  Object.entries(domainSummary).forEach(([label, summary]) => {
    rows.splice(2, 0, {
      label,
      status: statusFrom(summary.done === summary.total && summary.total > 0, summary.done > 0),
      evidence: `${summary.done}/${summary.total} required ${label.toLowerCase()} step${summary.total === 1 ? "" : "s"} detected.`,
    });
  });
  return rows;
}

function AssessmentControlPanel({ state, selectedAccount, pushAssessmentPrompt }) {
  const accountId = selectedAccount?.id || state.session.currentUserId;
  const activeScenario = getActiveScenarioForAccount(state, accountId);
  const metrics = state.assessmentMetrics?.byAccount?.[accountId] || {};
  const startedAt = metrics.startedAt || activeScenario?.pushedAt;
  const elapsed = startedAt ? (metrics.completedAt || Date.now()) - startedAt : null;
  const idleMs = metrics.lastActionAt ? Date.now() - metrics.lastActionAt : null;
  const averageActionInterval = average(metrics.actionIntervalsMs || []);
  const latestAlert = metrics.stuckAlerts?.[0];
  const promptHistory = metrics.promptHistory || [];
  const promptResponseAverage = average(metrics.promptResponseTimesMs || []);
  const latestPrompt = getLatestPromptText(metrics);
  const checklist = buildAssessmentChecklist(state, activeScenario, accountId);
  const completedChecklist = checklist.filter((item) => item.done).length;
  const observedSteps = getScenarioGuideSteps(activeScenario);
  const observedStepSet = new Set(metrics.completedSteps || []);
  const cognitionRows = buildFunctionalCognitionTracking(state, metrics, checklist, elapsed, accountId);

  function pushPrompt(prompt) {
    if (!accountId) return;
    pushAssessmentPrompt(accountId, prompt);
  }

  return (
    <section className="admin-section assessment-control-panel">
      <h3>Assessment Control Panel</h3>
      {!selectedAccount ? <p className="admin-muted">Select a live user to view assessment timing and push graded prompts.</p> : null}

      <div className={`assessment-stuck-banner ${idleMs >= 30000 ? "alert" : ""}`}>
        <strong>{idleMs >= 30000 ? "Possible stuck point" : "Monitoring independent performance"}</strong>
        <span>{idleMs === null ? "No action recorded yet" : `Idle for ${formatDuration(idleMs)}`}</span>
        {latestAlert ? <em>Last ping: {formatDuration(Date.now() - latestAlert.at)} ago on {latestAlert.app}</em> : null}
      </div>

      <div className="practice-admin-block">
        <h4>Active Assessment Scenario</h4>
        {activeScenario ? (
          <>
            <strong>{activeScenario.title}</strong>
            <span>{activeScenario.complexity} | {activeScenario.apps.map((appId) => APP_CATALOG.find((app) => app.id === appId)?.label || appId).join(", ")}</span>
            <p>{activeScenario.description}</p>
            <ul>
              {activeScenario.successCriteria.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </>
        ) : (
          <p className="admin-muted">Push an Assessment scenario above to begin independent-first observation.</p>
        )}
      </div>

      <div className="practice-admin-block">
        <h4>Live Task-Step Capture</h4>
        {observedSteps.length === 0 ? (
          <p className="admin-muted">Push an Assessment scenario to see app-level steps detected live.</p>
        ) : (
          <>
            <p className="admin-muted">{observedSteps.filter((step) => observedStepSet.has(step.id)).length}/{observedSteps.length} app steps detected.</p>
            <div className="assessment-checklist-capture">
              {observedSteps.map((step) => (
                <div key={step.id} className={observedStepSet.has(step.id) ? "done" : ""}>
                  <span>{observedStepSet.has(step.id) ? "OK" : ""}</span>
                  <strong>{step.label}</strong>
                  <em>{observedStepSet.has(step.id) ? "Detected live" : "Awaiting evidence"}</em>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="practice-admin-block">
        <h4>Scenario Outcome Capture</h4>
        {checklist.length === 0 ? (
          <p className="admin-muted">Push an Assessment scenario to capture task-level completion.</p>
        ) : (
          <>
            <p className="admin-muted">{completedChecklist}/{checklist.length} required items detected.</p>
            <div className="assessment-checklist-capture">
              {checklist.map((item) => (
                <div key={item.criterion} className={item.done ? "done" : ""}>
                  <span>{item.done ? "OK" : ""}</span>
                  <strong>{item.criterion}</strong>
                  <em>{item.evidence}</em>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="practice-admin-grid">
        <div><span>Time</span><strong>{elapsed === null ? "-" : formatDuration(elapsed)}</strong></div>
        <div><span>Initiation</span><strong>{formatDuration(metrics.timeToFirstActionMs)}</strong></div>
        <div><span>Actions</span><strong>{metrics.actionCount || 0}</strong></div>
        <div><span>Taps</span><strong>{metrics.tapCount || 0}</strong></div>
        <div><span>Avg between actions</span><strong>{formatDuration(averageActionInterval)}</strong></div>
        <div><span>Stuck pings</span><strong>{metrics.stuckAlerts?.length || 0}</strong></div>
        <div><span>Latest prompt</span><strong>{latestPrompt || "None used"}</strong></div>
        <div><span>Prompt response avg</span><strong>{formatDuration(promptResponseAverage)}</strong></div>
      </div>

      <div className="practice-admin-block">
        <h4>Fading Prompt Support</h4>
        <p className="admin-muted">Use the least supportive prompt first. Each prompt and response time becomes part of cueing-required evidence.</p>
        <div className="assessment-prompt-grid">
          {ASSESSMENT_PROMPTS.map((prompt) => (
            <button key={prompt.level} type="button" onClick={() => pushPrompt(prompt)} disabled={!accountId || !activeScenario}>
              <strong>{prompt.level}. {prompt.label}</strong>
              <span>{prompt.text}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="practice-admin-block">
        <h4>Functional Cognition Domains</h4>
        <div className="assessment-domain-list tracked">
          {cognitionRows.map((domain) => (
            <div key={domain.label}>
              <strong>{domain.label}</strong>
              <b>{domain.status}</b>
              <span>{domain.evidence}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="practice-admin-block">
        <h4>Prompt History</h4>
        {promptHistory.length === 0 ? (
          <p className="admin-muted">No therapist prompts pushed yet.</p>
        ) : promptHistory.map((prompt) => (
          <p key={prompt.id}>
            <strong>Level {prompt.level} {prompt.label}</strong> - {prompt.respondedAt ? `responded in ${formatDuration(prompt.responseMs)}` : "awaiting response"}
          </p>
        ))}
      </div>
    </section>
  );
}

function statusLabel(status) {
  if (status === "ok") return "Completed";
  if (status === "error") return "Error";
  return "Pending";
}

function CapturedEvaluationInfo({ state, helpers }) {
  const { checks, accuracy } = buildCapturedEvaluation(state, helpers);
  const now = Date.now();
  const totalTimeMs = state.session.completedAt ? state.session.completedAt - state.session.startedAt : null;
  const planningTimeMs = state.session.firstEntryAt ? state.session.firstEntryAt - state.session.startedAt : null;
  const activeDurationMs = now - state.session.startedAt;
  const whatsAppReplies = Object.values(state.metrics.whatsappReplies).reduce((sum, count) => sum + count, 0);

  return (
    <section className="admin-section admin-captured-evaluation">
      <h3>Captured Evaluation Information</h3>

      <div className="admin-eval-block">
        <h4>Weekly Constraints</h4>
        <ul>
          {weeklyRules.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      </div>

      <div className="admin-eval-block eval-table-wrap">
        <h4>Admin Task Checklist</h4>
        <table className="eval-table">
          <thead>
            <tr>
              <th>Task</th>
              <th>Status</th>
              <th>Evidence</th>
            </tr>
          </thead>
          <tbody>
            {checks.map((row) => (
              <tr key={row.task}>
                <td>{row.task}</td>
                <td className={row.status}>{statusLabel(row.status)}</td>
                <td>{row.evidence}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="admin-eval-block eval-table-wrap">
        <h4>1. Performance Accuracy (The What)</h4>
        <table className="eval-table">
          <tbody>
            <tr><td>Number of Appointments Entered</td><td>{accuracy.totalEntered}</td></tr>
            <tr><td>Accuracy Score</td><td>{accuracy.accuracyScore} / {accuracy.accuracyTotal}</td></tr>
            <tr><td>Location Errors</td><td>{accuracy.locationErrors}</td></tr>
            <tr><td>Omission Errors</td><td>{accuracy.omissionErrors}</td></tr>
            <tr><td>Incomplete Errors</td><td>{accuracy.incompleteErrors}</td></tr>
          </tbody>
        </table>
      </div>

      <div className="admin-eval-block eval-table-wrap">
        <h4>2. Efficiency & Time Management (The How Fast)</h4>
        <table className="eval-table">
          <tbody>
            <tr><td>Total Time</td><td>{totalTimeMs === null ? "Not signaled" : formatDuration(totalTimeMs)}</td></tr>
            <tr><td>Planning Time</td><td>{planningTimeMs === null ? "No entry yet" : formatDuration(planningTimeMs)}</td></tr>
            <tr><td>Current Session Elapsed</td><td>{formatDuration(activeDurationMs)}</td></tr>
          </tbody>
        </table>
      </div>

      <div className="admin-eval-block metrics-box">
        <h4>EF Logger (Hidden)</h4>
        <p>Omission errors: {state.metrics.omissionErrors}</p>
        <p>Perseveration: {state.metrics.perseveration}</p>
        <p>Rule breaking: {state.metrics.ruleBreaking}</p>
        <p>Context switches: {state.metrics.contextSwitches}</p>
        <p>WhatsApp replies tracked: {whatsAppReplies}</p>
      </div>
    </section>
  );
}

function SessionTimeline({ state, selectedAccount }) {
  const accountId = selectedAccount?.id || null;
  const timelineKinds = new Set([
    "open_app", "go_home", "go_back", "toggle_tabs", "add_event", "update_event",
    "wa_reply", "wa_confirm", "wa_friend_confirm", "admin_cue", "orientation_control",
    "practice_step", "practice_prompt", "practice_wrong_step", "practice_answer",
    "assessment_started_by_user", "assessment_step", "assessment_prompt", "assessment_complete",
    "start_local_mode", "return_to_main_page",
  ]);
  const scopedEntries = state.hiddenLog
    .filter((entry) => (!accountId || entry.accountId === accountId) && timelineKinds.has(entry.kind));
  const deduplicated = scopedEntries.filter((entry, index) => {
    const previous = scopedEntries[index - 1];
    if (!previous) return true;
    const sameSignature = ["kind", "target", "stepId", "level", "app", "text"]
      .every((key) => (previous[key] || "") === (entry[key] || ""));
    const previousAt = previous.eventWallMs || previous.at || 0;
    const entryAt = entry.eventWallMs || entry.at || 0;
    return !sameSignature || Math.abs(entryAt - previousAt) > 1500;
  });
  const timeline = deduplicated
    .slice(-20)
    .reverse();

  return (
    <section className="admin-section session-timeline-panel">
      <div className="timeline-heading">
        <div>
          <h3>Session timeline</h3>
          <p className="admin-muted">
            {selectedAccount ? `${formatAlias(selectedAccount.alias)} · ${getParticipantCode(selectedAccount)}` : "Select a user to filter the timeline."}
          </p>
        </div>
        <span className="stored-indicator">Stored in session record</span>
      </div>
      {timeline.length === 0 ? (
        <p className="admin-muted">Tracked actions will appear here in time order.</p>
      ) : (
        <ol className="session-timeline-list">
          {timeline.map((entry, index) => {
            const elapsed = entry.eventWallMs && state.session.startedAt
              ? Math.max(0, entry.eventWallMs - state.session.startedAt)
              : null;
            return (
              <li key={`${entry.eventWallMs || entry.at || index}-${entry.kind}-${index}`}>
                <time>{elapsed === null ? entry.simClock || "-" : formatDuration(elapsed)}</time>
                <div>
                  <strong>{describeLogEntry(entry)}</strong>
                  <span>{entry.app ? `App: ${entry.app}` : entry.mode ? `Mode: ${entry.mode}` : "Session activity"}</span>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function LiveActivityEvidence({ state, averageTypingLatency, selectedAccount }) {
  const accountId = selectedAccount?.id || null;
  const calendar = getCalendarEvidence(state, accountId);
  const whatsapp = getWhatsAppEvidence(state, accountId);
  const recentLogs = state.hiddenLog
    .filter((entry) => !accountId || entry.accountId === accountId)
    .filter((entry) => [
      "open_app",
      "go_home",
      "go_back",
      "add_event",
      "update_event",
      "wa_reply",
      "wa_confirm",
      "wa_friend_confirm",
      "click",
      "input_focus",
      "typing_latency",
      "admin_cue",
    ].includes(entry.kind))
    .slice(-8)
    .reverse();

  return (
    <section className="admin-section live-evidence-panel">
      <h3>Live Activity Evidence</h3>
      {selectedAccount ? <p className="admin-muted">Showing evidence for {formatAlias(selectedAccount.alias)}.</p> : null}
      <div className="evidence-summary-grid">
        <div>
          <span>Calendar inputs</span>
          <strong>{calendar.createdCount}</strong>
          <p>{calendar.latest ? `${calendar.latest.title} | ${formatCalendarDate(calendar.latest)} ${formatClockTime(calendar.latest.start)}` : "No manual calendar entry yet."}</p>
        </div>
        <div>
          <span>Message appointments scheduled</span>
          <strong>{calendar.scheduledFromMessages}</strong>
          <p>{calendar.remainingRequired === 0 ? "All required SMS appointments captured." : `${calendar.remainingRequired} required appointment(s) still missing.`}</p>
        </div>
        <div>
          <span>WhatsApp replies</span>
          <strong>{whatsapp.totalReplies}</strong>
          <p>{whatsapp.repliedThreads.length ? whatsapp.repliedThreads.map((thread) => `${thread.sender} x${thread.count}`).join(", ") : "No WhatsApp reply sent yet."}</p>
        </div>
        <div>
          <span>WhatsApp confirmations</span>
          <strong>{whatsapp.confirmedCount}/{whatsapp.friendConfirmedCount}</strong>
          <p>User confirmations / confirmations received from contact.</p>
        </div>
        <div>
          <span>Average typing latency</span>
          <strong>{formatDuration(averageTypingLatency)}</strong>
          <p>Delay before first keystroke after input focus.</p>
        </div>
        <div>
          <span>Navigation behavior</span>
          <strong>{state.metrics.contextSwitches}</strong>
          <p>{state.interactionMetrics.backPresses} back, {state.interactionMetrics.homePresses} home, {state.interactionMetrics.recentPresses} recent.</p>
        </div>
      </div>

      <div className="thread-evidence-list">
        {whatsapp.repliedThreads.length === 0 ? (
          <p className="admin-muted">WhatsApp thread-level evidence will appear after the user replies.</p>
        ) : whatsapp.repliedThreads.map((thread) => (
          <div key={thread.threadId}>
            <strong>{thread.sender}</strong>
            <span>{thread.count} reply{thread.count === 1 ? "" : "ies"}</span>
            <em>{thread.userConfirmed ? "User confirmed" : "Awaiting user confirmation"}</em>
            <em>{thread.friendConfirmed ? "Contact confirmed" : "Awaiting contact confirmation"}</em>
          </div>
        ))}
      </div>

      <div className="recent-activity-list">
        <strong>Recent action trace</strong>
        {recentLogs.length === 0 ? (
          <p className="admin-muted">No tracked actions yet.</p>
        ) : recentLogs.map((entry) => (
          <span key={`${entry.at}-${entry.kind}-${entry.threadId || entry.app || entry.target || ""}`}>
            <em>{entry.simClock}</em>
            {describeLogEntry(entry)}
          </span>
        ))}
      </div>
    </section>
  );
}

function appMatchesRecord(item, appId) {
  if (appId === "all") return true;
  const app = APP_CATALOG.find((entry) => entry.id === appId);
  const aliases = [appId, app?.currentApp].filter(Boolean);
  return aliases.some((alias) => (item.apps || []).includes(alias));
}

function filterRecordsForDashboard(items, filters) {
  return filterRecordItems(items, { ...filters, app: "all" }).filter((item) => appMatchesRecord(item, filters.app));
}

function averageNumber(values) {
  const numeric = values.filter((value) => typeof value === "number");
  return numeric.length ? numeric.reduce((sum, value) => sum + value, 0) / numeric.length : null;
}

function pctFromCounts(done, total) {
  return total > 0 ? Math.round((done / total) * 100) : null;
}

function getFilteredModes(items) {
  return ["learn", "practice", "assessment", "free"].reduce((acc, mode) => {
    acc[mode] = items.filter((item) => item.mode === mode);
    return acc;
  }, {});
}

function getTimelineSummary(items) {
  const latest = items[0];
  const first = items.at(-1);
  const latestCompletion = latest ? getFunctionalCompletion(latest) : null;
  const firstCompletion = first ? getFunctionalCompletion(first) : null;
  const latestAccuracy = latest ? getTaskAnswerAccuracy(latest) : null;
  const latestInitiation = latest ? getAssessmentMetric(latest, "timeToFirstActionMs") : null;
  const latestInterval = latest ? getAssessmentMetric(latest, "avgActionInterval") : null;
  const latestPrompt = latest ? [
    ...getPromptItems(latest.assessmentMetrics || {}),
    ...getPromptItems(latest.practiceMetrics || {}),
  ].sort((a, b) => (b.at || 0) - (a.at || 0))[0]?.text || "" : "";
  return {
    latest,
    first,
    latestCompletion,
    firstCompletion,
    latestAccuracy,
    latestInitiation,
    latestInterval,
    latestPrompt,
    completionChange: percentChange(firstCompletion?.pct, latestCompletion?.pct),
    initiationChange: percentChange(first ? getAssessmentMetric(first, "timeToFirstActionMs") : null, latestInitiation, true),
  };
}

function getLearnDashboardSummary(items) {
  const latestLearn = items.find((item) => item.mode === "learn")?.learnMetrics;
  const attempts = latestLearn?.attempts || { correct: 0, total: 0 };
  return {
    modulesCompleted: latestLearn?.modulesCompleted || 0,
    totalTimeMs: Object.values(latestLearn?.timeByAppMs || {}).reduce((sum, value) => sum + (value || 0), 0),
    accuracy: attempts.total ? Math.round((attempts.correct / attempts.total) * 100) : null,
    byApp: APP_CATALOG.map((app) => {
      const appAttempts = latestLearn?.byApp?.[app.currentApp] || latestLearn?.byApp?.[app.id] || { correct: 0, total: 0 };
      const completed = latestLearn?.completedByApp?.[app.currentApp] || latestLearn?.completedByApp?.[app.id] || 0;
      const timeMs = latestLearn?.timeByAppMs?.[app.currentApp] || latestLearn?.timeByAppMs?.[app.id] || 0;
      return {
        app,
        completed,
        timeMs,
        accuracy: appAttempts.total ? Math.round((appAttempts.correct / appAttempts.total) * 100) : null,
      };
    }),
  };
}

function getModeCompletionSummary(items) {
  const completions = items.map((item) => getFunctionalCompletion(item)).filter(Boolean);
  const done = completions.reduce((sum, item) => sum + item.done, 0);
  const total = completions.reduce((sum, item) => sum + item.total, 0);
  return {
    sessions: items.length,
    pct: pctFromCounts(done, total),
    done,
    total,
    avgInitiation: averageNumber(items.map((item) => getAssessmentMetric(item, "timeToFirstActionMs"))),
    avgInterval: averageNumber(items.map((item) => getAssessmentMetric(item, "avgActionInterval"))),
    promptSupport: [...new Set(items.flatMap((item) => [
      ...getPromptItems(item.assessmentMetrics || {}),
      ...getPromptItems(item.practiceMetrics || {}),
    ].map((prompt) => prompt.text)).filter(Boolean))],
    stuckAlerts: items.reduce((sum, item) => sum + (getAssessmentMetric(item, "stuckAlerts") || 0), 0),
  };
}

function PastRecords({ records }) {
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [activeReportTab, setActiveReportTab] = useState("overview");
  const [expandedSessionId, setExpandedSessionId] = useState("");
  const [filters, setFilters] = useState({ mode: "all", app: "all", scenario: "all" });
  const progressByAccount = records.flatMap((record) => record.participants || []).reduce((acc, item) => {
    if (!acc[item.accountId]) acc[item.accountId] = [];
    acc[item.accountId].push(item);
    return acc;
  }, {});
  const allItems = Object.values(progressByAccount).flat();
  const scenarios = [...new Map(allItems.filter((item) => item.scenarioId).map((item) => [item.scenarioId, item.scenarioTitle || item.scenarioId])).entries()];
  const accountTimelines = Object.entries(progressByAccount)
    .map(([accountId, items]) => ({
      accountId,
      allItems: [...items].sort((a, b) => b.completedAt - a.completedAt),
      items: filterRecordsForDashboard([...items].sort((a, b) => b.completedAt - a.completedAt), filters),
    }))
    .filter((entry) => entry.items.length > 0);
  const selectedTimeline = accountTimelines.find((entry) => entry.accountId === selectedAccountId) || accountTimelines[0] || null;
  const selectedItems = selectedTimeline?.items || [];
  const selectedSummary = getTimelineSummary(selectedItems);
  const modeItems = getFilteredModes(selectedItems);
  const learnSummary = getLearnDashboardSummary(selectedItems);
  const practiceSummary = getModeCompletionSummary(modeItems.practice);
  const assessmentSummary = getModeCompletionSummary(modeItems.assessment);
  const latestAlias = selectedSummary.latest?.alias || selectedItems[0]?.alias || "";

  return (
    <section className="admin-section past-dashboard">
      <div className="past-dashboard-header">
        <div>
          <span>Past sessions</span>
          <h3>Progress report cards</h3>
          <p>Select a de-identified profile, then review functional and cognitive outcomes without the live device view.</p>
        </div>
        <div className="past-filter-row">
          <label><span>Mode</span><select value={filters.mode} onChange={(event) => { setFilters((prev) => ({ ...prev, mode: event.target.value })); setExpandedSessionId(""); }}><option value="all">All modes</option><option value="learn">Learn</option><option value="practice">Practice</option><option value="assessment">Assessment</option><option value="free">Free</option></select></label>
          <label><span>App</span><select value={filters.app} onChange={(event) => { setFilters((prev) => ({ ...prev, app: event.target.value })); setExpandedSessionId(""); }}><option value="all">All apps</option>{APP_CATALOG.map((app) => <option key={app.id} value={app.id}>{app.label}</option>)}</select></label>
          <label><span>Scenario</span><select value={filters.scenario} onChange={(event) => { setFilters((prev) => ({ ...prev, scenario: event.target.value })); setExpandedSessionId(""); }}><option value="all">All scenarios</option>{scenarios.map(([id, title]) => <option key={id} value={id}>{title}</option>)}</select></label>
        </div>
      </div>

      {accountTimelines.length === 0 ? <p className="admin-muted">No matching progress records yet.</p> : (
        <>
          <div className="profile-tile-grid" aria-label="Profiles with saved progress">
            {accountTimelines.map(({ accountId, items, allItems: timelineItems }) => {
              const summary = getTimelineSummary(items);
              const modeCounts = getFilteredModes(timelineItems);
              return (
                <button key={accountId} type="button" className={`profile-tile ${selectedTimeline?.accountId === accountId ? "selected" : ""}`} onClick={() => { setSelectedAccountId(accountId); setExpandedSessionId(""); }}>
                  <span className="profile-tile-kicker">Profile</span>
                  <strong>{formatAlias(summary.latest?.alias || items[0]?.alias)}</strong>
                  <em>{items.length} matching attempt{items.length === 1 ? "" : "s"}</em>
                  <div className="profile-tile-stats">
                    <span><b>{summary.latestCompletion ? `${summary.latestCompletion.pct}%` : "-"}</b> latest steps</span>
                    <span><b>{formatDuration(summary.latestInitiation)}</b> initiation</span>
                  </div>
                  <small>Learn {modeCounts.learn.length} | Practice {modeCounts.practice.length} | Assessment {modeCounts.assessment.length}</small>
                </button>
              );
            })}
          </div>

          {selectedSummary.latest ? (
            <div className="profile-report-shell">
              <div className="profile-report-head">
                <div>
                  <span>Selected profile</span>
                  <h3>{formatAlias(latestAlias)}</h3>
                  <p>Latest saved attempt: {selectedSummary.latest.mode} | {formatDate(selectedSummary.latest.completedAt)}</p>
                </div>
                <div className="report-tab-row">
                  {["overview", "learn", "practice", "assessment", "attempts"].map((tab) => (
                    <button key={tab} type="button" className={activeReportTab === tab ? "active" : ""} onClick={() => { setActiveReportTab(tab); setExpandedSessionId(""); }}>
                      {tab}
                    </button>
                  ))}
                </div>
              </div>

              {activeReportTab === "overview" ? (
                <div className="report-card-two-panel">
                  <section className="report-summary-panel">
                    <div className="report-panel-title">
                      <span>Functional performance</span>
                      <h4>What the patient can do</h4>
                    </div>
                    <div className="report-kpi-grid">
                      <div><span>Latest step completion</span><strong>{selectedSummary.latestCompletion ? `${selectedSummary.latestCompletion.done}/${selectedSummary.latestCompletion.total}` : "-"}</strong><em>{selectedSummary.latestCompletion ? `${selectedSummary.latestCompletion.pct}% detected` : "No checklist data"}</em></div>
                      <div><span>Change across attempts</span><strong>{selectedSummary.completionChange}</strong><em>Filtered records only</em></div>
                      <div><span>Information accuracy</span><strong>{selectedSummary.latestAccuracy ? `${selectedSummary.latestAccuracy.correct}/${selectedSummary.latestAccuracy.attempts}` : "-"}</strong><em>{selectedSummary.latestAccuracy ? `${selectedSummary.latestAccuracy.pct}% correct` : "No answer card used"}</em></div>
                    </div>
                    <div className="app-ability-list">
                      {APP_CATALOG.map((app) => {
                        const score = getAppCompetency(selectedItems, app.id) ?? getAppCompetency(selectedItems, app.currentApp);
                        return (
                          <div key={app.id}>
                            <span>{app.label}</span>
                            <div><i style={{ width: `${score || 0}%` }} /></div>
                            <strong>{score === null ? "No data" : `${score}%`}</strong>
                          </div>
                        );
                      })}
                    </div>
                  </section>

                  <section className="report-summary-panel">
                    <div className="report-panel-title">
                      <span>Cognitive performance</span>
                      <h4>How the patient performs</h4>
                    </div>
                    <div className="report-kpi-grid">
                      <div><span>Initiation</span><strong>{formatDuration(selectedSummary.latestInitiation)}</strong><em>{selectedSummary.initiationChange}</em></div>
                      <div><span>Average between taps</span><strong>{formatDuration(selectedSummary.latestInterval)}</strong><em>Processing efficiency</em></div>
                      <div><span>Prompt support</span><strong>{selectedSummary.latestPrompt || "None used"}</strong><em>Latest recorded cue</em></div>
                    </div>
                    <div className="cognition-row-list">
                      {getCognitiveReportRows(selectedSummary.latest, selectedSummary.first || selectedSummary.latest).slice(0, 6).map((row) => (
                        <div key={row.label}>
                          <strong>{row.label}</strong>
                          <span>{row.format === "duration" ? formatDuration(row.display) : row.display}</span>
                          <em>{row.change}</em>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              ) : null}

              {activeReportTab === "learn" ? (
                <ModeReportPanel
                  title="Learn outcomes"
                  subtitle="Lower-level teaching metrics: modules completed, time on task, and accuracy of guided clicks or answers."
                  metrics={[
                    ["Modules completed", learnSummary.modulesCompleted],
                    ["Time spent", formatDuration(learnSummary.totalTimeMs)],
                    ["Accuracy", learnSummary.accuracy === null ? "-" : `${learnSummary.accuracy}%`],
                  ]}
                >
                  <div className="mode-table-list">
                    {learnSummary.byApp.map(({ app, completed, timeMs, accuracy }) => (
                      <div key={app.id}>
                        <strong>{app.label}</strong>
                        <span>{completed} module{completed === 1 ? "" : "s"} completed</span>
                        <span>{formatDuration(timeMs)}</span>
                        <span>{accuracy === null ? "No attempts" : `${accuracy}% accurate`}</span>
                      </div>
                    ))}
                  </div>
                </ModeReportPanel>
              ) : null}

              {activeReportTab === "practice" ? (
                <ModeReportPanel
                  title="Practice outcomes"
                  subtitle="Checklist-supported task practice, including completion and prompt fading readiness."
                  metrics={[
                    ["Attempts", practiceSummary.sessions],
                    ["Checklist completion", practiceSummary.pct === null ? "-" : `${practiceSummary.done}/${practiceSummary.total} (${practiceSummary.pct}%)`],
                    ["Average initiation", formatDuration(practiceSummary.avgInitiation)],
                    ["Prompts used", practiceSummary.promptSupport.length ? `${practiceSummary.promptSupport.length} cue type${practiceSummary.promptSupport.length === 1 ? "" : "s"}` : "None"],
                  ]}
                >
                  <AttemptRows items={modeItems.practice} expandedSessionId={expandedSessionId} setExpandedSessionId={setExpandedSessionId} />
                </ModeReportPanel>
              ) : null}

              {activeReportTab === "assessment" ? (
                <ModeReportPanel
                  title="Assessment outcomes"
                  subtitle="Independent performance with objective evidence of initiation, progress, stuck periods, and completed steps."
                  metrics={[
                    ["Attempts", assessmentSummary.sessions],
                    ["Objective completion", assessmentSummary.pct === null ? "-" : `${assessmentSummary.done}/${assessmentSummary.total} (${assessmentSummary.pct}%)`],
                    ["Average initiation", formatDuration(assessmentSummary.avgInitiation)],
                    ["Stuck alerts", assessmentSummary.stuckAlerts],
                  ]}
                >
                  <AttemptRows items={modeItems.assessment} expandedSessionId={expandedSessionId} setExpandedSessionId={setExpandedSessionId} />
                </ModeReportPanel>
              ) : null}

              {activeReportTab === "attempts" ? (
                <ModeReportPanel
                  title="Individual session data"
                  subtitle="Open a single attempt to see the exact steps detected, missing criteria, prompt level, and timing."
                  metrics={[
                    ["Filtered attempts", selectedItems.length],
                    ["Modes included", [...new Set(selectedItems.map((item) => item.mode))].join(", ") || "-"],
                    ["Apps included", [...new Set(selectedItems.flatMap((item) => item.apps || []))].join(", ") || "-"],
                  ]}
                >
                  <AttemptRows items={selectedItems} expandedSessionId={expandedSessionId} setExpandedSessionId={setExpandedSessionId} showMode />
                </ModeReportPanel>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function ModeReportPanel({ title, subtitle, metrics, children }) {
  return (
    <section className="mode-report-panel">
      <div className="report-panel-title">
        <span>Report card</span>
        <h4>{title}</h4>
        <p>{subtitle}</p>
      </div>
      <div className="report-kpi-grid compact">
        {metrics.map(([label, value]) => (
          <div key={label}><span>{label}</span><strong>{value}</strong></div>
        ))}
      </div>
      {children}
    </section>
  );
}

function AttemptRows({ items, expandedSessionId, setExpandedSessionId, showMode = false }) {
  if (items.length === 0) {
    return <p className="admin-muted">No saved attempts for this view.</p>;
  }
  return (
    <div className="attempt-row-list">
      {items.map((item) => {
        const completion = getFunctionalCompletion(item);
        const scenario = getScenarioForRecord(item);
        const expanded = expandedSessionId === item.id;
        return (
          <article key={item.id}>
            <button type="button" onClick={() => setExpandedSessionId(expanded ? "" : item.id)}>
              <span>{formatDate(item.completedAt)}</span>
              <strong>{showMode ? `${item.mode}: ` : ""}{item.scenarioTitle || scenario.title}</strong>
              <em>{completion ? `${completion.done}/${completion.total} steps (${completion.pct}%)` : "No checklist data"}{item.attempt ? ` | attempt ${item.attempt}` : ""}</em>
            </button>
            {expanded ? <AttemptDetail item={item} scenario={scenario} /> : null}
          </article>
        );
      })}
    </div>
  );
}

function AttemptDetail({ item, scenario }) {
  const answerAccuracy = getTaskAnswerAccuracy(item);
  const criteria = scenario.successCriteria || [];
  const promptItems = [
    ...getPromptItems(item.assessmentMetrics || {}),
    ...getPromptItems(item.practiceMetrics || {}),
  ].sort((a, b) => (b.at || 0) - (a.at || 0));
  return (
    <div className="attempt-detail-panel">
      <div className="attempt-metric-strip">
        <div><span>First action</span><strong>{formatDuration(getAssessmentMetric(item, "timeToFirstActionMs"))}</strong></div>
        <div><span>Avg action interval</span><strong>{formatDuration(getAssessmentMetric(item, "avgActionInterval"))}</strong></div>
        <div><span>Prompt support</span><strong>{promptItems[0]?.text || "None used"}</strong></div>
        <div><span>Stuck alerts</span><strong>{getAssessmentMetric(item, "stuckAlerts") || 0}</strong></div>
        <div><span>Answer accuracy</span><strong>{answerAccuracy ? `${answerAccuracy.correct}/${answerAccuracy.attempts}` : "-"}</strong></div>
      </div>

      <div className="attempt-evidence-grid">
        <section>
          <h5>Required scenario steps</h5>
          {criteria.length === 0 ? <p className="admin-muted">No scenario checklist attached.</p> : criteria.map((criterion) => {
            const done = checkRecordCriterion(item, criterion);
            return (
              <div key={criterion} className={done ? "done" : ""}>
                <span>{done ? "OK" : ""}</span>
                <strong>{criterion}</strong>
                <em>{getCriterionDomain(criterion)} | {getCriterionEvidenceDetail(item, criterion)}</em>
              </div>
            );
          })}
        </section>
        <section>
          <h5>Prompt support used</h5>
          {promptItems.length === 0 ? <p className="admin-muted">No therapist prompt was recorded for this attempt.</p> : promptItems.map((prompt) => (
            <div key={prompt.id} className="prompt-used">
              <span></span>
              <strong>{prompt.text}</strong>
              <em>{prompt.label ? `${prompt.label} | ` : ""}{prompt.app}{prompt.responseMs ? ` | responded in ${formatDuration(prompt.responseMs)}` : ""}</em>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
