import { useEffect, useMemo, useRef, useState } from "react";
import { APP_CATALOG } from "../../state/v2Assessment";
import { weeklyRules } from "../../state/seedData";
import { useVirtualOS } from "../../state/VirtualOSContext";
import { getDoctorAppointmentTarget } from "../taskAnswerChecks";
import { clearAllWhatsAppStorage } from "../whatsapp/whatsappSession";

const DOCTOR_APPOINTMENT_TARGET = getDoctorAppointmentTarget();

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

export function SettingsApp() {
  const { state, helpers, resetEvaluation, markEvaluationCompleted } = useVirtualOS();
  const containerRef = useRef(null);
  const [atBottom, setAtBottom] = useState(false);

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
  const currentMode = state.session.userModes[state.session.currentUserId] || state.session.mode;
  const learn = state.learnMetrics || {};
  const attempts = learn.attempts || { correct: 0, total: 0 };
  const activeLearnApps = new Set(Object.values(state.session.learnModules || {}));

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
