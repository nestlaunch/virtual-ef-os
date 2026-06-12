import { useEffect, useMemo, useState } from "react";
import { getCurrentAssignment } from "../../state/sessionLifecycle";
import { SCENARIO_LIBRARY } from "../../state/v2Assessment";
import { useVirtualOS } from "../../state/VirtualOSContext";
import { isCorrectLearnAnswer } from "../learn/answerMatching";
import { completedStepsMap, firstIncompleteIndex, getDetectedPracticeStep, shouldCountPracticeMiss } from "./practiceProgress";
import { buildPracticeGuide, flattenGuideSteps, getActivePracticePage } from "./practiceGuideUtils";
import { APP_LABELS, COMPLETE_EVENTS, PRACTICE_GUIDES, PRACTICE_PAGE_OVERRIDES } from "./practiceGuides";

function getEffectiveMode(state) {
  return state.session.currentUserId
    ? state.session.userModes[state.session.currentUserId] || state.session.mode
    : state.session.mode;
}

function getActiveScenario(state) {
  const userId = state.session.currentUserId;
  if (!userId) return null;
  const assignment = getCurrentAssignment(state.session, userId, "practice");
  if (!assignment) return null;
  return SCENARIO_LIBRARY.find((scenario) => scenario.id === assignment.scenarioId) || null;
}

export function PracticeGuidePanel() {
  const { state, setPracticeSupport, trackPracticeStep, trackPracticePrompt, trackPracticeWrongStep, trackPracticeAnswer } = useVirtualOS();
  const mode = getEffectiveMode(state);
  const activeScenario = getActiveScenario(state);
  const appGuide = PRACTICE_GUIDES[state.currentApp];
  const guide = buildPracticeGuide(activeScenario, appGuide, PRACTICE_PAGE_OVERRIDES);
  const userId = state.session.currentUserId;
  const sharedMetrics = userId ? state.practiceMetrics?.byAccount?.[userId] : null;
  const completed = useMemo(() => completedStepsMap(sharedMetrics?.completedSteps || []), [sharedMetrics?.completedSteps]);
  const checklistVisible = (sharedMetrics?.supportMode || "checklist") === "checklist";
  const attempt = sharedMetrics?.attempt || 1;
  const [hintLevel, setHintLevel] = useState(0);
  const [answerValue, setAnswerValue] = useState("");
  const [answerStatus, setAnswerStatus] = useState(null);
  const allSteps = useMemo(() => flattenGuideSteps(guide), [guide]);
  const { page: activePage, pageIndex: activePageIndex } = useMemo(
    () => getActivePracticePage(guide, completed, state.currentApp),
    [completed, guide, state.currentApp]
  );
  const pageSteps = activePage?.steps || [];

  const completedCount = useMemo(() => (
    allSteps.filter((step) => completed[step.id]).length
  ), [allSteps, completed]);
  const isComplete = Boolean(guide && completedCount === allSteps.length);
  const activeStepIndex = allSteps.length ? firstIncompleteIndex(allSteps, completed) : 0;
  const activeStep = allSteps[activeStepIndex];
  const currentPrompt = hintLevel > 0
    ? activeStep?.prompts[Math.min(hintLevel - 1, (activeStep.prompts.length || 1) - 1)]
    : null;

  useEffect(() => {
    setHintLevel(0);
  }, [state.currentApp, state.session.currentUserId, activeScenario?.id]);

  useEffect(() => {
    setAnswerValue("");
    setAnswerStatus(null);
  }, [activeStep?.id, activeScenario?.id, attempt]);

  function completePracticeStep(step) {
    if (!step || completed[step.id]) {
      return;
    }
    const nextCompleted = new Set(Object.keys(completed).filter((stepId) => completed[stepId]));
    nextCompleted.add(step.id);
    const nextComplete = allSteps.length > 0 && allSteps.every((item) => nextCompleted.has(item.id));
    trackPracticeStep(step.id, nextComplete);
    setAnswerValue("");
    setAnswerStatus(null);
    setHintLevel(0);
  }

  useEffect(() => {
    if (mode !== "practice" || !guide || !activeScenario) {
      return;
    }
    const detectedStep = getDetectedPracticeStep(allSteps, completed, { type: "app", app: state.currentApp });
    if (detectedStep) {
      completePracticeStep(detectedStep);
    }
  }, [activeScenario, allSteps, completed, completedCount, guide, mode, state.currentApp, trackPracticeStep]);

  useEffect(() => {
    if (mode !== "practice" || !guide || !activeScenario) {
      return undefined;
    }
    function applyEvent(eventLike) {
      const nextStep = allSteps[firstIncompleteIndex(allSteps, completed)];
      if (!nextStep || completed[nextStep.id]) {
        return;
      }
      const detectedStep = getDetectedPracticeStep(allSteps, completed, eventLike);
      if (detectedStep) {
        completePracticeStep(detectedStep);
      } else if (shouldCountPracticeMiss(nextStep, eventLike)) {
        trackPracticeWrongStep();
      }
    }

    function onAction(event) {
      applyEvent({
        type: event.detail?.eventType,
        target: event.detail?.target,
        detail: event.detail,
      });
    }

    function onComplete(event) {
      applyEvent({
        type: "complete",
        name: event.type,
        detail: event.detail,
      });
    }

    window.addEventListener("virtual-os-guide-step-action", onAction);
    COMPLETE_EVENTS.forEach((name) => window.addEventListener(name, onComplete));
    return () => {
      window.removeEventListener("virtual-os-guide-step-action", onAction);
      COMPLETE_EVENTS.forEach((name) => window.removeEventListener(name, onComplete));
    };
  }, [activeScenario, allSteps, completed, completedCount, guide, mode, trackPracticeStep, trackPracticeWrongStep]);

  if (mode !== "practice" || !guide || !activeScenario) {
    return null;
  }

  function startHiddenAttempt() {
    setPracticeSupport("prompt", { newAttempt: true, resetSteps: true });
    setHintLevel(0);
  }

  function resetWithChecklist() {
    setPracticeSupport("checklist", { newAttempt: true, resetSteps: true });
    setHintLevel(0);
  }

  function requestHint() {
    const nextLevel = Math.min(hintLevel + 1, 3);
    const promptText = activeStep?.prompts?.[Math.min(nextLevel - 1, (activeStep.prompts.length || 1) - 1)] || "";
    setPracticeSupport("prompt");
    setHintLevel(nextLevel);
    trackPracticePrompt(nextLevel, {
      text: promptText,
      label: activeStep?.label || "",
      stepId: activeStep?.id || "",
    });
  }

  function checkActiveStepAnswer() {
    if (!activeStep?.answers?.length) {
      return;
    }
    const correct = isCorrectLearnAnswer(answerValue, activeStep.answers);
    setAnswerStatus(correct ? "correct" : "wrong");
    trackPracticeAnswer(activeStep.id, correct);
    if (correct) {
      completePracticeStep(activeStep);
      return;
    }
    trackPracticeWrongStep();
  }

  return (
    <aside className="practice-guide-card" data-support-ui="true">
      <span>Practice</span>
      <strong>{guide.title}</strong>
      <p>{guide.purpose}</p>
      <div className="practice-target-box">
        <b>Required details</b>
        {guide.successCriteria.map((item) => <span key={item}>{item}</span>)}
      </div>
      <div className="practice-support-row">
        <b>Attempt {attempt}</b>
        <button type="button" onClick={() => setPracticeSupport(checklistVisible ? "prompt" : "checklist")}>
          {checklistVisible ? "Hide checklist" : "Show checklist"}
        </button>
      </div>
      <div className="practice-page-box">
        <span>Page {activePageIndex + 1} of {guide.pages.length}</span>
        <strong>{activePage?.label || "Current page"}</strong>
        {activePage?.app && activePage.app !== state.currentApp ? (
          <p>Expected page: {APP_LABELS[activePage.app]}. Use the Home screen or app icon to move there.</p>
        ) : (
          <p>Complete the tasks visible on this page before moving on.</p>
        )}
      </div>
      {checklistVisible ? (
        <ol className="practice-checklist">
          {pageSteps.map((step) => (
            <li key={step.id} className={completed[step.id] ? "done" : ""}>
              <span>{completed[step.id] ? "OK" : ""}</span>
              {step.label}
            </li>
          ))}
        </ol>
      ) : (
        <div className="practice-prompt-box">
          <b>{isComplete ? "Task complete" : "Try from memory"}</b>
          {isComplete ? (
            <p>You completed the required steps without the full checklist visible.</p>
          ) : currentPrompt ? (
            <p>{currentPrompt}</p>
          ) : null}
          {!isComplete ? <button type="button" onClick={requestHint}>Need a hint</button> : null}
        </div>
      )}
      {activeStep?.answers?.length && !completed[activeStep.id] ? (
        <div className="practice-answer-box">
          <b>{activeStep.question || "Enter the information you found."}</b>
          <div className="practice-answer-options">
            {activeStep.answers.map((answer) => (
              <button
                key={answer.label}
                type="button"
                className={answerValue === answer.label ? "selected" : ""}
                onClick={() => {
                  setAnswerValue(answer.label);
                  setAnswerStatus(null);
                }}
              >
                {answer.label}
              </button>
            ))}
          </div>
          <button type="button" onClick={checkActiveStepAnswer}>Check</button>
          {answerStatus === "correct" ? <span className="correct">Correct.</span> : null}
          {answerStatus === "wrong" ? <span className="wrong">Not quite. Check the app again, then try again.</span> : null}
        </div>
      ) : null}
      <div className="practice-actions">
        <button type="button" onClick={startHiddenAttempt}>
          Skip checklist
        </button>
        {isComplete ? (
          <button type="button" className="primary" onClick={startHiddenAttempt}>
            Try again without checklist
          </button>
        ) : null}
        {!checklistVisible ? (
          <button type="button" onClick={resetWithChecklist}>
            Restart with checklist
          </button>
        ) : null}
      </div>
    </aside>
  );
}
