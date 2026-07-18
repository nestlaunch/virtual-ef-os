import { useEffect, useMemo, useState } from "react";
import { useVirtualOS } from "../../state/VirtualOSContext";

const ORIENTATION_STEPS = [
  {
    id: "back",
    title: "Back",
    instruction: "Tap the Back control at the bottom of the phone. It returns to the previous screen.",
    selector: '[data-learn-target="nav-back"]',
  },
  {
    id: "home",
    title: "Home",
    instruction: "Tap the Home control. It returns to the phone's starting screen.",
    selector: '[data-learn-target="nav-home"]',
  },
  {
    id: "tabs",
    title: "Recent apps",
    instruction: "Tap the Recent apps control. It shows apps that are available to return to.",
    selector: '[data-learn-target="nav-tabs"]',
  },
];

export function getOrientationStorageKey(session) {
  return `daily-digital-orientation:${session.pin || "local"}:${session.currentUserId || "user"}`;
}

export function hasCompletedPhoneOrientation(session) {
  if (typeof window === "undefined" || !session?.currentUserId) {
    return false;
  }
  try {
    return window.sessionStorage.getItem(getOrientationStorageKey(session)) === "complete";
  } catch {
    return false;
  }
}

export function PhoneOrientationPanel({ onComplete }) {
  const { state, goHome, setTabsOpen, trackInteraction } = useVirtualOS();
  const [stepIndex, setStepIndex] = useState(0);
  const [tried, setTried] = useState(false);
  const [blockedMessage, setBlockedMessage] = useState("");
  const activeStep = ORIENTATION_STEPS[stepIndex];
  const progressLabel = useMemo(() => `${stepIndex + 1} of ${ORIENTATION_STEPS.length}`, [stepIndex]);

  useEffect(() => {
    function onAction(event) {
      const target = event.detail?.target;
      if (!target?.closest?.(activeStep.selector)) {
        return;
      }
      setBlockedMessage("");
      setTried(true);
      trackInteraction({ eventType: "orientation_control", target: activeStep.id });
    }
    window.addEventListener("virtual-os-guide-step-action", onAction);
    return () => window.removeEventListener("virtual-os-guide-step-action", onAction);
  }, [activeStep.id, activeStep.selector, trackInteraction]);

  useEffect(() => {
    function onBlocked(event) {
      setBlockedMessage(event.detail?.message || "Follow the instruction on this card first.");
    }
    window.addEventListener("virtual-os-phone-action-blocked", onBlocked);
    return () => window.removeEventListener("virtual-os-phone-action-blocked", onBlocked);
  }, []);

  function goPrevious() {
    setStepIndex((index) => Math.max(0, index - 1));
    setTried(false);
    setBlockedMessage("");
    setTabsOpen(false);
  }

  function goNext() {
    if (!tried) {
      return;
    }
    if (stepIndex < ORIENTATION_STEPS.length - 1) {
      setStepIndex((index) => index + 1);
      setTried(false);
      setBlockedMessage("");
      setTabsOpen(false);
      return;
    }
    try {
      window.sessionStorage.setItem(getOrientationStorageKey(state.session), "complete");
    } catch {
      // Orientation can still finish if session storage is unavailable.
    }
    setTabsOpen(false);
    goHome();
    onComplete();
  }

  return (
    <aside
      className="phone-orientation-card"
      data-support-ui="true"
      data-phone-interaction-gate="true"
      data-allowed-phone-target={tried ? "" : activeStep.selector}
      data-phone-blocked-message={tried
        ? "That control is complete. Press Continue on the instruction card."
        : `Use the ${activeStep.title} control named on the instruction card.`}
    >
      <span>Phone controls · {progressLabel}</span>
      <strong>{activeStep.title}</strong>
      <p>{activeStep.instruction}</p>
      <div className={`orientation-status ${tried ? "complete" : ""}`}>
        {tried ? "Control tried successfully." : "Try the control on the phone now."}
      </div>
      {blockedMessage ? <div className="phone-gate-reminder" role="status">{blockedMessage}</div> : null}
      <div className="orientation-actions">
        <button type="button" onClick={goPrevious} disabled={stepIndex === 0}>Back</button>
        <button type="button" className="primary" onClick={goNext} disabled={!tried}>
          {stepIndex === ORIENTATION_STEPS.length - 1 ? "Start task" : "Continue"}
        </button>
      </div>
    </aside>
  );
}
