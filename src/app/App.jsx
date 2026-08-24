import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { VirtualOSProvider, useVirtualOS } from "../state/VirtualOSContext";
import { StatusBar } from "../features/system/StatusBar";
import { NotificationShade } from "../features/system/NotificationShade";
import { ConnectivityApp } from "../features/connectivity/ConnectivityApp";
import { HomeScreen } from "../features/home/HomeScreen";
import { CalendarApp } from "../features/calendar/CalendarApp";
import { SMSApp } from "../features/messages/SMSApp";
import { WhatsAppApp } from "../features/whatsapp/WhatsAppApp";
import { SettingsApp } from "../features/settings/SettingsApp";
import { MapsApp } from "../features/maps/MapsApp";
import { BankApp } from "../features/bank/BankApp";
import { SingpassApp } from "../features/singpass/SingpassApp";
import { MailApp } from "../features/mail/MailApp";
import { CalculatorApp } from "../features/calculator/CalculatorApp";
import { Dock } from "../features/system/Dock";
import { GuideCursor } from "../features/system/GuideCursor";
import { AdminPanel } from "../features/admin/AdminPanel";
import { SessionEndedOverlay } from "../features/session/SessionEndedOverlay";
import { JoinSession } from "../features/session/JoinSession";
import { PracticeGuidePanel } from "../features/practice/PracticeGuidePanel";
import { LEARN_APP_CATALOG, SCENARIO_LIBRARY, SESSION_MODES, formatAlias } from "../state/v2Assessment";
import { getLatestCustomStimulusForState, getLatestUnreadStimulus } from "../state/stimulusSequence";
import { getCurrentAssignment } from "../state/sessionLifecycle";
import { getCloudApiBaseUrl, getStoredCloudAdminKey, setStoredCloudAdminKey, verifyCloudAdminKey } from "../state/cloudSync";
import { resolvePatientEntryScreen } from "../state/entryFlow";
import { LearnTourOverlay, getAssignedLearnApp, getBroadLearnStep, getLearnModuleForState, isAllowedLearnTarget } from "../features/learn/LearnTourOverlay";
import { AssessmentCompleteOverlay, AssessmentPromptOverlay, AssessmentStartOverlay, AssessmentTaskPanel, getActiveAssessmentScenario } from "../features/assessment/AssessmentOverlays";
import { isSupportTarget } from "./supportTargets";
import appLogo from "../assets/daily-digital-logo.png";

function StimulusNotification() {
  const { state, openApp, markStimulusRead, dismissStimulus } = useVirtualOS();
  const stimulus = getLatestUnreadStimulus(state);

  if (!stimulus || !state.session.joined || state.session.completedAt || state.session.endingStartedAt) {
    return null;
  }

  const targetApp = stimulus.app === "sms" ? "sms" : "whatsapp";

  return (
    <aside key={stimulus.id} className={`stimulus-notification ${stimulus.app}`} role="status" aria-live="polite">
      <button
        type="button"
        onClick={() => {
          markStimulusRead(stimulus.id);
          openApp(targetApp);
        }}
      >
        <strong>{stimulus.title}</strong>
        <span>{stimulus.preview}</span>
      </button>
      <button type="button" aria-label="Dismiss notification" onClick={() => dismissStimulus(stimulus.id)}>x</button>
    </aside>
  );
}

function FreeTaskPanel() {
  const { state, openApp } = useVirtualOS();
  const cardRef = useRef(null);
  const stimulus = getLatestCustomStimulusForState(state);
  const effectiveMode = state.session.currentUserId
    ? state.session.userModes[state.session.currentUserId] || state.session.mode
    : state.session.mode;

  if (effectiveMode !== "free" || !stimulus) {
    return null;
  }

  const targetApp = stimulus.app === "sms" ? "sms" : "whatsapp";
  const targetSelectors = targetApp === "sms"
    ? ['[data-learn-target="home-app-messages"]', '[data-learn-target="sms-doctor-row"]']
    : ['[data-learn-target="home-app-whatsapp"]', '[data-learn-target="wa-dinner-row"]'];

  return (
    <aside className="free-task-card" data-support-ui="true" ref={cardRef}>
      <GuideCursor
        cardRef={cardRef}
        selectors={targetSelectors}
        replayKey={`${stimulus.id}:${state.currentApp}`}
      />
      <span>Free</span>
      <strong>{stimulus.title}</strong>
      <div className="free-task-message">
        <b>{stimulus.app === "sms" ? "SMS message" : "WhatsApp message"}</b>
        <p>{stimulus.message || stimulus.preview}</p>
      </div>
      {(stimulus.instructions || stimulus.encouragement) ? (
        <div className="free-task-instructions">
          <b>Instructions</b>
          <p>{stimulus.instructions || stimulus.encouragement}</p>
        </div>
      ) : null}
      <button type="button" onClick={() => openApp(targetApp)}>
        Open {stimulus.app === "sms" ? "Messages" : "WhatsApp"}
      </button>
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
    { id: "singpass", label: "Singpass" },
    { id: "mail", label: "Mail" },
    { id: "calculator", label: "Calculator" },
    { id: "connectivity", label: "Network & internet" },
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

function ActiveApp({ onReturnToMain }) {
  const { state } = useVirtualOS();
  const [notificationShadeOpen, setNotificationShadeOpen] = useState(false);
  const activeApp = state.currentApp === "instructions" ? "home" : state.currentApp;

  const appMap = {
    home: <HomeScreen />,
    calendar: <CalendarApp />,
    sms: <SMSApp />,
    whatsapp: <WhatsAppApp />,
    maps: <MapsApp />,
    bank: <BankApp />,
    singpass: <SingpassApp />,
    settings: <SettingsApp />,
    connectivity: <ConnectivityApp />,
    mail: <MailApp />,
    calculator: <CalculatorApp />,
  };
  const internetRequired = new Set(["whatsapp", "maps", "bank", "singpass", "mail"]);
  const hasWifiInternet = Boolean(state.connectivity.connectedNetwork) && state.connectivity.connectedNetwork.internetAvailable !== false;
  const hasMobileInternet = state.connectivity.mobileDataEnabled && !state.connectivity.airplaneMode;
  const isOffline = internetRequired.has(activeApp) && !hasWifiInternet && !hasMobileInternet;

  return (
    <>
      <StatusBar onOpenNotifications={() => setNotificationShadeOpen(true)} />
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
            {isOffline ? <NetworkUnavailable app={activeApp} /> : appMap[activeApp] || <HomeScreen />}
          </motion.div>
        </AnimatePresence>
      </div>
      <Dock onExit={onReturnToMain} />
      <StimulusNotification />
      <AppSwitcher />
      <NotificationShade open={notificationShadeOpen} onOpen={() => setNotificationShadeOpen(true)} onClose={() => setNotificationShadeOpen(false)} />
    </>
  );
}

function NetworkUnavailable({ app }) {
  const { state, openConnectivity, setConnectivitySetting } = useVirtualOS();
  const labels = { whatsapp: "WhatsApp", maps: "Maps", bank: "Sunrise Bank", singpass: "Singpass", mail: "Daily Mail" };
  const effectiveMode = state.session.currentUserId
    ? state.session.userModes[state.session.currentUserId] || state.session.mode
    : state.session.mode;
  const isLearnMode = effectiveMode === "learn";
  return <div className={`network-unavailable ${isLearnMode ? "learn-connectivity" : ""}`} role="status" data-support-ui={isLearnMode ? "true" : undefined}>
    {isLearnMode ? <span className="network-learn-label">Learn · Internet connection</span> : null}
    <span className="network-offline-icon">!</span>
    <h2>{isLearnMode ? "This app needs internet" : "No internet connection"}</h2>
    <p>{labels[app] || "This feature"} can’t connect because both usable Wi-Fi and mobile data are off.</p>
    {isLearnMode ? <div className="network-learning-card"><strong>Choose one way to get online:</strong><p><b>Mobile data</b> uses the simulated mobile plan when you are away from Wi-Fi.</p><p><b>Wi-Fi</b> connects through a nearby network.</p></div> : null}
    <div className="network-recovery-actions">
      <button type="button" data-support-ui="true" onClick={() => setConnectivitySetting("mobileDataEnabled", true)}>Turn on mobile data</button>
      <button type="button" data-support-ui="true" className="secondary" onClick={() => openConnectivity("wifi")}>Connect to Wi-Fi</button>
    </div>
    {isLearnMode ? <p className="network-learn-hint">After you connect, {labels[app] || "the app"} will load automatically.</p> : <small>ERR_INTERNET_DISCONNECTED</small>}
  </div>;
}

function ModeLanding({ onLocalMode, onOnlineMode, onlineAvailable }) {
  return (
    <main className="mode-landing">
      <section className="mode-landing-panel" aria-label="Daily Digital mode selection">
        <img src={appLogo} alt="Daily Digital" />
        <div className="mode-choice-list">
          <button type="button" onClick={onLocalMode}>
            <span>1</span>
            <strong>Local mode</strong>
            <em>No alias or login required</em>
          </button>
          <button type="button" onClick={onOnlineMode} disabled={!onlineAvailable}>
            <span>2</span>
            <strong>Online mode</strong>
            <em>{onlineAvailable ? "Join a clinician session" : "Unavailable in this offline deployment"}</em>
          </button>
        </div>
        {!onlineAvailable ? <p className="offline-deployment-note">This version runs locally in your browser. Choose Local mode to practise without an online account or session PIN.</p> : null}
      </section>
    </main>
  );
}

function AdminAccessGate({ onlineAvailable, children }) {
  const [status, setStatus] = useState(onlineAvailable ? "checking" : "ready");
  const [key, setKey] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!onlineAvailable) return;
    const storedKey = getStoredCloudAdminKey();
    if (!storedKey) {
      setStatus("locked");
      return;
    }
    verifyCloudAdminKey(storedKey).then((valid) => {
      if (!valid) setStoredCloudAdminKey("");
      setStatus(valid ? "ready" : "locked");
    });
  }, [onlineAvailable]);

  async function handleSubmit(event) {
    event.preventDefault();
    setStatus("checking");
    setError("");
    const valid = await verifyCloudAdminKey(key);
    if (!valid) {
      setStoredCloudAdminKey("");
      setError("That clinician access key was not accepted.");
      setStatus("locked");
      return;
    }
    setKey("");
    setStatus("ready");
  }

  if (status === "ready") return children;
  return (
    <main className="admin-access-screen">
      <form className="admin-access-card" onSubmit={handleSubmit}>
        <span className="join-kicker">Clinician workspace</span>
        <h1>Secure admin access</h1>
        <p>Enter the deployment access key. It is kept only for this browser tab.</p>
        <label>
          Clinician access key
          <input type="password" value={key} onChange={(event) => setKey(event.target.value)} autoComplete="current-password" disabled={status === "checking"} />
        </label>
        {error ? <strong className="join-error" role="alert">{error}</strong> : null}
        <button type="submit" disabled={!key.trim() || status === "checking"}>{status === "checking" ? "Checking…" : "Open clinician workspace"}</button>
      </form>
    </main>
  );
}

function LocalModeSetup({ onBack, onStart }) {
  const [step, setStep] = useState(1);
  const [mode, setMode] = useState("practice");
  const [scenarioId, setScenarioId] = useState(SCENARIO_LIBRARY[0]?.id || "");
  const [learnApp, setLearnApp] = useState(LEARN_APP_CATALOG[0]?.currentApp || "home");

  const scenarioOptions = SCENARIO_LIBRARY.filter((scenario) => scenario.id && scenario.title);
  const selectedMode = SESSION_MODES.find((item) => item.id === mode) || SESSION_MODES[0];
  const needsScenario = mode === "practice" || mode === "assessment";
  const choiceLabel = mode === "learn" ? "Choose module" : mode === "free" ? "Choose start" : "Choose scenario";

  function submit(event) {
    event.preventDefault();
    if (step === 1) {
      setStep(2);
      return;
    }
    onStart({
      mode,
      scenarioId: needsScenario ? scenarioId : "",
      app: mode === "learn" ? learnApp : "",
    });
  }

  return (
    <main className="local-setup-screen">
      <form className="local-setup-panel" onSubmit={submit}>
        <img src={appLogo} alt="Daily Digital" />
        <div className="local-setup-steps" aria-label="Local setup steps">
          <span className={step === 1 ? "active" : ""}>1</span>
          <span className={step === 2 ? "active" : ""}>2</span>
        </div>
        <div className="local-anonymous-notice" role="status">
          <strong>Local practice — no sign-in</strong>
          <span>No alias, account, user PIN, or session PIN is required. Activity stays on this browser.</span>
        </div>
        {step === 1 ? (
          <>
            <h1>Choose mode</h1>
            <div className="local-mode-grid">
              {SESSION_MODES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={mode === item.id ? "active" : ""}
                  onClick={() => setMode(item.id)}
                >
                  <strong>{item.label}</strong>
                  <span>{item.description}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <h1>{choiceLabel}</h1>
            <p>{selectedMode?.label}</p>
            {mode === "learn" ? (
              <select value={learnApp} onChange={(event) => setLearnApp(event.target.value)} aria-label="Learn module">
                {LEARN_APP_CATALOG.map((app) => (
                  <option key={app.id} value={app.currentApp}>{app.label}</option>
                ))}
              </select>
            ) : null}
            {needsScenario ? (
              <select value={scenarioId} onChange={(event) => setScenarioId(event.target.value)} aria-label="Scenario">
                {scenarioOptions.map((scenario) => (
                  <option key={scenario.id} value={scenario.id}>{scenario.title}</option>
                ))}
              </select>
            ) : null}
            {mode === "free" ? (
              <div className="local-free-choice">
                <strong>Free exploration</strong>
                <span>No scenario card will be shown. Interactions are still logged.</span>
              </div>
            ) : null}
          </>
        )}
        <div className="local-setup-actions">
          <button type="button" onClick={step === 1 ? onBack : () => setStep(1)}>
            Back
          </button>
          <button type="submit">
            {step === 1 ? "Next" : "Start user page"}
          </button>
        </div>
      </form>
    </main>
  );
}

function ClinicalWorkspace() {
  const { state, logoutUser, returnToMainPage, startLocalMode, trackInteraction, trackLearnAttempt } = useVirtualOS();
  const focusedInputs = useRef(new WeakMap());
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const isAdminRoute = window.location.pathname.replace(/\/+$/, "") === "/admin";
  const [entryMode, setEntryMode] = useState(() => {
    try {
      return window.sessionStorage.getItem("daily-digital-entry-mode") || "";
    } catch {
      return "";
    }
  });
  const onlineAvailable = Boolean(getCloudApiBaseUrl());
  const patientEntryScreen = resolvePatientEntryScreen({ entryMode, onlineAvailable, joined: state.session.joined });
  const isLocalSetup = patientEntryScreen === "local-setup";
  const isLocalMode = entryMode === "local-active";
  const isOnlineMode = entryMode === "online-active" && onlineAvailable;
  const currentAccount = state.session.userAccounts.find((account) => account.id === state.session.currentUserId);
  const effectiveMode = state.session.currentUserId
    ? state.session.userModes[state.session.currentUserId] || state.session.mode
    : state.session.mode;
  const assignedLearnApp = getAssignedLearnApp(state);
  const activePracticeScenarioId = state.session.currentUserId
    ? getCurrentAssignment(state.session, state.session.currentUserId, "practice")?.scenarioId
    : null;
  const activeAssessmentScenario = getActiveAssessmentScenario(state);
  const currentAssessmentMetrics = state.session.currentUserId
    ? state.assessmentMetrics?.byAccount?.[state.session.currentUserId]
    : null;
  const activeFreeStimulus = getLatestCustomStimulusForState(state);
  const sessionIsEnding = Boolean(state.session.joined && state.session.endingStartedAt);
  const hasSideGuide = Boolean(assignedLearnApp)
    || Boolean(effectiveMode === "practice" && activePracticeScenarioId)
    || Boolean(effectiveMode === "assessment" && activeAssessmentScenario && currentAssessmentMetrics?.startedByUserAt)
    || Boolean(effectiveMode === "free" && activeFreeStimulus);
  const hasCompanionPanel = !sessionIsEnding && hasSideGuide;

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

  function getPhoneInteractionGate(target) {
    const gate = document.querySelector('[data-phone-interaction-gate="true"]');
    if (!gate) return null;
    const allowedSelector = gate.getAttribute("data-allowed-phone-target")?.trim();
    if (allowedSelector && target?.closest?.(allowedSelector)) return null;
    return gate;
  }

  function blockIfPhoneInteractionGated(event) {
    const gate = getPhoneInteractionGate(event.target);
    if (!gate) return false;
    event.preventDefault();
    event.stopPropagation();
    window.dispatchEvent(new CustomEvent("virtual-os-phone-action-blocked", {
      detail: {
        message: gate.getAttribute("data-phone-blocked-message") || "Follow the instruction on the task card first.",
      },
    }));
    return true;
  }

  function handlePointerDown(event) {
    if (blockIfPhoneInteractionGated(event)) {
      return;
    }
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
    if (blockIfPhoneInteractionGated(event)) {
      return;
    }
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
    if (blockIfPhoneInteractionGated(event)) {
      return;
    }
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
    if (blockIfPhoneInteractionGated(event)) {
      target.blur?.();
      return;
    }
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
    focusedInputs.current.set(target, { at: performance.now(), keyed: false });
    trackInteraction({
      eventType: "input_focus",
      target: describeTarget(target),
    });
  }

  function handleKeyDown(event) {
    const target = event.target;
    if (blockIfPhoneInteractionGated(event)) {
      return;
    }
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
      valueMs: performance.now() - focusState.at,
    });
  }

  function setStoredEntryMode(mode) {
    try {
      if (mode) {
        window.sessionStorage.setItem("daily-digital-entry-mode", mode);
      } else {
        window.sessionStorage.removeItem("daily-digital-entry-mode");
      }
    } catch {
      // Session storage is optional for the launcher.
    }
    setEntryMode(mode);
  }

  function handleReturnToMain() {
    setStoredEntryMode("");
    returnToMainPage();
  }

  function handleOnlineBack() {
    if (window.history.state?.dailyDigitalOnlineEntry) {
      window.history.back();
      return;
    }
    handleReturnToMain();
  }

  function handleLocalMode() {
    returnToMainPage();
    setStoredEntryMode("local-setup");
  }

  function handleOnlineMode() {
    if (!onlineAvailable) {
      setStoredEntryMode("");
      return;
    }
    setStoredEntryMode("online-active");
  }

  function handleStartLocalMode(options) {
    startLocalMode(options);
    setStoredEntryMode("local-active");
  }

  useEffect(() => {
    if (isAdminRoute || !isOnlineMode) {
      return undefined;
    }
    if (!window.history.state?.dailyDigitalOnlineEntry) {
      window.history.pushState(
        { ...(window.history.state || {}), dailyDigitalOnlineEntry: true },
        "",
        window.location.href,
      );
    }
    function handleBrowserBack() {
      handleReturnToMain();
    }
    window.addEventListener("popstate", handleBrowserBack);
    return () => window.removeEventListener("popstate", handleBrowserBack);
  }, [isAdminRoute, isOnlineMode]);

  if (!isAdminRoute && (patientEntryScreen === "landing" || patientEntryScreen === "local-setup")) {
    if (isLocalSetup) {
      return <LocalModeSetup onBack={handleReturnToMain} onStart={handleStartLocalMode} />;
    }
    return <ModeLanding onLocalMode={handleLocalMode} onOnlineMode={handleOnlineMode} onlineAvailable={onlineAvailable} />;
  }

  const simulator = (
    <section className={`simulator-stage ${hasCompanionPanel ? "with-learn-panel with-side-panel" : ""}`}>
      {!isAdminRoute && isLocalMode ? (
        <div className="patient-session-chip local-session-chip">
          <span>Local mode</span>
          <strong>No account required</strong>
          <button type="button" onClick={handleReturnToMain} data-support-ui="true">
            Main page
          </button>
        </div>
      ) : !isAdminRoute && currentAccount ? (
        <div className="patient-session-chip">
          <span>Signed in as</span>
          <strong>{formatAlias(currentAccount.alias)}</strong>
          <button type="button" onClick={() => setShowLogoutConfirm(true)} data-support-ui="true">
            Log out
          </button>
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
        <ActiveApp onReturnToMain={isOnlineMode ? handleOnlineBack : null} />
        {!sessionIsEnding ? (
          <>
            <AssessmentStartOverlay />
            <AssessmentPromptOverlay />
            <AssessmentCompleteOverlay />
          </>
        ) : null}
        <SessionEndedOverlay />
      </section>
      {!sessionIsEnding ? (
        <>
          <LearnTourOverlay />
          <PracticeGuidePanel />
          <AssessmentTaskPanel />
          <FreeTaskPanel />
        </>
      ) : null}
      {showLogoutConfirm ? (
        <aside className="logout-confirm-overlay" role="dialog" aria-modal="true" aria-label="Confirm log out" data-support-ui="true">
          <div>
            <span>Log out</span>
            <strong>Leave this account?</strong>
            <p>You will return to the login screen. The admin will no longer see this device as joined.</p>
            <div>
              <button type="button" onClick={() => setShowLogoutConfirm(false)}>Cancel</button>
              <button
                type="button"
                className="danger"
                onClick={() => {
                  setShowLogoutConfirm(false);
                  logoutUser();
                }}
              >
                Log out
              </button>
            </div>
          </div>
        </aside>
      ) : null}
    </section>
  );

  return (
    <main className={`clinical-workspace ${isAdminRoute ? "with-panel" : "patient-only"} ${isLocalMode ? "local-mode" : ""}`}>
      {isAdminRoute ? (
        <AdminAccessGate onlineAvailable={onlineAvailable}><AdminPanel /></AdminAccessGate>
      ) : isLocalMode ? (
        simulator
      ) : patientEntryScreen === "online-login" ? (
        <JoinSession onBack={handleOnlineBack} />
      ) : (
        simulator
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








