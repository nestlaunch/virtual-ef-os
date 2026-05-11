import { useEffect, useMemo, useRef, useState } from "react";
import { weeklyRules } from "../../state/seedData";
import { useVirtualOS } from "../../state/VirtualOSContext";

const WA_STORAGE_KEY = "virtual-os-whatsapp-state-v1";

function fmtTime(minutes) {
  const h = String(Math.floor((minutes ?? 0) / 60)).padStart(2, "0");
  const m = String((minutes ?? 0) % 60).padStart(2, "0");
  return `${h}:${m}`;
}

function text(v) {
  return String(v || "").toLowerCase();
}

function titleHasAny(event, keywords) {
  const t = text(event.title);
  return keywords.some((kw) => t.includes(kw));
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

function isExactMatch(event, target) {
  const sameDate = event.date === target.date
    && (event.month ?? 2) === target.month
    && (event.year ?? 2026) === target.year;
  if (!sameDate) {
    return false;
  }
  return Math.abs((event.start ?? 0) - target.start) <= 30;
}

function hasLocationErrorMatch(event, target) {
  const sameDate = event.date === target.date
    && (event.month ?? 2) === target.month
    && (event.year ?? 2026) === target.year;
  const sameTime = Math.abs((event.start ?? 0) - target.start) <= 30;

  if (sameDate && !sameTime) {
    return true;
  }

  if (!sameDate && sameTime) {
    return true;
  }

  return false;
}

function evaluateFixedAppointment(events, target, keywords) {
  if (!target) {
    return { status: "pending", evidence: "Missing target" };
  }

  const exact = events.find((event) => isExactMatch(event, target));
  if (exact) {
    return {
      status: "ok",
      evidence: `Matched ${exact.date}/${(exact.month ?? 2) + 1}/${exact.year ?? 2026} ${fmtTime(exact.start)}`,
    };
  }

  const related = events.filter((event) => titleHasAny(event, keywords));
  if (related.length > 0) {
    const sample = related[0];
    return {
      status: "error",
      evidence: `Found related entry (${sample.title}) at ${sample.date}/${(sample.month ?? 2) + 1}/${sample.year ?? 2026} ${fmtTime(sample.start)} but date/time mismatch`,
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
      evidence: `Matched ${valid.title} at ${valid.date}/${(valid.month ?? 2) + 1}/${valid.year ?? 2026} ${fmtTime(valid.start)}`,
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

export function SettingsApp() {
  const { state, helpers, resetEvaluation, markEvaluationCompleted } = useVirtualOS();
  const containerRef = useRef(null);
  const [atBottom, setAtBottom] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
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

  const doctorAppt = helpers.rigidAppointments.find((a) => a.id === "sms-doctor-main");
  const polyAppt = helpers.rigidAppointments.find((a) => a.id === "sms-polyclinic-main");

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
      task: "WhatsApp: Friend confirmed meeting (Jia Wei)",
      status: state.metrics.whatsappFriendConfirmed["jia-wei"] ? "ok" : "pending",
      evidence: state.metrics.whatsappFriendConfirmed["jia-wei"] ? "Detected friend acknowledgment (e.g., 'See you then')" : "Not detected",
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
    const targets = helpers.rigidAppointments.filter((a) => a.id === "sms-doctor-main" || a.id === "sms-polyclinic-main");
    return buildAccuracyMetrics(state.events, targets);
  }, [state.events, helpers.rigidAppointments]);

  const now = Date.now();
  const totalTimeMs = state.session.completedAt ? state.session.completedAt - state.session.startedAt : null;
  const planningTimeMs = state.session.firstEntryAt ? state.session.firstEntryAt - state.session.startedAt : null;
  const activeDurationMs = now - state.session.startedAt;

  function handleReset() {
    if (!atBottom) {
      return;
    }
    const confirmed = window.confirm("Reset evaluation data and restart this assessment session?");
    if (!confirmed) {
      return;
    }
    try {
      window.localStorage.removeItem(WA_STORAGE_KEY);
    } catch {
      // Ignore storage failures during reset.
    }
    resetEvaluation();
    window.dispatchEvent(new CustomEvent("virtual-os-reset-evaluation"));
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
        <h3>Therapist Task Checklist</h3>
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
        <p>WhatsApp replies tracked: {Object.values(state.metrics.whatsappReplies).reduce((a, b) => a + b, 0)}</p>
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
