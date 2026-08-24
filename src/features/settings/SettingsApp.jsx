import { useEffect, useMemo, useRef, useState } from "react";
import { APP_CATALOG, LEARN_APP_CATALOG, SCENARIO_LIBRARY, SESSION_MODES } from "../../state/v2Assessment";
import { weeklyRules } from "../../state/seedData";
import { useVirtualOS } from "../../state/VirtualOSContext";
import { getDoctorAppointmentTarget } from "../taskAnswerChecks";
import { clearAllWhatsAppStorage } from "../whatsapp/whatsappSession";

const DOCTOR_APPOINTMENT_TARGET = getDoctorAppointmentTarget();

function ConnectivitySettingsEntry({ state, onOpen }) {
  const connection = state.connectivity;
  const summary = connection.airplaneMode
    ? "Airplane mode"
    : connection.connectedNetwork?.name
      || (connection.mobileDataEnabled ? "Mobile data on" : "Offline");
  return (
    <section className="settings-connectivity-entry" aria-label="Connectivity settings">
      <button type="button" onClick={() => onOpen("overview")}>
        <span className="settings-connectivity-icon">◔</span>
        <span><strong>Network & internet</strong><small>{summary}</small></span>
        <em>›</em>
      </button>
    </section>
  );
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

function formatDuration(ms) {
  if (typeof ms !== "number" || ms < 0) {
    return "-";
  }
  const totalSeconds = Math.floor(ms / 1000);
  const min = Math.floor(totalSeconds / 60);
  const sec = totalSeconds % 60;
  return `${min}m ${sec}s`;
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
  return APP_CATALOG.reduce((sum, app) => sum + getLearnAppTime(learn, app.currentApp, activeLearnApps, now), 0);
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
      evidence: `Matched ${valid.title} at ${valid.date}/${(valid.month ?? DOCTOR_APPOINTMENT_TARGET.month) + 1}/${valid.year ?? DOCTOR_APPOINTMENT_TARGET.year} ${fmtTime(valid.start)}`,
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

function eventBelongsToAccount(event, accountId) {
  return !accountId || !event.accountId || event.accountId === accountId;
}

function countUserWhatsappReplies(state, accountId, threadId) {
  return state.hiddenLog.filter((entry) => (
    entry.kind === "wa_reply"
    && entry.threadId === threadId
    && (!accountId || !entry.accountId || entry.accountId === accountId)
  )).length;
}

function hasUserWhatsappConfirmation(state, accountId, threadId) {
  return state.hiddenLog.some((entry) => (
    entry.kind === "wa_friend_confirm"
    && entry.threadId === threadId
    && (!accountId || !entry.accountId || entry.accountId === accountId)
  ));
}

const SETTINGS_GROUPS = [
  [
    { id: "network", icon: "N", label: "Network & internet", detail: "Wi-Fi, mobile data, airplane mode" },
    { id: "devices", icon: "D", label: "Connected devices", detail: "Bluetooth and connection preferences" },
  ],
  [
    { id: "apps", icon: "A", label: "Apps", detail: "Recent apps and permissions" },
    { id: "notifications", icon: "!", label: "Notifications", detail: "Notification history and controls" },
    { id: "battery", icon: "B", label: "Battery", detail: "61% · About 1 day left" },
    { id: "storage", icon: "S", label: "Storage", detail: "24 GB used" },
  ],
  [
    { id: "sound", icon: "V", label: "Sound & vibration", detail: "Volume, vibrate, Do Not Disturb" },
    { id: "display", icon: "O", label: "Display", detail: "Brightness, text size, dark theme" },
    { id: "accessibility", icon: "+", label: "Accessibility", detail: "Text, display and interaction controls" },
  ],
  [
    { id: "security", icon: "L", label: "Security & privacy", detail: "Screen lock, permissions and updates" },
    { id: "accounts", icon: "P", label: "Passwords & accounts", detail: "Saved training accounts" },
    { id: "system", icon: "G", label: "System", detail: "Languages, time, backup and reset" },
    { id: "about", icon: "i", label: "About phone", detail: "Daily Digital Phone" },
  ],
];

export function SettingsApp() {
  const { state, openConnectivity } = useVirtualOS();
  const [page, setPage] = useState("main");
  const [modelTaps, setModelTaps] = useState(0);

  useEffect(() => {
    function onBack(event) {
      if (page !== "main") {
        event.preventDefault();
        setPage(page === "tracker" ? "about" : "main");
      }
    }
    window.addEventListener("virtual-os-back", onBack);
    return () => window.removeEventListener("virtual-os-back", onBack);
  }, [page]);

  function openItem(id) {
    if (id === "network") {
      openConnectivity("overview");
      return;
    }
    if (id === "about") setPage("about");
  }

  function tapModelNumber() {
    setModelTaps((count) => {
      const next = count + 1;
      if (next >= 5) {
        setPage("tracker");
        return 0;
      }
      return next;
    });
  }

  if (page === "tracker") {
    return <div className="settings-tracker-shell"><button type="button" className="settings-internal-back" onClick={() => setPage("about")}>‹ About phone</button><EvaluationSettings /></div>;
  }

  if (page === "about") {
    return <div className="settings-app settings-real-app"><header className="settings-real-header"><button type="button" onClick={() => setPage("main")} aria-label="Back to Settings">‹</button><h2>About phone</h2></header><section className="about-device-card"><span>DD</span><strong>Daily Digital Phone</strong><small>Training simulation device</small></section><section className="settings-real-group about-list"><div><span>Device name</span><strong>Daily Digital Phone</strong></div><div><span>Phone number</span><strong>Not available</strong></div><div><span>Android version</span><strong>14 · simulated</strong></div><button type="button" onClick={tapModelNumber}><span>Model number</span><strong>DD-OT-01</strong></button><div><span>Build number</span><strong>DailyDigital.2026.07</strong></div></section><p className="settings-about-note">All device and account information shown here is fictional.</p></div>;
  }

  return <div className="settings-app settings-real-app"><header className="settings-real-title"><h2>Settings</h2></header><label className="settings-search"><span>⌕</span><input aria-label="Search settings" placeholder="Search settings" /></label>{SETTINGS_GROUPS.map((group, index) => <section className="settings-real-group" key={index}>{group.map((item) => <button type="button" key={item.id} onClick={() => openItem(item.id)}><span className="settings-real-icon">{item.icon}</span><span><strong>{item.label}</strong><small>{item.id === "network" ? state.connectivity.connectedNetwork?.name || (state.connectivity.mobileDataEnabled ? "Mobile data on" : "Offline") : item.detail}</small></span><em>›</em></button>)}</section>)}</div>;
}

function EvaluationSettings() {
  const { state, helpers, resetEvaluation, markEvaluationCompleted, startLocalMode } = useVirtualOS();
  const containerRef = useRef(null);
  const [atBottom, setAtBottom] = useState(false);
  const currentMode = state.session.userModes[state.session.currentUserId] || state.session.mode;
  const scenarioOptions = SCENARIO_LIBRARY.filter((scenario) => scenario.id && scenario.title);
  const activeAssignment = currentMode === "practice" || currentMode === "assessment"
    ? state.session.assignments?.[state.session.currentUserId]?.filter((item) => item.mode === currentMode).at(-1)
    : null;
  const activeScenarioId = activeAssignment?.scenarioId || state.workspace?.localSetup?.scenarioId || scenarioOptions[0]?.id || "";
  const activeLearnApp = state.session.learnModules?.[state.session.currentUserId] || state.workspace?.localSetup?.app || LEARN_APP_CATALOG[0]?.currentApp || "home";
  const [quickMode, setQuickMode] = useState(currentMode || "practice");
  const [quickScenarioId, setQuickScenarioId] = useState(activeScenarioId);
  const [quickLearnApp, setQuickLearnApp] = useState(activeLearnApp);

  useEffect(() => {
    setQuickMode(currentMode || "practice");
    setQuickScenarioId(activeScenarioId);
    setQuickLearnApp(activeLearnApp);
  }, [activeLearnApp, activeScenarioId, currentMode]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return undefined;
    }

    const onScroll = () => {
      const threshold = 6;
      const reached = el.scrollTop + el.clientHeight >= el.scrollHeight - threshold;
      setAtBottom(reached || el.scrollHeight <= el.clientHeight + threshold);
    };

    onScroll();
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const doctorAppt = helpers.rigidAppointments.find((appointment) => appointment.id === "sms-doctor-main");
  const polyAppt = helpers.rigidAppointments.find((appointment) => appointment.id === "sms-polyclinic-main");
  const currentUserId = state.session.currentUserId;
  const visibleEvents = useMemo(() => (
    state.events.filter((event) => eventBelongsToAccount(event, currentUserId))
  ), [state.events, currentUserId]);

  const jiaReplyCount = countUserWhatsappReplies(state, currentUserId, "jia-wei");
  const nadiahReplyCount = countUserWhatsappReplies(state, currentUserId, "nadiah");

  const doctorEval = evaluateFixedAppointment(visibleEvents, doctorAppt, ["doctor", "psy", "psychiatry", "clinic b"]);
  const polyEval = evaluateFixedAppointment(visibleEvents, polyAppt, ["poly", "polyclinic"]);
  const jiaEventEval = evaluateFriendTask(
    visibleEvents,
    ["jia", "wei"],
    (event) => (event.start ?? 0) >= 15 * 60,
    "Expected: Jia Wei meeting entered with afternoon timing (>=15:00)"
  );
  const nadiahEventEval = evaluateFriendTask(
    visibleEvents,
    ["nadiah"],
    (event) => (event.start ?? 0) >= 15 * 60,
    "Expected: Nadiah meeting entered after 15:00"
  );
  const familyDinnerEval = evaluateFriendTask(
    visibleEvents,
    ["family", "dinner"],
    (event) => (event.start ?? 0) >= 18 * 60 + 30,
    "Expected: Family dinner entered in evening (>=18:30)"
  );

  const checks = [
    {
      task: "Calendar: Psychiatry appointment entered",
      status: doctorEval.status,
      evidence: doctorEval.evidence,
    },
    {
      task: "Calendar: Polyclinic appointment entered",
      status: polyEval.status,
      evidence: polyEval.evidence,
    },
    {
      task: "WhatsApp: Replied to Jia Wei",
      status: jiaReplyCount > 0 ? "ok" : "pending",
      evidence: `Replies: ${jiaReplyCount}`,
    },
    {
      task: "WhatsApp: Replied to Nadiah",
      status: nadiahReplyCount > 0 ? "ok" : "pending",
      evidence: `Replies: ${nadiahReplyCount}`,
    },
    {
      task: "WhatsApp: Contact confirmed meeting with Jia Wei",
      status: hasUserWhatsappConfirmation(state, currentUserId, "jia-wei") ? "ok" : "pending",
      evidence: hasUserWhatsappConfirmation(state, currentUserId, "jia-wei")
        ? "Detected contact acknowledgement"
        : "Not detected",
    },
    {
      task: "Calendar: Friend appointment from Jia Wei chat entered",
      status: jiaEventEval.status,
      evidence: jiaEventEval.evidence,
    },
    {
      task: "Calendar: Friend appointment from Nadiah chat entered",
      status: nadiahEventEval.status,
      evidence: nadiahEventEval.evidence,
    },
    {
      task: "Calendar: Family dinner appointment entered",
      status: familyDinnerEval.status,
      evidence: familyDinnerEval.evidence,
    },
  ];

  const accuracy = useMemo(() => {
    const targets = helpers.rigidAppointments.filter((appointment) => (
      appointment.id === "sms-doctor-main" || appointment.id === "sms-polyclinic-main"
    ));
    return buildAccuracyMetrics(visibleEvents, targets);
  }, [visibleEvents, helpers.rigidAppointments]);

  const now = Date.now();
  const totalTimeMs = state.session.completedAt ? state.session.completedAt - state.session.startedAt : null;
  const planningTimeMs = state.session.firstEntryAt ? state.session.firstEntryAt - state.session.startedAt : null;
  const activeDurationMs = now - state.session.startedAt;
  const learn = state.learnMetrics || {};
  const attempts = learn.attempts || { correct: 0, total: 0 };
  const activeLearnApps = new Set(Object.values(state.session.learnModules || {}));
  const isLocalMode = state.workspace?.mode === "local";
  const quickModeDefinition = SESSION_MODES.find((item) => item.id === quickMode) || SESSION_MODES[0];
  const quickScenario = scenarioOptions.find((scenario) => scenario.id === quickScenarioId) || scenarioOptions[0];
  const canApplyQuickChange = quickMode === "learn"
    ? Boolean(quickLearnApp)
    : quickMode === "practice" || quickMode === "assessment"
      ? Boolean(quickScenarioId)
      : true;

  function applyQuickScenarioChange(event) {
    event.preventDefault();
    if (!canApplyQuickChange) {
      return;
    }
    const nextOptions = {
      mode: quickMode,
      scenarioId: quickMode === "practice" || quickMode === "assessment" ? quickScenarioId : "",
      app: quickMode === "learn" ? quickLearnApp : "",
      currentApp: "settings",
    };
    startLocalMode(nextOptions);
  }

  function handleReset() {
    if (!atBottom) {
      return;
    }
    const confirmed = window.confirm("Reset evaluation data and restart this assessment session?");
    if (!confirmed) {
      return;
    }
    try {
      clearAllWhatsAppStorage(window.localStorage);
    } catch {
      // Ignore storage failures during reset.
    }
    resetEvaluation();
    window.dispatchEvent(new CustomEvent("virtual-os-reset-evaluation"));
  }

  if (currentMode === "learn") {
    return (
      <div className="settings-app" ref={containerRef}>
        <h2>Learn Evaluation</h2>
        {isLocalMode ? (
          <QuickScenarioSettings
            mode={quickMode}
            setMode={setQuickMode}
            scenarioId={quickScenarioId}
            setScenarioId={setQuickScenarioId}
            learnApp={quickLearnApp}
            setLearnApp={setQuickLearnApp}
            modeDefinition={quickModeDefinition}
            selectedScenario={quickScenario}
            canApply={canApplyQuickChange}
            onApply={applyQuickScenarioChange}
          />
        ) : null}
        <section className="learn-evaluation-panel">
          <h3>Learning Outcomes</h3>
          <div className="learn-eval-summary">
            <div><span>Modules completed</span><strong>{learn.modulesCompleted || 0}</strong></div>
            <div><span>Time spent on modules</span><strong>{formatDuration(getLearnTotalTime(learn, activeLearnApps, now))}</strong></div>
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
            {APP_CATALOG.map((app) => {
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
        <section className="reset-eval-wrap">
          <p>{atBottom ? "Reset is enabled." : "Scroll to the bottom to enable reset."}</p>
          <button type="button" disabled={!atBottom} className="reset-eval-btn" onClick={handleReset}>
            Restart Evaluation
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className="settings-app" ref={containerRef}>
      <h2>Evaluation</h2>
      {isLocalMode ? (
        <QuickScenarioSettings
          mode={quickMode}
          setMode={setQuickMode}
          scenarioId={quickScenarioId}
          setScenarioId={setQuickScenarioId}
          learnApp={quickLearnApp}
          setLearnApp={setQuickLearnApp}
          modeDefinition={quickModeDefinition}
          selectedScenario={quickScenario}
          canApply={canApplyQuickChange}
          onApply={applyQuickScenarioChange}
        />
      ) : null}
      <section>
        <h3>Weekly Constraints</h3>
        <ul>
          {weeklyRules.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      </section>

      <section className="eval-table-wrap">
        <h3>Admin Task Checklist</h3>
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
                <td className={row.status}>{row.status === "ok" ? "Completed" : row.status === "error" ? "Error" : "Pending"}</td>
                <td>{row.evidence}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="eval-table-wrap">
        <h3>1. Performance Accuracy (The What)</h3>
        <table className="eval-table">
          <tbody>
            <tr><td>Number of Appointments Entered</td><td>{accuracy.totalEntered}</td></tr>
            <tr><td>Accuracy Score</td><td>{accuracy.accuracyScore} / {accuracy.accuracyTotal}</td></tr>
            <tr><td>Location Errors</td><td>{accuracy.locationErrors}</td></tr>
            <tr><td>Omission Errors</td><td>{accuracy.omissionErrors}</td></tr>
            <tr><td>Incomplete Errors</td><td>{accuracy.incompleteErrors}</td></tr>
          </tbody>
        </table>
      </section>

      <section className="eval-table-wrap">
        <h3>2. Efficiency & Time Management (The How Fast)</h3>
        <table className="eval-table">
          <tbody>
            <tr><td>Total Time</td><td>{totalTimeMs === null ? "Not signaled" : formatDuration(totalTimeMs)}</td></tr>
            <tr><td>Planning Time</td><td>{planningTimeMs === null ? "No entry yet" : formatDuration(planningTimeMs)}</td></tr>
            <tr><td>Current Session Elapsed</td><td>{formatDuration(activeDurationMs)}</td></tr>
          </tbody>
        </table>
        <button
          type="button"
          className="reset-eval-btn"
          onClick={markEvaluationCompleted}
          disabled={Boolean(state.session.completedAt)}
        >
          {state.session.completedAt ? "Completion Signaled" : "Signal Completion"}
        </button>
      </section>

      <section className="metrics-box">
        <h3>EF Logger (Hidden)</h3>
        <p>Omission errors: {state.metrics.omissionErrors}</p>
        <p>Perseveration: {state.metrics.perseveration}</p>
        <p>Rule breaking: {state.metrics.ruleBreaking}</p>
        <p>Context switches: {state.metrics.contextSwitches}</p>
        <p>WhatsApp replies tracked: {Object.values(state.metrics.whatsappReplies).reduce((sum, count) => sum + count, 0)}</p>
      </section>

      <section className="reset-eval-wrap">
        <p>{atBottom ? "Reset is enabled." : "Scroll to the bottom to enable reset."}</p>
        <button type="button" disabled={!atBottom} className="reset-eval-btn" onClick={handleReset}>
          Restart Evaluation
        </button>
      </section>
    </div>
  );
}

function QuickScenarioSettings({
  mode,
  setMode,
  scenarioId,
  setScenarioId,
  learnApp,
  setLearnApp,
  modeDefinition,
  selectedScenario,
  canApply,
  onApply,
}) {
  const needsScenario = mode === "practice" || mode === "assessment";

  return (
    <section className="quick-scenario-settings">
      <div className="quick-scenario-heading">
        <div>
          <h3>Change Scenario</h3>
          <p>Switch the local task without returning to the main page.</p>
        </div>
      </div>
      <form onSubmit={onApply}>
        <label>
          <span>Mode</span>
          <select value={mode} onChange={(event) => setMode(event.target.value)}>
            {SESSION_MODES.map((item) => (
              <option key={item.id} value={item.id}>{item.label}</option>
            ))}
          </select>
        </label>

        {mode === "learn" ? (
          <label>
            <span>Module</span>
            <select value={learnApp} onChange={(event) => setLearnApp(event.target.value)}>
              {LEARN_APP_CATALOG.map((app) => (
                <option key={app.id} value={app.currentApp}>{app.label}</option>
              ))}
            </select>
          </label>
        ) : null}

        {needsScenario ? (
          <label>
            <span>Scenario</span>
            <select value={scenarioId} onChange={(event) => setScenarioId(event.target.value)}>
              {SCENARIO_LIBRARY.map((scenario) => (
                <option key={scenario.id} value={scenario.id}>{scenario.title}</option>
              ))}
            </select>
          </label>
        ) : (
          <div className="quick-scenario-summary">
            <strong>{modeDefinition?.label || "Free"}</strong>
            <p>{modeDefinition?.description || "Interactions will still be logged."}</p>
          </div>
        )}

        {needsScenario && selectedScenario ? (
          <div className="quick-scenario-summary">
            <strong>{selectedScenario.title}</strong>
            <p>{selectedScenario.description}</p>
          </div>
        ) : null}

        <button type="submit" disabled={!canApply}>
          Apply Scenario
        </button>
      </form>
    </section>
  );
}
