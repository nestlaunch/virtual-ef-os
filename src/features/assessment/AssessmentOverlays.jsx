import { useEffect, useMemo, useState } from "react";
import { SCENARIO_LIBRARY } from "../../state/v2Assessment";
import { useVirtualOS } from "../../state/VirtualOSContext";
import { isCorrectLearnAnswer } from "../learn/answerMatching";
import { COMPLETE_EVENTS, PRACTICE_GUIDES, PRACTICE_PAGE_OVERRIDES } from "../practice/practiceGuides";
import { completedStepsMap, getDetectedObservedStep } from "../practice/practiceProgress";
import { buildPracticeGuide, flattenGuideSteps } from "../practice/practiceGuideUtils";
import { getAssessmentAnswerChecksForCriteria } from "../taskAnswerChecks";
import { canSubmitAssessmentTask } from "./assessmentTaskState";

export function getLatestAssessmentAssignment(state, userId) {
  return userId ? state.session.assignments?.[userId]?.filter((item) => item.mode === "assessment").at(-1) : null;
}

export function getActiveAssessmentScenario(state) {
  const userId = state.session.currentUserId;
  if (!userId) {
    return null;
  }
  const assignment = getLatestAssessmentAssignment(state, userId);
  return assignment ? [...SCENARIO_LIBRARY, ...state.session.customScenarios].find((item) => item.id === assignment.scenarioId) : null;
}

export function AssessmentPromptOverlay() {
  const { state } = useVirtualOS();
  const userId = state.session.currentUserId;
  if (!userId) {
    return null;
  }
  const mode = state.session.userModes[userId] || state.session.mode;
  const prompt = state.assessmentMetrics?.byAccount?.[userId]?.currentPrompt;
  if (mode !== "assessment" || !prompt || prompt.respondedAt) {
    return null;
  }
  return (
    <aside className="assessment-prompt-toast" data-support-ui="true">
      <span>Prompt {prompt.level}: {prompt.label}</span>
      <strong>{prompt.text}</strong>
    </aside>
  );
}

export function AssessmentStartOverlay() {
  const { state, startAssessmentAssignment } = useVirtualOS();
  const userId = state.session.currentUserId;
  if (!userId) {
    return null;
  }
  const mode = state.session.userModes[userId] || state.session.mode;
  const assignment = getLatestAssessmentAssignment(state, userId);
  const metrics = state.assessmentMetrics?.byAccount?.[userId] || {};
  const scenario = assignment ? [...SCENARIO_LIBRARY, ...state.session.customScenarios].find((item) => item.id === assignment.scenarioId) : null;
  if (mode !== "assessment" || !assignment || !scenario || metrics.startedByUserAt || metrics.completedAt) {
    return null;
  }
  return (
    <aside className="assessment-start-overlay" data-assessment-control="true" data-support-ui="true">
      <div>
        <span>Assessment</span>
        <strong>{scenario.title}</strong>
        <p>{scenario.description}</p>
        <div className="assessment-start-details">
          {scenario.successCriteria.map((item) => <em key={item}>{item}</em>)}
        </div>
        <button type="button" onClick={() => startAssessmentAssignment(userId)}>
          Start
        </button>
      </div>
    </aside>
  );
}

export function AssessmentTaskPanel() {
  const { state, completeAssessment, trackAssessmentAnswer, trackAssessmentStep } = useVirtualOS();
  const userId = state.session.currentUserId;
  const mode = userId ? state.session.userModes[userId] || state.session.mode : state.session.mode;
  const assignment = getLatestAssessmentAssignment(state, userId);
  const scenario = getActiveAssessmentScenario(state);
  const prompt = userId ? state.assessmentMetrics?.byAccount?.[userId]?.currentPrompt : null;
  const metrics = userId ? state.assessmentMetrics?.byAccount?.[userId] : null;
  const completedAt = metrics?.completedAt;
  const startedByUserAt = metrics?.startedByUserAt;
  const [showInstructions, setShowInstructions] = useState(false);
  const [answers, setAnswers] = useState({});
  const [answerStatus, setAnswerStatus] = useState({});
  const [submitConfirmAt, setSubmitConfirmAt] = useState(null);
  const answerChecks = getAssessmentAnswerChecksForCriteria(scenario?.successCriteria);
  const assessmentGuide = useMemo(() => buildPracticeGuide(
    scenario,
    PRACTICE_GUIDES[state.currentApp],
    PRACTICE_PAGE_OVERRIDES
  ), [scenario, state.currentApp]);
  const allSteps = useMemo(() => flattenGuideSteps(assessmentGuide), [assessmentGuide]);
  const completed = useMemo(() => completedStepsMap(metrics?.completedSteps || []), [metrics?.completedSteps]);
  const visibleAnswerChecks = useMemo(
    () => answerChecks.filter((check) => isAssessmentAnswerAvailable(check, completed)),
    [answerChecks, completed]
  );
  const canSubmit = canSubmitAssessmentTask(answerChecks, answerStatus);

  useEffect(() => {
    setShowInstructions(false);
    setAnswers({});
    setAnswerStatus({});
    setSubmitConfirmAt(null);
  }, [assignment?.id]);

  useEffect(() => {
    setSubmitConfirmAt(null);
  }, [answerStatus, completedAt]);

  useEffect(() => {
    if (!showInstructions) {
      return undefined;
    }
    const timer = window.setTimeout(() => setShowInstructions(false), 5000);
    return () => window.clearTimeout(timer);
  }, [showInstructions]);

  useEffect(() => {
    if (mode !== "assessment" || !scenario || !assignment || !startedByUserAt || completedAt) {
      return undefined;
    }
    function applyEvent(eventLike) {
      const availableStepId = getInformationAvailableStepId(eventLike);
      if (availableStepId) {
        trackAssessmentStep(userId, availableStepId);
      }
      const detectedStep = getDetectedObservedStep(allSteps, completed, eventLike);
      if (detectedStep) {
        trackAssessmentStep(userId, detectedStep.id);
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

    function onAppOpen() {
      applyEvent({ type: "app", app: state.currentApp });
    }

    onAppOpen();
    window.addEventListener("virtual-os-guide-step-action", onAction);
    COMPLETE_EVENTS.forEach((name) => window.addEventListener(name, onComplete));
    return () => {
      window.removeEventListener("virtual-os-guide-step-action", onAction);
      COMPLETE_EVENTS.forEach((name) => window.removeEventListener(name, onComplete));
    };
  }, [allSteps, assignment, completed, completedAt, mode, scenario, startedByUserAt, state.currentApp, trackAssessmentStep, userId]);

  if (mode !== "assessment" || !scenario || !assignment || !startedByUserAt) {
    return null;
  }

  function checkAnswer(check) {
    const correct = isCorrectLearnAnswer(answers[check.id] || "", check.answers);
    setAnswerStatus((prev) => ({ ...prev, [check.id]: correct ? "correct" : "wrong" }));
    trackAssessmentAnswer(userId, check.id, correct);
    if (correct) {
      const matchingStep = allSteps.find((step) => (
        step.answers?.length
        && step.answers.some((answer) => check.answers.some((checkAnswer) => checkAnswer.label === answer.label))
      ));
      if (matchingStep) {
        trackAssessmentStep(userId, matchingStep.id);
      }
    }
  }

  function handleSubmit() {
    if (!canSubmit || completedAt) {
      return;
    }
    setSubmitConfirmAt(Date.now());
  }

  function confirmSubmit() {
    if (!submitConfirmAt || completedAt) {
      return;
    }
    completeAssessment(userId, submitConfirmAt);
  }

  return (
    <aside className="assessment-task-card" data-support-ui="true">
      <span>Assessment</span>
      <strong>{scenario.title}</strong>
      <button type="button" className="assessment-task-toggle" onClick={() => setShowInstructions(true)}>
        Show task
      </button>
      {showInstructions ? (
        <>
          <p>{scenario.description}</p>
          <div className="assessment-task-details">
            <b>Task required</b>
            {scenario.successCriteria.map((item) => <em key={item}>{item}</em>)}
          </div>
        </>
      ) : null}
      {prompt && !prompt.respondedAt ? (
        <div className="assessment-side-prompt">
          <b>Therapist prompt {prompt.level}: {prompt.label}</b>
          <p>{prompt.text}</p>
        </div>
      ) : null}
      {visibleAnswerChecks.length > 0 ? (
        <div className="assessment-answer-box">
          <b>Answer check</b>
          {visibleAnswerChecks.map((check) => (
            <label key={check.id}>
              <span>{check.question}</span>
              <div className="assessment-answer-options">
                {check.answers.map((answer) => (
                  <button
                    key={answer.label}
                    type="button"
                    className={answers[check.id] === answer.label ? "selected" : ""}
                    onClick={() => {
                      setAnswers((prev) => ({ ...prev, [check.id]: answer.label }));
                      setAnswerStatus((prev) => ({ ...prev, [check.id]: null }));
                    }}
                  >
                    {answer.label}
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => checkAnswer(check)}>Check</button>
              {answerStatus[check.id] === "correct" ? <em className="correct">Correct</em> : null}
              {answerStatus[check.id] === "wrong" ? <em className="wrong">Not quite</em> : null}
            </label>
          ))}
          {!canSubmit ? <em className="assessment-submit-hint">Check each answer before submitting.</em> : null}
        </div>
      ) : null}
      {answerChecks.length > 0 && visibleAnswerChecks.length === 0 ? (
        <em className="assessment-submit-hint">Answer check will appear after the relevant information is visible.</em>
      ) : null}
      <button type="button" className="assessment-submit-btn" onClick={handleSubmit} disabled={Boolean(completedAt) || !canSubmit}>
        {completedAt ? "Submitted" : "Submit"}
      </button>
      {submitConfirmAt && !completedAt ? (
        <div className="assessment-submit-modal" role="dialog" aria-modal="true" aria-label="Confirm assessment submission" data-support-ui="true">
          <div>
            <span>Confirm submission</span>
            <strong>End this assessment?</strong>
            <p>The timer is paused. Submit only if you have finished this task.</p>
            <div>
              <button type="button" onClick={() => setSubmitConfirmAt(null)}>Cancel</button>
              <button type="button" className="danger" onClick={confirmSubmit}>Submit assessment</button>
            </div>
          </div>
        </div>
      ) : null}
    </aside>
  );
}

function isAssessmentAnswerAvailable(check, completed = {}) {
  if (!check) {
    return false;
  }
  if (check.id === "appointment-details") {
    return Boolean(
      completed["open-message"]
      || completed["sms-open-doctor"]
      || completed["read-details"]
      || completed["sms-read-details"]
    );
  }
  if (check.id === "route-duration") {
    return Boolean(
      completed["route-duration-available"]
      || completed["show-route"]
      || completed["maps-show-route"]
    );
  }
  if (check.id === "clinic-location") {
    return Boolean(
      completed["clinic-location-available"]
      || completed["calendar-open-appointment"]
      || completed["payment-calendar-open-appointment"]
      || completed["calendar-read-location"]
      || completed["payment-calendar-check-details"]
    );
  }
  if (check.id === "bank-balance") {
    return Boolean(completed.login || completed["check-balance"] || completed["bank-balance-available"]);
  }
  if (check.id === "payment-details") {
    return Boolean(completed["review-details"] || completed["payment-details-available"] || completed["start-payment"]);
  }
  return true;
}

function getInformationAvailableStepId(eventLike) {
  if (eventLike?.type !== "complete") {
    return null;
  }
  if (eventLike.name === "virtual-os-learn-maps-route") {
    return "route-duration-available";
  }
  if (eventLike.name === "virtual-os-learn-bank-payment") {
    return "payment-details-available";
  }
  return null;
}

export function AssessmentCompleteOverlay() {
  const { state } = useVirtualOS();
  const userId = state.session.currentUserId;
  if (!userId) {
    return null;
  }
  const mode = state.session.userModes[userId] || state.session.mode;
  const assignment = getLatestAssessmentAssignment(state, userId);
  const metrics = state.assessmentMetrics?.byAccount?.[userId];
  if (mode !== "assessment" || !metrics?.completedAt || metrics.assignmentId !== assignment?.id) {
    return null;
  }
  return (
    <aside className="assessment-complete-overlay" data-assessment-control="true" data-support-ui="true">
      <div>
        <span>Assessment Submitted</span>
        <strong>Thank you</strong>
        <p>You have completed this assessment. Please wait for the next task.</p>
      </div>
    </aside>
  );
}
