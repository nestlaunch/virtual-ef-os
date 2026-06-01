import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { VirtualOSProvider, useVirtualOS } from "../state/VirtualOSContext";
import { StatusBar } from "../features/system/StatusBar";
import { HomeScreen } from "../features/home/HomeScreen";
import { CalendarApp } from "../features/calendar/CalendarApp";
import { SMSApp } from "../features/messages/SMSApp";
import { WhatsAppApp } from "../features/whatsapp/WhatsAppApp";
import { SettingsApp } from "../features/settings/SettingsApp";
import { MapsApp } from "../features/maps/MapsApp";
import { BankApp } from "../features/bank/BankApp";
import { Dock } from "../features/system/Dock";
import { AdminPanel } from "../features/admin/AdminPanel";
import { JoinSession } from "../features/session/JoinSession";
import { SessionEndedOverlay } from "../features/session/SessionEndedOverlay";
import { PracticeGuidePanel } from "../features/practice/PracticeGuidePanel";
import { LEARN_APP_CATALOG, formatAlias } from "../state/v2Assessment";
import { getLatestUnreadStimulus } from "../state/stimulusSequence";
import { getCurrentAssignment } from "../state/sessionLifecycle";
import { LearnTourOverlay, getAssignedLearnApp, getBroadLearnStep, getLearnModuleForState, isAllowedLearnTarget } from "../features/learn/LearnTourOverlay";
import { AssessmentCompleteOverlay, AssessmentPromptOverlay, AssessmentStartOverlay, AssessmentTaskPanel, getActiveAssessmentScenario } from "../features/assessment/AssessmentOverlays";
import { isSupportTarget } from "./supportTargets";

function StimulusNotification() {
  const { state, openApp, markStimulusRead, dismissStimulus } = useVirtualOS();
  const stimulus = getLatestUnreadStimulus(state);

  if (!stimulus || !state.session.joined || state.session.completedAt) {
    return null;
  }

  const targetApp = stimulus.app === "sms" ? "sms" : "whatsapp";

  return (
    <aside className={`stimulus-notification ${stimulus.app}`}>
      <button
        type="button"
        onClick={() => {
          markStimulusRead(stimulus.id);
          openApp(targetApp);
        }}
      >
        <strong>{stimulus.title}</strong>
        <span>{stimulus.preview}</span>
        <em>{stimulus.encouragement}</em>
      </button>
      <button type="button" aria-label="Dismiss notification" onClick={() => dismissStimulus(stimulus.id)}>x</button>
    </aside>
  );
}

function AppSwitcher() {
  const { state, openApp, setTabsOpen } = useVirtualOS();
  const apps = [
    { id: "home", label: "Home" },
    { id: "calendar", label: "Calendar" },
    { id: "sms", label: "Messages" },
    { id: "whatsapp", label: "WhatsApp" },
    { id: "maps", label: "Maps" },
    { id: "bank", label: "Bank" },
    { id: "settings", label: "Settings" },
  ];

  if (!state.tabSwitcherOpen) {
    return null;
  }

  return (
    <div className="app-switcher-backdrop" onClick={() => setTabsOpen(false)}>
      <div className="app-switcher" onClick={(e) => e.stopPropagation()}>
        {apps.map((app) => (
          <button
            key={app.id}
            type="button"
            className={`switcher-card ${state.currentApp === app.id ? "active" : ""}`}
            onClick={() => {
              if (app.id === "home") {
                openApp("home");
              } else {
                openApp(app.id);
              }
              setTabsOpen(false);
            }}
          >
            {app.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ActiveApp() {
  const { state } = useVirtualOS();
  const activeApp = state.currentApp === "instructions" ? "home" : state.currentApp;

  const appMap = {
    home: <HomeScreen />,
    calendar: <CalendarApp />,
    sms: <SMSApp />,
    whatsapp: <WhatsAppApp />,
    maps: <MapsApp />,
    bank: <BankApp />,
    settings: <SettingsApp />,
  };

  return (
    <>
      <StatusBar />
      <div className="phone-content">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeApp}
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -14, scale: 0.985 }}
            transition={{ duration: 0.22 }}
            className="app-page"
          >
            {appMap[activeApp] || <HomeScreen />}
          </motion.div>
        </AnimatePresence>
      </div>
      <Dock />
      <StimulusNotification />
      <AppSwitcher />
    </>
  );
}

function ClinicalWorkspace() {
  const { state, trackInteraction, trackLearnAttempt } = useVirtualOS();
  const focusedInputs = useRef(new WeakMap());
  const isAdminRoute = window.location.pathname.replace(/\/+$/, "") === "/admin";
  const currentAccount = state.session.userAccounts.find((account) => account.id === state.session.currentUserId);
  const effectiveMode = state.session.currentUserId
    ? state.session.userModes[state.session.currentUserId] || state.session.mode
    : state.session.mode;
  const assignedLearnApp = getAssignedLearnApp(state);
  const activePracticeScenarioId = state.session.currentUserId
    ? getCurrentAssignment(state.session, state.session.currentUserId, "practice")?.scenarioId
    : null;
  const activeAssessmentScenario = getActiveAssessmentScenario(state);
  const hasSideGuide = Boolean(assignedLearnApp)
    || Boolean(effectiveMode === "practice" && activePracticeScenarioId)
    || Boolean(effectiveMode === "assessment" && activeAssessmentScenario);

  function describeTarget(target) {
    if (!target) {
      return "unknown";
    }
    const label = target.getAttribute?.("aria-label")
      || target.getAttribute?.("data-learn-target")
      || target.getAttribute?.("data-thread-id")
      || target.getAttribute?.("placeholder")
      || target.name
      || target.className
      || target.tagName
      || "unknown";
    return String(label);
  }

  function isTaskCardTarget(target) {
    return isSupportTarget(target);
  }

  function isCalendarDateDraftTarget(target) {
    return Boolean(target?.closest?.(".date-wheel-fields"));
  }

  function isOutsideLearnTarget(target) {
    const module = getLearnModuleForState(state);
    const broadStep = getBroadLearnStep(module);
    return Boolean(broadStep && !isAllowedLearnTarget(target, broadStep));
  }

  function blockIfOutsideLearnTarget(event, options = {}) {
    const { countAttempt = true } = options;
    if (isOutsideLearnTarget(event.target)) {
      if (countAttempt) {
        trackLearnAttempt(getAssignedLearnApp(state), false, "click");
      }
      event.preventDefault();
      event.stopPropagation();
      return true;
    }
    return false;
  }

  function handlePointerDown(event) {
    if (isTaskCardTarget(event.target)) {
      return;
    }
    if (isOutsideLearnTarget(event.target)) {
      return;
    }
    trackInteraction({
      eventType: "click",
      target: describeTarget(event.target),
    });
  }

  function handleClickCapture(event) {
    if (isTaskCardTarget(event.target)) {
      return;
    }
    blockIfOutsideLearnTarget(event);
  }

  function handleClick(event) {
    if (isTaskCardTarget(event.target)) {
      return;
    }
    const detail = { eventType: "click", target: event.target };
    window.dispatchEvent(new CustomEvent("virtual-os-learn-step-action", { detail }));
    window.dispatchEvent(new CustomEvent("virtual-os-guide-step-action", { detail }));
  }

  function handleChange(event) {
    if (isTaskCardTarget(event.target)) {
      return;
    }
    if (isCalendarDateDraftTarget(event.target)) {
      return;
    }
    trackInteraction({
      eventType: "change",
      target: describeTarget(event.target),
    });
    const detail = { eventType: "change", target: event.target };
    window.dispatchEvent(new CustomEvent("virtual-os-learn-step-action", { detail }));
    window.dispatchEvent(new CustomEvent("virtual-os-guide-step-action", { detail }));
  }

  function handleFocus(event) {
    const target = event.target;
    if (isTaskCardTarget(target)) {
      return;
    }
    if (blockIfOutsideLearnTarget(event, { countAttempt: false })) {
      target.blur?.();
      return;
    }
    if (!["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) {
      return;
    }
    focusedInputs.current.set(target, { at: Date.now(), keyed: false });
    trackInteraction({
      eventType: "input_focus",
      target: describeTarget(target),
    });
  }

  function handleKeyDown(event) {
    const target = event.target;
    if (isTaskCardTarget(target)) {
      return;
    }
    const focusState = focusedInputs.current.get(target);
    if (!focusState || focusState.keyed || event.key.length !== 1) {
      return;
    }
    focusState.keyed = true;
    trackInteraction({
      eventType: "typing_latency",
      target: describeTarget(target),
      valueMs: Date.now() - focusState.at,
    });
  }

  return (
    <main className={`clinical-workspace ${isAdminRoute ? "with-panel" : "patient-only"}`}>
      {isAdminRoute ? (
        <AdminPanel />
      ) : !state.session.joined ? (
        <JoinSession />
      ) : (
      <section className={`simulator-stage ${hasSideGuide ? "with-learn-panel" : ""}`}>
        {!isAdminRoute && currentAccount ? (
          <div className="patient-session-chip">
            <span>Signed in as</span>
            <strong>{formatAlias(currentAccount.alias)}</strong>
          </div>
        ) : null}
        <section
          className={`phone-shell android-replica ${assignedLearnApp && state.currentApp === assignedLearnApp ? "learn-locked" : ""}`}
          onPointerDownCapture={handlePointerDown}
          onClickCapture={handleClickCapture}
          onClick={handleClick}
          onChangeCapture={handleChange}
          onFocusCapture={handleFocus}
          onKeyDownCapture={handleKeyDown}
        >
          <ActiveApp />
          <AssessmentStartOverlay />
          <AssessmentPromptOverlay />
          <AssessmentCompleteOverlay />
          <SessionEndedOverlay />
        </section>
        <LearnTourOverlay />
        <PracticeGuidePanel />
        <AssessmentTaskPanel />
      </section>
      )}
    </main>
  );
}

export default function App() {
  return (
    <VirtualOSProvider>
      <ClinicalWorkspace />
    </VirtualOSProvider>
  );
}








