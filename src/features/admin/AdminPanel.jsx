import { useEffect, useState } from "react";
import { getCurrentAssignment } from "../../state/sessionLifecycle";
import { APP_CATALOG, CHECKLIST_ITEMS, LEARN_APP_CATALOG, SCORE_LABELS, SCENARIO_LIBRARY, SESSION_MODES, formatAlias } from "../../state/v2Assessment";
import { formalThreads, weeklyRules, whatsappThreads } from "../../state/seedData";
import { useVirtualOS } from "../../state/VirtualOSContext";
import { getDoctorAppointmentTarget } from "../taskAnswerChecks";
import { checkRecordCriterion, filterRecordItems, formatFunctionalStepId, getAppCompetency, getAssessmentMetric, getCognitiveReportRows, getCompletedFunctionalStepIds, getCriterionDomain, getCriterionEvidenceDetail, getDischargeRelevantIndicators, getFunctionalCompletion, getScenarioForRecord, getTaskAnswerAccuracy, percentChange } from "./recordsMetrics";

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
  { id: "cueing", label: "Cueing required", evidence: "Highest prompt level needed after independent-first attempt." },
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
    add_event: "Added Calendar event",
    update_event: "Updated Calendar event",
    wa_reply: `Replied in WhatsApp: ${whatsappThreads.find((thread) => thread.id === entry.threadId)?.sender || entry.threadId}`,
    wa_confirm: `Confirmed WhatsApp plan: ${whatsappThreads.find((thread) => thread.id === entry.threadId)?.sender || entry.threadId}`,
    wa_friend_confirm: `Received WhatsApp confirmation: ${whatsappThreads.find((thread) => thread.id === entry.threadId)?.sender || entry.threadId}`,
    click: `Clicked ${entry.target || "screen"}`,
    input_focus: `Focused ${entry.target || "input"}`,
    typing_latency: `Started typing after ${formatDuration(entry.valueMs)}`,
    admin_cue: `Cue given: ${entry.text}`,
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [pendingMode, setPendingMode] = useState("learn");
  const [targetUserId, setTargetUserId] = useState("all");
  const [learnAppId, setLearnAppId] = useState(LEARN_APP_CATALOG[0].id);
  const [scenarioId, setScenarioId] = useState(SCENARIO_LIBRARY[0]?.id || "");
  const [assessmentScenarioId, setAssessmentScenarioId] = useState(SCENARIO_LIBRARY.find((scenario) => scenario.complexity === "Multi-app")?.id || SCENARIO_LIBRARY[0]?.id || "");
  const [newAlias, setNewAlias] = useState("");
  const [newPin, setNewPin] = useState("");
  const [modeConfirmText, setModeConfirmText] = useState("");

  const joinedPatients = state.session.participants.filter((p) => p.role === "patient");
  const selectedAccount = state.session.userAccounts.find((account) => account.id === selectedAccountId);
  const selectedParticipant = state.session.participants.find((participant) => participant.accountId === selectedAccountId);
  const fallbackParticipant = joinedPatients.length === 1 ? joinedPatients[0] : null;
  const fallbackAccount = fallbackParticipant
    ? state.session.userAccounts.find((account) => account.id === fallbackParticipant.accountId)
    : null;
  const modeTargetAccount = selectedAccount || fallbackAccount;
  const modeTargetParticipant = selectedParticipant || fallbackParticipant;
  const settingsMode = pendingMode;
  const metrics = state.interactionMetrics;
  const scoredItems = Object.values(state.checklistScores).filter((score) => score !== null).length;
  const averageTypingLatency = metrics.typingLatencySamples > 0 ? metrics.typingLatencyTotalMs / metrics.typingLatencySamples : null;
  const assessmentAccount = selectedAccount || fallbackAccount;
  const assessmentAccountId = assessmentAccount?.id;
  const assessmentMetrics = assessmentAccountId ? state.assessmentMetrics?.byAccount?.[assessmentAccountId] : null;
  const assessmentIdleMs = assessmentMetrics?.lastActionAt ? Date.now() - assessmentMetrics.lastActionAt : null;

  useEffect(() => {
    if (!selectedAccountId && fallbackAccount) {
      setSelectedAccountId(fallbackAccount.id);
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

  function confirmEndSession() {
    if (window.confirm("End this session for all joined users? They will have 30 seconds before the rating overlay appears.")) {
      markEvaluationCompleted();
    }
  }

  function pushPracticeScenario() {
    if (!scenarioId) return;
    pushScenario(scenarioId, targetUserId);
    openApp("home");
  }

  function pushAssessmentScenario() {
    if (!assessmentScenarioId) return;
    pushAssessment(assessmentScenarioId, targetUserId);
    openApp("home");
  }

  useEffect(() => {
    if (!assessmentAccountId || getAccountMode(state, assessmentAccount) !== "assessment" || !assessmentMetrics?.startedAt) {
      return;
    }
    if (assessmentIdleMs !== null && assessmentIdleMs >= 30000 && (!assessmentMetrics.lastStuckAlertAt || Date.now() - assessmentMetrics.lastStuckAlertAt >= 30000)) {
      trackAssessmentStuck(assessmentAccountId, assessmentIdleMs, selectedParticipant?.currentApp || state.currentApp);
    }
  }, [assessmentAccount, assessmentAccountId, assessmentIdleMs, assessmentMetrics?.lastStuckAlertAt, assessmentMetrics?.startedAt, selectedParticipant?.currentApp, state, state.currentMinutes, trackAssessmentStuck]);

  function startLearnModule() {
    const app = LEARN_APP_CATALOG.find((item) => item.id === learnAppId) || LEARN_APP_CATALOG[0];
    const targets = targetUserId === "all"
      ? state.session.participants.filter((participant) => participant.role === "patient").map((participant) => participant.accountId)
      : state.session.participants.some((participant) => participant.role === "patient" && participant.accountId === targetUserId)
        ? [targetUserId]
        : [];
    if (targets.length === 0) {
      return;
    }
    targets.filter(Boolean).forEach((accountId) => setLearnModule(accountId, app.currentApp));
    openApp(app.currentApp);
  }

  function confirmModeForSelectedUser() {
    if (!modeTargetAccount) {
      return;
    }
    setUserMode(modeTargetAccount.id, pendingMode);
    setModeConfirmText(`${SESSION_MODES.find((mode) => mode.id === pendingMode)?.label || pendingMode} mode sent to ${formatAlias(modeTargetAccount.alias)}.`);
  }

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
              const account = device ? state.session.userAccounts.find((item) => item.id === device.accountId) : null;
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
            <section className="admin-section session-actions-panel">
              <h3>Session Controls</h3>
              <button type="button" className="admin-danger" onClick={confirmEndSession} disabled={Boolean(state.session.completedAt)}>
                {state.session.completedAt ? "Session Ended" : "End Session"}
              </button>
            </section>

            <section className="admin-section selected-user-control">
              <h3>Mode</h3>
              <p className="admin-muted">
                {selectedAccount
                  ? `Selected: ${formatAlias(selectedAccount.alias)} | Current: ${selectedParticipant?.mode || state.session.userModes[selectedAccount.id] || state.session.mode}`
                  : fallbackAccount
                    ? `Selected: ${formatAlias(fallbackAccount.alias)} | Current: ${modeTargetParticipant?.mode || state.session.userModes[fallbackAccount.id] || state.session.mode}`
                    : "Tap a joined user on the live panel, then press ENTER to confirm the selected mode."}
              </p>
              <div className="mode-control large">
                {SESSION_MODES.map((mode) => (
                  <button key={mode.id} type="button" className={pendingMode === mode.id ? "active" : ""} onClick={() => setPendingMode(mode.id)}>
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
                ENTER
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
              userAccounts={state.session.userAccounts}
              startLearnModule={startLearnModule}
              pushPracticeScenario={pushPracticeScenario}
              assessmentScenarioId={assessmentScenarioId}
              setAssessmentScenarioId={setAssessmentScenarioId}
              pushAssessmentScenario={pushAssessmentScenario}
            />

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
            />
          </>
        )}
      </aside>
    </section>
  );
}

function ModeInterface({ mode }) {
  const content = {
    learn: ["Guided interface", "Highlights or cues should point the user to the safest correct option."],
    practice: ["Scenario practice", "Choose and push a Practice scenario below to start checklist and prompt support."],
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

function AccountSettings({ state, newAlias, newPin, setNewAlias, setNewPin, submitAccount, removeUserAccount }) {
  return (
    <section className="admin-section">
      <h3>De-identified User Accounts</h3>
      <div className="account-grid">
        {state.session.userAccounts.map((account) => (
          <div key={account.id}>
            <span><strong>{formatAlias(account.alias)}</strong><em>PIN {account.pin}</em></span>
            <button type="button" onClick={() => window.confirm(`Remove ${formatAlias(account.alias)} from this session?`) && removeUserAccount(account.id)}>Remove</button>
          </div>
        ))}
      </div>
      <form className="admin-inline-form" onSubmit={submitAccount}>
        <input value={newAlias} onChange={(event) => setNewAlias(event.target.value)} placeholder="Alias, e.g. Calm Panda" />
        <input value={newPin} onChange={(event) => setNewPin(event.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="4-digit PIN" inputMode="numeric" />
        <button type="submit">Add</button>
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
    <section className="admin-section learn-module-panel">
      <h3>Free Mode Settings</h3>
      <p className="admin-muted">Free mode is unrestricted exploration. No structured task is pushed.</p>
    </section>
  );
}

function LearnModuleControls({ learnAppId, setLearnAppId, targetUserId, setTargetUserId, userAccounts, startLearnModule }) {
  const selectedApp = LEARN_APP_CATALOG.find((app) => app.id === learnAppId) || LEARN_APP_CATALOG[0];
  return (
    <section className="admin-section learn-module-panel">
      <h3>Learn Mode Settings</h3>
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
            {userAccounts.map((account) => <option key={account.id} value={account.id}>{formatAlias(account.alias)}</option>)}
          </select>
        </label>
        <button type="button" className="admin-primary" onClick={startLearnModule}>Start Learn Module</button>
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
            {userAccounts.map((account) => <option key={account.id} value={account.id}>{formatAlias(account.alias)}</option>)}
          </select>
        </label>
        <button type="button" className="admin-primary" onClick={pushPracticeScenario}>Push Practice Scenario</button>
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
      <p className="admin-muted">Independent-first task. No Learn module and no Practice checklist are shown.</p>
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
            {userAccounts.map((account) => <option key={account.id} value={account.id}>{formatAlias(account.alias)}</option>)}
          </select>
        </label>
        <button type="button" className="admin-primary" onClick={pushAssessmentScenario}>Push Assessment</button>
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

function EvaluationPanel({ state, selectedAccount, setPracticeSupport, pushAssessmentPrompt }) {
  const selectedMode = getAccountMode(state, selectedAccount);
  if (selectedMode === "practice") {
    return <PracticeControlPanel state={state} selectedAccount={selectedAccount} setPracticeSupport={setPracticeSupport} />;
  }
  if (selectedMode === "assessment") {
    return <AssessmentControlPanel state={state} selectedAccount={selectedAccount} pushAssessmentPrompt={pushAssessmentPrompt} />;
  }
  if (selectedMode === "free") {
    return (
      <section className="admin-section practice-control-panel">
        <h3>Free Mode Monitoring</h3>
        <p className="admin-muted">Free mode has no task scoring. Monitor app use and spontaneous exploration from the live device panel.</p>
      </section>
    );
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
  const supportLabel = metrics.supportMode === "checklist" ? "Checklist visible" : "Checklist hidden / prompts";
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
        <div><span>Steps completed</span><strong>{completedSteps.length}</strong></div>
        <div><span>Prompts</span><strong>{metrics.promptCount || 0}</strong></div>
        <div><span>Highest prompt</span><strong>{metrics.highestPromptLevel || 0}</strong></div>
        <div><span>Wrong-step attempts</span><strong>{metrics.wrongStepAttempts || 0}</strong></div>
      </div>

      <div className="practice-admin-block">
        <h4>Checklist Support Controls</h4>
        <div className="practice-admin-actions">
          <button type="button" onClick={() => setSupport("checklist")} disabled={!accountId || !activeScenario}>Show checklist</button>
          <button type="button" onClick={() => setSupport("prompt")} disabled={!accountId || !activeScenario}>Hide checklist</button>
          <button type="button" onClick={() => setSupport("checklist", { newAttempt: true, resetSteps: true })} disabled={!accountId || !activeScenario}>Restart with checklist</button>
          <button type="button" onClick={() => setSupport("prompt", { newAttempt: true, resetSteps: true })} disabled={!accountId || !activeScenario}>Restart without checklist</button>
        </div>
      </div>

      <div className="practice-admin-block">
        <h4>Carryover Markers</h4>
        <p>Completed with checklist: <strong>{metrics.checklistCompleted ? "Yes" : "No"}</strong></p>
        <p>Completed without checklist: <strong>{metrics.hiddenCompleted ? "Yes" : "No"}</strong></p>
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
  if (c.includes("open family")) return { done: hasClickTarget(state, "family", accountId) || hasOpenedApp(state, "whatsapp", accountId), evidence: "Family/WhatsApp opened" };
  if (c.includes("doctor") || c.includes("read doctor") || c.includes("identify")) {
    return { done: hasClickTarget(state, "sms-doctor", accountId) || hasClickTarget(state, "doctor", accountId) || hasPsychiatryCalendarEntry(state, accountId), evidence: "Doctor appointment information accessed or used" };
  }
  if (c.includes("psychiatry") || c.includes("save appointment") || /\bset\s+\d{1,2}\s+[a-z]{3}/i.test(c) || c.includes("set 3:00")) {
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
      status: promptLevel === 0 ? "Independent so far" : `Level ${promptLevel}`,
      evidence: promptLevel === 0 ? "No therapist prompt used." : `${metrics.promptHistory?.length || 0} prompt${metrics.promptHistory?.length === 1 ? "" : "s"} pushed; highest level ${promptLevel}.`,
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
  const checklist = buildAssessmentChecklist(state, activeScenario, accountId);
  const completedChecklist = checklist.filter((item) => item.done).length;
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
        <h4>Assessment Checklist Capture</h4>
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
        <div><span>Highest prompt</span><strong>{metrics.highestPromptLevel || 0}</strong></div>
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

function PastRecords({ records }) {
  const [selectedAccountId, setSelectedAccountId] = useState("");
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
    .map(([accountId, items]) => ({ accountId, items: filterRecordItems([...items].sort((a, b) => b.completedAt - a.completedAt), filters) }))
    .filter((entry) => entry.items.length > 0);
  const selectedTimeline = accountTimelines.find((entry) => entry.accountId === selectedAccountId) || accountTimelines[0] || null;
  const selectedItems = selectedTimeline?.items || [];
  const latest = selectedItems[0];
  const first = selectedItems.at(-1);
  const latestCompletion = latest ? getFunctionalCompletion(latest) : null;
  const firstCompletion = first ? getFunctionalCompletion(first) : null;
  const latestAnswerAccuracy = latest ? getTaskAnswerAccuracy(latest) : null;
  const latestInitiation = latest ? getAssessmentMetric(latest, "timeToFirstActionMs") : null;
  const cognitiveRows = latest ? getCognitiveReportRows(latest, first || latest) : [];
  const dischargeIndicators = getDischargeRelevantIndicators(selectedItems);
  return (
    <section className="admin-section records-list report-card-records">
      <h3>Past Sessions: Patient Progress</h3>
      <div className="record-filter-row">
        <label><span>Mode</span><select value={filters.mode} onChange={(event) => setFilters((prev) => ({ ...prev, mode: event.target.value }))}><option value="all">All modes</option><option value="learn">Learn</option><option value="practice">Practice</option><option value="assessment">Assessment</option><option value="free">Free</option></select></label>
        <label><span>App</span><select value={filters.app} onChange={(event) => setFilters((prev) => ({ ...prev, app: event.target.value }))}><option value="all">All apps</option>{APP_CATALOG.map((app) => <option key={app.id} value={app.id}>{app.label}</option>)}</select></label>
        <label><span>Scenario</span><select value={filters.scenario} onChange={(event) => setFilters((prev) => ({ ...prev, scenario: event.target.value }))}><option value="all">All scenarios</option>{scenarios.map(([id, title]) => <option key={id} value={id}>{title}</option>)}</select></label>
      </div>
      {accountTimelines.length === 0 ? <p className="admin-muted">No matching progress records yet.</p> : (
        <>
          <div className="patient-report-tiles">
            {accountTimelines.map(({ accountId, items }) => {
              const item = items[0];
              const completion = getFunctionalCompletion(item);
              const initiation = getAssessmentMetric(item, "timeToFirstActionMs");
              const promptLevel = getAssessmentMetric(item, "highestPromptLevel");
              return (
                <button key={accountId} type="button" className={selectedTimeline?.accountId === accountId ? "selected" : ""} onClick={() => { setSelectedAccountId(accountId); setExpandedSessionId(""); }}>
                  <strong>{formatAlias(item.alias)}</strong>
                  <span>{items.length} matching session{items.length === 1 ? "" : "s"}</span>
                  <em>Latest: {item.mode}{item.attempt ? ` attempt ${item.attempt}` : ""} | {formatDate(item.completedAt)}</em>
                  <p>Functional completion <b>{completion ? `${completion.pct}%` : "-"}</b></p>
                  <p>Initiation <b>{formatDuration(initiation)}</b></p>
                  <p>Prompt level <b>{promptLevel || 0}</b></p>
                </button>
              );
            })}
          </div>

          {latest ? (
            <div className="patient-report-detail">
              <section className="report-panel functional">
                <h4>Functional Performance</h4>
                <div className="report-metric-grid">
                  <div><span>Latest task completion</span><strong>{latestCompletion ? `${latestCompletion.done}/${latestCompletion.total}` : "-"}</strong><em>{latestCompletion ? `${latestCompletion.pct}%` : "-"}</em></div>
                  <div><span>Change from first</span><strong>{percentChange(firstCompletion?.pct, latestCompletion?.pct)}</strong><em>Filtered sessions</em></div>
                  <div><span>Information answer accuracy</span><strong>{latestAnswerAccuracy ? `${latestAnswerAccuracy.correct}/${latestAnswerAccuracy.attempts}` : "-"}</strong><em>{latestAnswerAccuracy ? `${latestAnswerAccuracy.pct}%` : "No checked answers"}</em></div>
                </div>
                <div className="app-competency-list">
                  {APP_CATALOG.map((app) => {
                    const score = getAppCompetency(selectedItems, app.id);
                    return <div key={app.id}><span>{app.label}</span><strong>{score === null ? "No data" : `${score}% steps detected`}</strong></div>;
                  })}
                </div>
                <div className="session-completion-list">
                  <b>Scenario completion</b>
                  {selectedItems.map((item) => {
                    const completion = getFunctionalCompletion(item);
                    return <span key={item.id}>{item.scenarioTitle}: <strong>{completion ? `${completion.done}/${completion.total} (${completion.pct}%)` : "-"}</strong></span>;
                  })}
                </div>
                <div className="discharge-indicator-list">
                  <b>Discharge-relevant indicators</b>
                  {dischargeIndicators.map((indicator) => (
                    <div key={indicator.label} className={indicator.met === true ? "met" : indicator.met === false ? "not-met" : "neutral"}>
                      <span>{indicator.met === true ? "Observed" : indicator.met === false ? "Monitor" : "No data"}</span>
                      <strong>{indicator.label}: {indicator.value}</strong>
                      <em>{indicator.evidence}</em>
                    </div>
                  ))}
                </div>
              </section>

              <section className="report-panel cognitive">
                <h4>Cognitive Performance</h4>
                <div className="cognitive-report-list">
                  {cognitiveRows.map((row) => (
                    <div key={row.label}>
                      <span>{row.label}</span>
                      <strong>{row.format === "duration" ? formatDuration(row.display) : row.display}</strong>
                      <em>{row.change} | {row.evidence}</em>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          ) : null}

          <div className="individual-session-list">
            <h4>Individual Session Data</h4>
            {selectedItems.map((item) => {
              const completion = getFunctionalCompletion(item);
              const scenario = getScenarioForRecord(item);
              const expanded = expandedSessionId === item.id;
              return (
                <article key={item.id}>
                  <button type="button" onClick={() => setExpandedSessionId(expanded ? "" : item.id)}>
                    <strong>{formatDate(item.completedAt)} | {item.mode}{item.attempt ? ` attempt ${item.attempt}` : ""}</strong>
                    <span>{item.scenarioTitle}</span>
                    <em>{completion ? `${completion.done}/${completion.total} steps detected (${completion.pct}%)` : "No checklist available"}</em>
                  </button>
                  {expanded ? (
                    <div className="session-detail-drawer">
                      <div className="assessment-checklist-capture">
                        {(scenario.successCriteria || []).map((criterion) => {
                          const done = checkRecordCriterion(item, criterion);
                          return <div key={criterion} className={done ? "done" : ""}><span>{done ? "OK" : ""}</span><strong>{criterion}</strong><em>{getCriterionEvidenceDetail(item, criterion)}</em></div>;
                        })}
                      </div>
                      <div className="assessment-checklist-capture">
                        <b>Observed functional step trace</b>
                        {getCompletedFunctionalStepIds(item).length > 0 ? getCompletedFunctionalStepIds(item).map((stepId) => (
                          <div key={stepId} className="done"><span>OK</span><strong>{formatFunctionalStepId(stepId)}</strong><em>Captured from practice or assessment interaction evidence.</em></div>
                        )) : <div><span></span><strong>No step trace captured</strong><em>Use scenario criteria and raw metrics above for interpretation.</em></div>}
                      </div>
                      <div className="report-metric-grid">
                        <div><span>Time to first action</span><strong>{formatDuration(getAssessmentMetric(item, "timeToFirstActionMs"))}</strong></div>
                        <div><span>Avg action interval</span><strong>{formatDuration(getAssessmentMetric(item, "avgActionInterval"))}</strong></div>
                        <div><span>Highest prompt</span><strong>{getAssessmentMetric(item, "highestPromptLevel") || 0}</strong></div>
                        <div><span>Stuck alerts</span><strong>{getAssessmentMetric(item, "stuckAlerts") || 0}</strong></div>
                        <div><span>Context switches</span><strong>{item.metrics?.contextSwitches ?? "-"}</strong></div>
                        <div><span>Recent apps button</span><strong>{item.metrics?.recentPresses ?? "-"}</strong></div>
                        <div><span>Answer accuracy</span><strong>{getTaskAnswerAccuracy(item) ? `${getTaskAnswerAccuracy(item).correct}/${getTaskAnswerAccuracy(item).attempts}` : "-"}</strong></div>
                        <div><span>Calendar entries</span><strong>{item.taskEvidence?.calendar?.manualEntries ?? 0}</strong></div>
                        <div><span>Experience rating</span><strong>{item.experienceRating ? `${item.experienceRating}/5` : "-"}</strong></div>
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
