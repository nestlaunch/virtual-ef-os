import { useEffect, useState } from "react";
import { useVirtualOS } from "../../state/VirtualOSContext";
import { isCorrectLearnAnswer } from "./answerMatching";
import { LEARN_MODULES, LEARN_SEQUENCE, getLearnAppLabel, getLearnSelectors, getStepAnswers } from "./learnModules";

export function getAssignedLearnApp(state) {
  const userId = state.session.currentUserId;
  if (!userId) {
    return null;
  }
  const mode = state.session.userModes[userId] || state.session.mode;
  return mode === "learn" ? state.session.learnModules?.[userId] || null : null;
}

export function getLearnModuleForState(state) {
  const assignedApp = getAssignedLearnApp(state);
  return assignedApp && state.currentApp === assignedApp ? LEARN_MODULES[assignedApp] : null;
}

export function isAllowedLearnTarget(target, step) {
  if (!target || !step) {
    return true;
  }
  if (target.closest?.(".learn-answer-btn, .learn-answer-input, .learn-check-btn, .learn-next-btn, .learn-prev-btn, .learn-revisit-btn")) {
    return true;
  }
  return (step.selectors || []).some((selector) => target.closest?.(selector));
}

export function getBroadLearnStep(module) {
  const selectors = module ? window.__virtualLearnSelectors || getLearnSelectors(module) : [];
  return module ? { selectors } : null;
}

function getLearnAccuracyForApp(metrics, appId) {
  const appMetrics = metrics?.byApp?.[appId] || { correct: 0, total: 0 };
  const total = appMetrics.total || 0;
  return {
    correct: appMetrics.correct || 0,
    total,
    accuracy: total > 0 ? appMetrics.correct / total : 1,
    errorRate: total > 0 ? 1 - (appMetrics.correct / total) : 0,
  };
}

function getSuggestedLearnRevisits(metrics) {
  const attempted = LEARN_SEQUENCE
    .map((appId) => ({ appId, ...getLearnAccuracyForApp(metrics, appId) }))
    .filter((item) => item.total > 0);
  const withErrors = attempted
    .filter((item) => item.errorRate > 0)
    .sort((a, b) => b.errorRate - a.errorRate || b.total - a.total);
  return withErrors.slice(0, 2);
}

function getStepKey(appId, step, index) {
  return `${appId || "learn"}:${index}:${step?.label || "step"}`;
}

export function LearnTourOverlay() {
  const { state, setLearnModule, setUserMode, trackLearnAttempt, completeLearnModule } = useVirtualOS();
  const [stepIndex, setStepIndex] = useState(0);
  const [answerValue, setAnswerValue] = useState("");
  const [answerStatus, setAnswerStatus] = useState(null);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [stepReady, setStepReady] = useState(false);
  const [completedSteps, setCompletedSteps] = useState({});
  const [completedGuide, setCompletedGuide] = useState(null);
  const [learnData, setLearnData] = useState({});
  const userId = state.session.currentUserId;
  const assignedApp = getAssignedLearnApp(state);
  const learnAssignmentId = userId
    ? state.session.assignments?.[userId]?.filter((item) => item.mode === "learn").at(-1)?.id
    : null;
  const guide = assignedApp && state.currentApp === assignedApp ? LEARN_MODULES[assignedApp] : null;
  const activeStep = guide?.steps[stepIndex] || guide?.steps[0] || null;
  const activeStepKey = getStepKey(assignedApp, activeStep, stepIndex);
  const answers = getStepAnswers(activeStep, learnData);
  const learnMetrics = state.learnMetrics?.byAccount?.[userId] || state.learnMetrics;
  const isFinalLearnModule = LEARN_SEQUENCE.indexOf(assignedApp) === LEARN_SEQUENCE.length - 1;
  const canAdvance = stepReady || Boolean(completedSteps[activeStepKey]);

  useEffect(() => {
    const shell = document.querySelector(".phone-shell");
    const clearTargets = () => {
      const previous = shell ? Array.from(shell.querySelectorAll(".learn-target")) : [];
      previous.forEach((node) => node.classList.remove("learn-target"));
    };

    if (!shell || !activeStep) {
      window.__virtualLearnSelectors = [];
      return undefined;
    }
    window.__virtualLearnSelectors = activeStep.selectors || [];

    const markTargets = () => {
      clearTargets();
      activeStep.selectors
        .flatMap((selector) => Array.from(shell.querySelectorAll(selector)))
        .forEach((node) => node.classList.add("learn-target"));
    };
    markTargets();
    const observer = new MutationObserver(markTargets);
    observer.observe(shell, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      clearTargets();
      window.__virtualLearnSelectors = [];
    };
  }, [activeStep, state.currentApp, state.events.length, state.metrics.whatsappReplies]);

  useEffect(() => {
    setStepIndex(0);
    setAnswerValue("");
    setAnswerStatus(null);
    setSelectedAnswer(null);
    setStepReady(false);
    setCompletedSteps({});
    setCompletedGuide(null);
    setLearnData({});
  }, [assignedApp, learnAssignmentId]);

  useEffect(() => {
    setAnswerValue("");
    setAnswerStatus(null);
    setSelectedAnswer(null);
    setStepReady(Boolean(completedSteps[activeStepKey]));
  }, [activeStepKey, assignedApp, learnAssignmentId]);

  function markCurrentStepReady() {
    setCompletedSteps((steps) => ({ ...steps, [activeStepKey]: true }));
    setStepReady(true);
  }

  useEffect(() => {
    if (!activeStep?.completeEvent) {
      return undefined;
    }
    function onComplete(event) {
      if (event?.detail?.durationMinutes) {
        setLearnData((data) => ({ ...data, routeDuration: event.detail.durationMinutes }));
      }
      if (!stepReady) {
        trackLearnAttempt(assignedApp, true, "complete", userId);
      }
      markCurrentStepReady();
    }
    window.addEventListener(activeStep.completeEvent, onComplete);
    return () => window.removeEventListener(activeStep.completeEvent, onComplete);
  }, [activeStep, stepReady, assignedApp, trackLearnAttempt, userId]);

  useEffect(() => {
    if (!activeStep?.advanceOn) {
      return undefined;
    }
    function onStepAction(event) {
      if (event.detail?.eventType !== activeStep.advanceOn) {
        return;
      }
      const target = event.detail?.target;
      const matches = target && activeStep.selectors.some((selector) => target.closest?.(selector));
      const valid = activeStep.validate ? activeStep.validate({ target, detail: event.detail }) : true;
      if (!matches) {
        return;
      }
      if (!valid) {
        trackLearnAttempt(assignedApp, false, activeStep.advanceOn, userId);
        return;
      }
      if (!stepReady) {
        trackLearnAttempt(assignedApp, true, activeStep.advanceOn, userId);
      }
      markCurrentStepReady();
    }
    window.addEventListener("virtual-os-learn-step-action", onStepAction);
    return () => window.removeEventListener("virtual-os-learn-step-action", onStepAction);
  }, [activeStep, stepReady, assignedApp, trackLearnAttempt, userId]);

  if (!guide || !activeStep) {
    return null;
  }

  function moveToNextModule() {
    if (!userId) {
      return;
    }
    const currentIndex = LEARN_SEQUENCE.indexOf(assignedApp);
    const nextApp = LEARN_SEQUENCE[currentIndex + 1];
    if (nextApp) {
      setLearnModule(userId, nextApp);
    }
  }

  function completeModule() {
    completeLearnModule(assignedApp, userId);
    setCompletedGuide({ title: guide.title, app: assignedApp, final: isFinalLearnModule });
  }

  function goToNextStep() {
    if (stepIndex >= guide.steps.length - 1) {
      completeModule();
      return;
    }
    setCompletedSteps((steps) => ({ ...steps, [activeStepKey]: true }));
    setStepIndex((index) => Math.min(index + 1, guide.steps.length - 1));
  }

  function checkTypedAnswer() {
    const correct = isCorrectLearnAnswer(answerValue, answers);
    setAnswerStatus(correct ? "correct" : "wrong");
    trackLearnAttempt(assignedApp, correct, "answer", userId);
    if (correct) {
      markCurrentStepReady();
    }
  }

  function chooseAnswer(answer) {
    setSelectedAnswer(answer.label);
    setAnswerValue(answer.label);
    setAnswerStatus(answer.correct ? "correct" : "wrong");
    trackLearnAttempt(assignedApp, Boolean(answer.correct), "answer_choice", userId);
    if (answer.correct) {
      markCurrentStepReady();
    }
  }

  function goToPreviousStep() {
    const previousIndex = Math.max(0, stepIndex - 1);
    const previousStep = guide?.steps[previousIndex] || null;
    const previousKey = getStepKey(assignedApp, previousStep, previousIndex);
    setStepIndex(previousIndex);
    setAnswerValue("");
    setAnswerStatus(null);
    setSelectedAnswer(null);
    setStepReady(Boolean(completedSteps[previousKey]));
    setCompletedGuide(null);
  }

  if (completedGuide) {
    const suggestedRevisits = getSuggestedLearnRevisits(learnMetrics);
    const completedAppLabel = getLearnAppLabel(completedGuide.app);
    return (
      <aside className={`learn-success-page ${completedGuide.final ? "complete" : ""}`} data-support-ui="true">
        <span>{completedGuide.final ? "Learn complete" : "Good job"}</span>
        <strong>{completedGuide.final ? "Well done" : `${completedGuide.title} complete`}</strong>
        <p>
          {completedGuide.final
            ? "You completed all Learn modules. You can revisit a module, practise the ones that had more errors, or continue to Practice mode."
            : `You completed the ${completedAppLabel} learning module.`}
        </p>
        {completedGuide.final ? (
          <>
            {suggestedRevisits.length > 0 ? (
              <div className="learn-revisit-section">
                <b>Suggested revisit</b>
                {suggestedRevisits.map((item) => (
                  <button
                    key={item.appId}
                    type="button"
                    className="learn-revisit-btn suggested"
                    onClick={() => setLearnModule(userId, item.appId)}
                  >
                    {getLearnAppLabel(item.appId)} - {Math.round(item.errorRate * 100)}% error rate
                  </button>
                ))}
              </div>
            ) : (
              <p className="learn-step-note">No high-error module detected. Choose any module below if you want another attempt.</p>
            )}
            <div className="learn-revisit-grid">
              {LEARN_SEQUENCE.map((appId) => {
                const appAccuracy = getLearnAccuracyForApp(learnMetrics, appId);
                return (
                  <button key={appId} type="button" className="learn-revisit-btn" onClick={() => setLearnModule(userId, appId)}>
                    <strong>{getLearnAppLabel(appId)}</strong>
                    <span>{appAccuracy.total > 0 ? `${appAccuracy.correct}/${appAccuracy.total} accurate` : "Not attempted"}</span>
                  </button>
                );
              })}
            </div>
            <button type="button" className="learn-next-btn" onClick={() => setUserMode(userId, "practice")}>
              Continue to Practice
            </button>
          </>
        ) : (
          <button type="button" className="learn-next-btn" onClick={moveToNextModule}>Next module</button>
        )}
      </aside>
    );
  }

  return (
    <aside className="learn-tour-card" data-support-ui="true">
      <span>Learn</span>
      <strong>{guide.title}</strong>
      <div className="learn-step-meta">
        <b>Step {stepIndex + 1} of {guide.steps.length}</b>
        <span>{activeStep.label}</span>
      </div>
      <p>{activeStep.instruction}</p>
      {answers.length > 0 ? (
        <div className="learn-answer-group">
          <em>{activeStep.question}</em>
          {answers.map((answer) => (
            <button
              key={answer.label}
              type="button"
              className={`learn-answer-btn ${selectedAnswer === answer.label ? (answer.correct ? "correct" : "wrong") : ""}`}
              onClick={() => chooseAnswer(answer)}
            >
              {answer.label}
            </button>
          ))}
          <input
            className={`learn-answer-input ${answerStatus || ""}`}
            value={answerValue}
            onChange={(event) => {
              setAnswerValue(event.target.value);
              setAnswerStatus(null);
              setSelectedAnswer(null);
            }}
            placeholder="Type the answer here"
          />
          <button type="button" className="learn-check-btn" onClick={checkTypedAnswer}>
            Check answer
          </button>
          {answerStatus === "correct" ? (
            <b className="learn-correct">Correct. Press Next when you are ready.</b>
          ) : null}
          {answerStatus === "wrong" ? (
            <b className="learn-try-again">Look again at the highlighted information, then try again.</b>
          ) : null}
        </div>
      ) : (
        <>
          {activeStep.output ? <p className="learn-step-note">{activeStep.output}</p> : null}
          {stepReady ? <p className="learn-correct">Good job. Press Next when you are ready.</p> : null}
        </>
      )}
      <div className="learn-panel-actions">
        <button type="button" className="learn-prev-btn" disabled={stepIndex === 0} onClick={goToPreviousStep}>
          Previous step
        </button>
        <button type="button" className="learn-next-btn" disabled={!canAdvance} onClick={goToNextStep}>
          {stepIndex >= guide.steps.length - 1 ? "Finish module" : "Next"}
        </button>
      </div>
    </aside>
  );
}
