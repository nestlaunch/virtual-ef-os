import { useEffect, useMemo, useRef, useState } from "react";
import { getCurrentAssignment } from "../../state/sessionLifecycle";
import { SCENARIO_LIBRARY } from "../../state/v2Assessment";
import { useVirtualOS } from "../../state/VirtualOSContext";
import { isCorrectLearnAnswer } from "../learn/answerMatching";
import { GuideCursor, getGuideTargetSelectors } from "../system/GuideCursor";
import { TASK_ANSWER_CHECKS } from "../taskAnswerChecks";
import { completedStepsMap, firstIncompleteIndex, getDetectedPracticeStep, shouldCountPracticeMiss } from "./practiceProgress";
import { buildPracticeGuide, flattenGuideSteps, getActivePracticePage } from "./practiceGuideUtils";
import { APP_LABELS, COMPLETE_EVENTS, PRACTICE_GUIDES, PRACTICE_PAGE_OVERRIDES } from "./practiceGuides";

const MAX_ASSISTANCE_LEVEL = 5;
const ASSISTANCE_LABELS = [
  "Independent attempt",
  "Repeat the goal",
  "Simplify the next step",
  "Identify the area",
  "Highlight the control",
  "Demonstrate the next action",
];

function getEffectiveMode(state) {
  return state.session.currentUserId
    ? state.session.userModes[state.session.currentUserId] || state.session.mode
    : state.session.mode;
}

function getActiveAssignment(state) {
  return state.session.currentUserId
    ? getCurrentAssignment(state.session, state.session.currentUserId, "practice")
    : null;
}

function getActiveScenario(state) {
  const assignment = getActiveAssignment(state);
  return assignment ? SCENARIO_LIBRARY.find((scenario) => scenario.id === assignment.scenarioId) || null : null;
}

function getAnswerCheckIdForStep(step) {
  return Object.values(TASK_ANSWER_CHECKS).find((check) => (
    check.id === step?.answerCheckId
    || check.practiceStepIds?.includes(step?.id)
    || check.answers === step?.answers
  ))?.id || "";
}

function getAssistanceText(level, activeStep, guide, activePage) {
  if (level <= 0) return "";
  if (level === 1) return guide?.purpose || activeStep?.label || "Review the task goal.";
  if (level === 2) return activeStep?.prompts?.[0] || `Next: ${activeStep?.label || "continue the task"}.`;
  if (level === 3) {
    const app = activePage?.app ? APP_LABELS[activePage.app] || activePage.app : "the phone";
    return activeStep?.prompts?.[1] || `Look in ${app} for the next step.`;
  }
  if (level === 4) return activeStep?.prompts?.[2] || "The relevant control is now highlighted.";
  return `Watch the highlighted control, then select it to: ${activeStep?.label || "continue"}.`;
}

export function PracticeGuidePanel() {
  const {
    state,
    goHome,
    setPracticeSupport,
    trackPracticeStep,
    trackPracticePrompt,
    trackPracticeWrongStep,
    trackPracticeAnswer,
  } = useVirtualOS();
  const mode = getEffectiveMode(state);
  const activeAssignment = getActiveAssignment(state);
  const activeScenario = getActiveScenario(state);
  const appGuide = PRACTICE_GUIDES[state.currentApp];
  const guide = buildPracticeGuide(activeScenario, appGuide, PRACTICE_PAGE_OVERRIDES);
  const userId = state.session.currentUserId;
  const sharedMetrics = userId ? state.practiceMetrics?.byAccount?.[userId] : null;
  const completed = useMemo(() => completedStepsMap(sharedMetrics?.completedSteps || []), [sharedMetrics?.completedSteps]);
  const guidedAttempt = (sharedMetrics?.supportMode || "checklist") === "checklist";
  const attempt = sharedMetrics?.attempt || 1;
  const [phase, setPhase] = useState("preview");
  const [assistanceLevel, setAssistanceLevel] = useState(0);
  const [answerValue, setAnswerValue] = useState("");
  const [answerStatus, setAnswerStatus] = useState(null);
  const [recoveryMessage, setRecoveryMessage] = useState("");
  const [blockedMessage, setBlockedMessage] = useState("");
  const cardRef = useRef(null);
  const allSteps = useMemo(() => flattenGuideSteps(guide), [guide]);
  const { page: activePage } = useMemo(
    () => getActivePracticePage(guide, completed, state.currentApp),
    [completed, guide, state.currentApp]
  );
  const completedCount = useMemo(() => allSteps.filter((step) => completed[step.id]).length, [allSteps, completed]);
  const isComplete = Boolean(guide && allSteps.length > 0 && completedCount === allSteps.length);
  const activeStepIndex = allSteps.length ? firstIncompleteIndex(allSteps, completed) : 0;
  const activeStep = allSteps[activeStepIndex];
  const assistanceText = getAssistanceText(assistanceLevel, activeStep, guide, activePage);
  const showOneStep = guidedAttempt || assistanceLevel >= 2;

  useEffect(() => {
    setPhase("preview");
    setAssistanceLevel(0);
    setRecoveryMessage("");
    setBlockedMessage("");
  }, [activeAssignment?.id]);

  useEffect(() => {
    setAnswerValue("");
    setAnswerStatus(null);
    setAssistanceLevel(0);
    setRecoveryMessage("");
  }, [activeStep?.id, activeScenario?.id, attempt]);

  useEffect(() => {
    if (isComplete) {
      setPhase("review");
    }
  }, [isComplete]);

  useEffect(() => {
    function onBlocked(event) {
      if (phase === "preview" || phase === "review") {
        setBlockedMessage(event.detail?.message || "Use the task card before using the phone.");
      }
    }
    window.addEventListener("virtual-os-phone-action-blocked", onBlocked);
    return () => window.removeEventListener("virtual-os-phone-action-blocked", onBlocked);
  }, [phase]);

  function completePracticeStep(step) {
    if (!step || completed[step.id]) return;
    const nextCompleted = new Set(Object.keys(completed).filter((stepId) => completed[stepId]));
    nextCompleted.add(step.id);
    const nextComplete = allSteps.length > 0 && allSteps.every((item) => nextCompleted.has(item.id));
    trackPracticeStep(step.id, nextComplete);
    setAnswerValue("");
    setAnswerStatus(null);
    setAssistanceLevel(0);
    setRecoveryMessage("");
  }

  useEffect(() => {
    if (mode !== "practice" || phase !== "task" || !guide || !activeScenario) return;
    const detectedStep = getDetectedPracticeStep(allSteps, completed, { type: "app", app: state.currentApp });
    if (detectedStep) completePracticeStep(detectedStep);
  }, [activeScenario, allSteps, completed, guide, mode, phase, state.currentApp, trackPracticeStep]);

  useEffect(() => {
    if (mode !== "practice" || phase !== "task" || !guide || !activeScenario) return undefined;
    function applyEvent(eventLike) {
      const nextStep = allSteps[firstIncompleteIndex(allSteps, completed)];
      if (!nextStep || completed[nextStep.id]) return;
      const detectedStep = getDetectedPracticeStep(allSteps, completed, eventLike);
      if (detectedStep) {
        completePracticeStep(detectedStep);
      } else if (shouldCountPracticeMiss(nextStep, eventLike)) {
        trackPracticeWrongStep();
        const expectedApp = activePage?.app ? APP_LABELS[activePage.app] || activePage.app : "the task screen";
        const nextAction = nextStep.label || "continue the task";
        setRecoveryMessage(`That opened a different area. Return to ${expectedApp} to ${nextAction.toLowerCase()}. You can try again when you are ready.`);
      }
    }
    function onAction(event) {
      applyEvent({ type: event.detail?.eventType, target: event.detail?.target, detail: event.detail });
    }
    function onComplete(event) {
      applyEvent({ type: "complete", name: event.type, detail: event.detail });
    }
    window.addEventListener("virtual-os-guide-step-action", onAction);
    COMPLETE_EVENTS.forEach((name) => window.addEventListener(name, onComplete));
    return () => {
      window.removeEventListener("virtual-os-guide-step-action", onAction);
      COMPLETE_EVENTS.forEach((name) => window.removeEventListener(name, onComplete));
    };
  }, [activePage?.app, activeScenario, allSteps, completed, guide, mode, phase, trackPracticeStep, trackPracticeWrongStep]);

  if (mode !== "practice" || !guide || !activeScenario) return null;

  function beginTask() {
    setPhase("task");
    setAssistanceLevel(0);
    setRecoveryMessage("");
    setBlockedMessage("");
  }

  function requestAssistance() {
    const nextLevel = Math.min(assistanceLevel + 1, MAX_ASSISTANCE_LEVEL);
    const promptText = getAssistanceText(nextLevel, activeStep, guide, activePage);
    setAssistanceLevel(nextLevel);
    trackPracticePrompt(nextLevel, {
      text: promptText,
      label: ASSISTANCE_LABELS[nextLevel],
      stepId: activeStep?.id || "",
    });
  }

  function startIndependentAttempt() {
    setPracticeSupport("prompt", { newAttempt: true, resetSteps: true });
    setPhase("preview");
    setAssistanceLevel(0);
    setRecoveryMessage("");
    setBlockedMessage("");
    goHome();
  }

  function checkActiveStepAnswer() {
    if (!activeStep?.answers?.length) return;
    const correct = isCorrectLearnAnswer(answerValue, activeStep.answers);
    const answerCheckId = getAnswerCheckIdForStep(activeStep);
    setAnswerStatus(correct ? "correct" : "wrong");
    trackPracticeAnswer(activeStep.id, correct, answerCheckId);
    if (correct) {
      completePracticeStep(activeStep);
      return;
    }
    trackPracticeWrongStep();
    setRecoveryMessage("That answer does not match the information in the app yet. Check the details, then try again when you are ready.");
  }

  if (phase === "preview") {
    return (
      <aside
        className="practice-guide-card task-preview-card"
        data-support-ui="true"
        data-phone-interaction-gate="true"
        data-phone-blocked-message="Press Start task on this card before using the phone."
      >
        <span>Practice · Attempt {attempt}</span>
        <strong>{guide.title}</strong>
        <p>{guide.purpose}</p>
        <div className="task-preview-note">
          {guidedAttempt
            ? "You will see one step at a time. Help is available if you need it."
            : "Try this task from memory. Help remains available if you become stuck."}
        </div>
        {blockedMessage ? <div className="phone-gate-reminder" role="status">{blockedMessage}</div> : null}
        <button type="button" className="primary" onClick={beginTask}>Start task</button>
      </aside>
    );
  }

  if (phase === "review") {
    return (
      <aside
        className="practice-guide-card task-review-card"
        data-support-ui="true"
        data-phone-interaction-gate="true"
        data-phone-blocked-message="This task is complete. Choose what to do next on the review card."
      >
        <span>Task complete</span>
        <strong>You completed {guide.title}</strong>
        <p>{guide.purpose}</p>
        <div className="task-outcome-list">
          {guide.successCriteria.map((item) => <span key={item}>✓ {item}</span>)}
        </div>
        <p className="transfer-message">Next, practise the same skill with different information so it works across other phone apps.</p>
        {blockedMessage ? <div className="phone-gate-reminder" role="status">{blockedMessage}</div> : null}
        <div className="practice-actions">
          <button type="button" className="primary" onClick={startIndependentAttempt}>Try again independently</button>
          <button type="button" onClick={goHome}>Return Home</button>
        </div>
      </aside>
    );
  }

  return (
    <aside className="practice-guide-card one-step-practice-card" data-support-ui="true" ref={cardRef}>
      <GuideCursor
        cardRef={cardRef}
        selectors={getGuideTargetSelectors(activeStep, state.currentApp)}
        replayKey={`${activeScenario.id}:${activeStep?.id || ""}:${state.currentApp}:${attempt}:${assistanceLevel}`}
        autoPlay={assistanceLevel >= 4}
        interactive={false}
      />
      <span>Task · Attempt {attempt}</span>
      <strong>{guide.title}</strong>
      {showOneStep ? (
        <div className="current-task-step">
          <span>Next step</span>
          <strong>{activeStep?.label || "Continue the task"}</strong>
        </div>
      ) : (
        <p>Complete the task from memory. Use Help if you become stuck.</p>
      )}

      {assistanceLevel > 0 ? (
        <div className={`graded-assistance level-${assistanceLevel}`}>
          <span>Help {assistanceLevel} of {MAX_ASSISTANCE_LEVEL}</span>
          <strong>{ASSISTANCE_LABELS[assistanceLevel]}</strong>
          <p>{assistanceText}</p>
        </div>
      ) : null}

      {recoveryMessage ? (
        <div className="neutral-recovery" role="status">
          <p>{recoveryMessage}</p>
          <div>
            <button type="button" onClick={() => setRecoveryMessage("")}>Try again</button>
            <button type="button" onClick={() => { goHome(); setRecoveryMessage(""); }}>Return Home</button>
          </div>
        </div>
      ) : null}

      {activeStep?.answers?.length && !completed[activeStep.id] ? (
        <div className="practice-answer-box">
          <b>{activeStep.question || "Enter the information you found."}</b>
          <div className="practice-answer-options">
            {activeStep.answers.map((answer) => (
              <button
                key={answer.label}
                type="button"
                className={answerValue === answer.label ? "selected" : ""}
                onClick={() => { setAnswerValue(answer.label); setAnswerStatus(null); }}
              >
                {answer.label}
              </button>
            ))}
          </div>
          <button type="button" onClick={checkActiveStepAnswer}>Check answer</button>
          {answerStatus === "correct" ? <span className="correct">That matches the information in the app.</span> : null}
          {answerStatus === "wrong" ? <span className="neutral">Check the app details, then try again.</span> : null}
        </div>
      ) : null}

      <div className="practice-help-row">
        <button type="button" onClick={requestAssistance} disabled={assistanceLevel >= MAX_ASSISTANCE_LEVEL}>
          {assistanceLevel === 0 ? "Help" : assistanceLevel >= MAX_ASSISTANCE_LEVEL ? "Most help shown" : "More help"}
        </button>
        <span>{completedCount} of {allSteps.length} steps completed</span>
      </div>
    </aside>
  );
}
