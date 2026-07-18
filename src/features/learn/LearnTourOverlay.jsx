import { useEffect, useRef, useState } from "react";
import { useVirtualOS } from "../../state/VirtualOSContext";
import { GuideCursor } from "../system/GuideCursor";
import { LEARN_MODULES, LEARN_SEQUENCE, getLearnAppLabel, getLearnSelectors, getStepAnswers } from "./learnModules";

const WALLET_CARDS = [
  {
    id: "nric",
    label: "NRIC",
    kind: "identity",
    issuer: "Republic of Singapore",
    title: "National Registration Identity Card",
    name: "AMIR BIN HASSAN",
    initials: "AH",
    primaryLabel: "NRIC",
    primaryValue: "S1234567A",
    secondaryLabel: "Date of birth",
    secondaryValue: "12061989",
    dateOfBirth: "12 JUN 1989",
    sex: "M",
    nationality: "SGP",
    documentNote: "Training identity card",
  },
  {
    id: "bank",
    label: "Bank",
    kind: "bank",
    issuer: "Sunrise Bank",
    title: "Sunrise Debit Card",
    name: "AMIR HASSAN",
    primaryLabel: "Account",
    primaryValue: "034-1-22-908",
    secondaryLabel: "Expiry",
    secondaryValue: "08/29",
    cardNumber: "4532 88•• •••• 9081",
    network: "debit",
  },
  {
    id: "appointment",
    label: "Appt",
    kind: "appointment",
    issuer: "Clinic B",
    title: "Clinic Appointment Card",
    name: "Clinic B",
    primaryLabel: "Date",
    primaryValue: "18062026",
    secondaryLabel: "Time",
    secondaryValue: "1500",
    service: "Psychiatry outpatient",
    location: "Clinic B",
  },
];

function WalletCardFace({ card }) {
  if (card.kind === "identity") {
    return (
      <div className="wallet-card-face wallet-card-face-nric">
        <div className="wallet-card-watermark">SG</div>
        <div className="wallet-card-header">
          <span>{card.issuer}</span>
          <b>IDENTITY CARD</b>
        </div>
        <div className="wallet-nric-body">
          <div className="wallet-card-photo" aria-hidden="true">
            <span>{card.initials}</span>
          </div>
          <div className="wallet-card-details">
            <small>Name</small>
            <strong>{card.name}</strong>
            <small>NRIC No.</small>
            <b>{card.primaryValue}</b>
          </div>
        </div>
        <div className="wallet-card-grid">
          <span>DOB <b>{card.dateOfBirth}</b></span>
          <span>SEX <b>{card.sex}</b></span>
          <span>NAT <b>{card.nationality}</b></span>
        </div>
        <p>{card.documentNote}</p>
      </div>
    );
  }

  if (card.kind === "bank") {
    return (
      <div className="wallet-card-face wallet-card-face-bank">
        <div className="wallet-card-bank-top">
          <strong>{card.issuer}</strong>
          <span>{card.network}</span>
        </div>
        <span className="wallet-card-chip" aria-hidden="true" />
        <b className="wallet-bank-number">{card.cardNumber}</b>
        <div className="wallet-card-bank-bottom">
          <span>
            Account
            <b>{card.primaryValue}</b>
          </span>
          <span>
            Valid thru
            <b>{card.secondaryValue}</b>
          </span>
        </div>
        <em>{card.name}</em>
      </div>
    );
  }

  return (
    <div className="wallet-card-face wallet-card-face-appointment">
      <div className="wallet-appointment-band">
        <span>{card.issuer}</span>
        <b>APPOINTMENT</b>
      </div>
      <strong>{card.service}</strong>
      <div className="wallet-appointment-details">
        <span>
          Date
          <b>{card.primaryValue}</b>
        </span>
        <span>
          Time
          <b>{card.secondaryValue}</b>
        </span>
      </div>
      <div className="wallet-appointment-footer">
        <span>{card.location}</span>
        <i aria-hidden="true" />
      </div>
    </div>
  );
}

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
  if (assignedApp === "home") {
    return LEARN_MODULES.home;
  }
  if (assignedApp === "bank" && state.currentApp === "singpass") {
    return LEARN_MODULES.bank;
  }
  return assignedApp && state.currentApp === assignedApp ? LEARN_MODULES[assignedApp] : null;
}

export function isAllowedLearnTarget(target, step) {
  if (!target || !step) {
    return true;
  }
  if (target.closest?.(".learn-answer-btn, .learn-next-btn, .learn-prev-btn, .learn-revisit-btn")) {
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
  const [answerStatus, setAnswerStatus] = useState(null);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [stepReady, setStepReady] = useState(false);
  const [completedSteps, setCompletedSteps] = useState({});
  const [completedGuide, setCompletedGuide] = useState(null);
  const [learnData, setLearnData] = useState({});
  const [walletOpen, setWalletOpen] = useState(false);
  const [selectedWalletCard, setSelectedWalletCard] = useState("");
  const [blockedMessage, setBlockedMessage] = useState("");
  const cardRef = useRef(null);
  const userId = state.session.currentUserId;
  const assignedApp = getAssignedLearnApp(state);
  const learnAssignmentId = userId
    ? state.session.assignments?.[userId]?.filter((item) => item.mode === "learn").at(-1)?.id
    : null;
  const guide = assignedApp === "home"
    ? LEARN_MODULES.home
    : assignedApp === "bank" && state.currentApp === "singpass"
    ? LEARN_MODULES.bank
    : assignedApp && state.currentApp === assignedApp ? LEARN_MODULES[assignedApp] : null;
  const activeStep = guide?.steps[stepIndex] || guide?.steps[0] || null;
  const activeStepKey = getStepKey(assignedApp, activeStep, stepIndex);
  const answers = getStepAnswers(activeStep, learnData);
  const learnMetrics = state.learnMetrics?.byAccount?.[userId] || state.learnMetrics;
  const isFinalLearnModule = LEARN_SEQUENCE.indexOf(assignedApp) === LEARN_SEQUENCE.length - 1;
  const isTeachingStep = Boolean(activeStep?.teaching) || Boolean(activeStep && !activeStep.question && !activeStep.advanceOn && !activeStep.completeEvent);
  const isKnowledgeStep = Boolean(activeStep?.question);
  const learnPartLabel = isKnowledgeStep ? "Part 2: Knowledge check" : "Part 1: App purpose";
  const canAdvance = isTeachingStep || stepReady || Boolean(completedSteps[activeStepKey]);
  const phoneInteractionPaused = isTeachingStep || isKnowledgeStep || canAdvance;
  const phoneBlockedMessage = isKnowledgeStep
    ? "Choose an answer on the Learn card before using the phone again."
    : canAdvance && !isTeachingStep
      ? "That step is complete. Press Next on the Learn card."
      : "Read this explanation, then press Got it on the Learn card.";

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
    setAnswerStatus(null);
    setSelectedAnswer(null);
    setStepReady(false);
    setCompletedSteps({});
    setCompletedGuide(null);
    setLearnData({});
    setWalletOpen(false);
    setSelectedWalletCard("");
    setBlockedMessage("");
  }, [assignedApp, learnAssignmentId]);

  useEffect(() => {
    setAnswerStatus(null);
    setSelectedAnswer(null);
    setStepReady(Boolean(completedSteps[activeStepKey]));
    setWalletOpen(false);
    setSelectedWalletCard("");
    setBlockedMessage("");
  }, [activeStepKey, assignedApp, learnAssignmentId]);

  useEffect(() => {
    function onBlocked(event) {
      setBlockedMessage(event.detail?.message || "Use the Learn card before using the phone again.");
    }
    window.addEventListener("virtual-os-phone-action-blocked", onBlocked);
    return () => window.removeEventListener("virtual-os-phone-action-blocked", onBlocked);
  }, []);

  function markCurrentStepReady() {
    setCompletedSteps((steps) => ({ ...steps, [activeStepKey]: true }));
    setStepReady(true);
  }

  function advanceAfterAction() {
    setCompletedSteps((steps) => ({ ...steps, [activeStepKey]: true }));
    setStepReady(false);
    setAnswerStatus(null);
    setSelectedAnswer(null);
    if (stepIndex >= guide.steps.length - 1) {
      completeModule();
      return;
    }
    setStepIndex((index) => Math.min(index + 1, guide.steps.length - 1));
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
      if (activeStep?.question) {
        markCurrentStepReady();
      } else {
        advanceAfterAction();
      }
    }
    window.addEventListener(activeStep.completeEvent, onComplete);
    return () => window.removeEventListener(activeStep.completeEvent, onComplete);
  }, [activeStep, stepReady, assignedApp, trackLearnAttempt, userId, stepIndex, guide?.steps.length, activeStepKey]);

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
      if (activeStep?.question || activeStep?.stopAfterAction) {
        markCurrentStepReady();
      } else {
        advanceAfterAction();
      }
    }
    window.addEventListener("virtual-os-learn-step-action", onStepAction);
    return () => window.removeEventListener("virtual-os-learn-step-action", onStepAction);
  }, [activeStep, stepReady, assignedApp, trackLearnAttempt, userId, stepIndex, guide?.steps.length, activeStepKey]);

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
    if (!isTeachingStep) {
      setCompletedSteps((steps) => ({ ...steps, [activeStepKey]: true }));
    }
    setStepIndex((index) => Math.min(index + 1, guide.steps.length - 1));
  }

  function chooseAnswer(answer) {
    if (activeStep?.requireWalletSelection && !selectedWalletCard) {
      setAnswerStatus("wallet");
      return;
    }
    setSelectedAnswer(answer.label);
    setAnswerStatus(answer.correct ? "correct" : "wrong");
    trackLearnAttempt(assignedApp, Boolean(answer.correct), "answer_choice", userId);
    if (answer.correct) {
      markCurrentStepReady();
    }
  }

  function chooseWalletCard(cardId) {
    setSelectedWalletCard(cardId);
    setWalletOpen(true);
    trackLearnAttempt(assignedApp, cardId === "nric", "wallet_card", userId);
  }

  function renderWalletTool() {
    if (!activeStep?.wallet) {
      return null;
    }
    const selectedCard = WALLET_CARDS.find((card) => card.id === selectedWalletCard);
    return (
      <div className={`learn-wallet-tool ${walletOpen ? "open" : ""}`}>
        <button type="button" className="learn-wallet-toggle" onClick={() => setWalletOpen((open) => !open)}>
          <span className="wallet-icon" aria-hidden="true" />
          <strong>Wallet</strong>
        </button>
        {walletOpen ? (
          <div className="learn-wallet-tray">
            {WALLET_CARDS.map((card, index) => (
              <button
                key={card.id}
                type="button"
                className={`wallet-card ${card.id} ${selectedWalletCard === card.id ? "selected" : ""}`}
                style={{ "--card-index": index }}
                onClick={() => chooseWalletCard(card.id)}
              >
                <WalletCardFace card={card} />
              </button>
            ))}
          </div>
        ) : null}
        {selectedCard ? (
          <div className="learn-wallet-selected">
            <span>Selected card</span>
            <strong>{selectedCard.title}</strong>
            <p>{selectedCard.primaryLabel}: <b>{selectedCard.primaryValue}</b></p>
          </div>
        ) : (
          <p className="learn-wallet-hint">Open the wallet and choose the card that contains the Singpass ID.</p>
        )}
      </div>
    );
  }

  function renderInstruction(text) {
    return String(text || "").split(/(\*\*[^*]+\*\*)/g).map((part, index) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={`${part}-${index}`}>{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  }

  function goToPreviousStep() {
    const previousIndex = Math.max(0, stepIndex - 1);
    const previousStep = guide?.steps[previousIndex] || null;
    const previousKey = getStepKey(assignedApp, previousStep, previousIndex);
    setStepIndex(previousIndex);
    setAnswerStatus(null);
    setSelectedAnswer(null);
    setStepReady(Boolean(completedSteps[previousKey]));
    setCompletedGuide(null);
  }

  function getNextButtonLabel() {
    if (stepIndex >= guide.steps.length - 1) {
      return "Finish";
    }
    if (isTeachingStep) {
      return "Got it";
    }
    if (!canAdvance && (activeStep.advanceOn || activeStep.completeEvent)) {
      return "Do the step";
    }
    return "Next";
  }

  if (completedGuide) {
    const suggestedRevisits = getSuggestedLearnRevisits(learnMetrics);
    const completedAppLabel = getLearnAppLabel(completedGuide.app);
    return (
      <aside
        className={`learn-success-page ${completedGuide.final ? "complete" : ""}`}
        data-support-ui="true"
        data-phone-interaction-gate="true"
        data-phone-blocked-message="Learning is paused. Choose the next option on this completion card."
      >
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
    <aside
      className="learn-tour-card"
      data-support-ui="true"
      ref={cardRef}
      data-phone-interaction-gate={phoneInteractionPaused ? "true" : undefined}
      data-phone-blocked-message={phoneBlockedMessage}
    >
      <GuideCursor
        cardRef={cardRef}
        selectors={activeStep.selectors || []}
        replayKey={activeStepKey}
        targetMode={activeStep.selectors?.some((selector) => selector.includes("status-")) ? "top-right" : "center"}
        autoPlay={!isKnowledgeStep}
      />
      <span>{isKnowledgeStep ? "Learn: check" : "Learn: guide"}</span>
      <strong>{guide.title}</strong>
      <div className="learn-step-meta">
        <b>{learnPartLabel}</b>
        <span>{activeStep.label}</span>
      </div>
      <p>{renderInstruction(activeStep.instruction)}</p>
      {renderWalletTool()}
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
          {answerStatus === "correct" ? (
            <b className="learn-correct">Correct. Press Next when you are ready.</b>
          ) : null}
          {answerStatus === "wrong" ? (
            <b className="learn-try-again">Look again at the highlighted information, then try again.</b>
          ) : null}
          {answerStatus === "wallet" ? (
            <b className="learn-try-again">Open the wallet and choose a card before answering.</b>
          ) : null}
        </div>
      ) : (
        <>
          {activeStep.output && isTeachingStep ? <p className="learn-step-note">{renderInstruction(activeStep.output)}</p> : null}
        </>
      )}
      {!isTeachingStep && !activeStep.question ? (
        <p className="learn-action-lock">{canAdvance ? "Step done." : "Follow the highlighted instruction to continue."}</p>
      ) : null}
      {blockedMessage ? <div className="phone-gate-reminder" role="status">{blockedMessage}</div> : null}
      <div className="learn-panel-actions">
        <button type="button" className="learn-prev-btn" disabled={stepIndex === 0} onClick={goToPreviousStep}>
          Previous step
        </button>
        <button type="button" className="learn-next-btn" disabled={!canAdvance} onClick={goToNextStep}>
          {getNextButtonLabel()}
        </button>
      </div>
    </aside>
  );
}
