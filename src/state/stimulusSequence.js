import { formalThreads, whatsappThreads } from "./seedData.js";
import { SCENARIO_LIBRARY } from "./v2Assessment.js";
import { getCurrentAssignment, getCurrentUserMode, getStimulusStartAt } from "./sessionLifecycle.js";

export const STIMULUS_SEQUENCE = [
  {
    id: "sms-doctor",
    app: "sms",
    threadId: "doctor",
    delayMs: 0,
    title: "Doctor",
    encouragement: "Record this fixed appointment in Calendar.",
  },
  {
    id: "wa-jia-wei",
    app: "whatsapp",
    threadId: "jia-wei",
    delayMs: 9000,
    title: "Jia Wei",
    encouragement: "Check Calendar before agreeing. This may conflict with the psychiatry appointment.",
  },
  {
    id: "sms-polyclinic",
    app: "sms",
    threadId: "polyclinic",
    delayMs: 18000,
    title: "Polyclinic",
    encouragement: "Add this appointment and keep enough travel time.",
  },
  {
    id: "wa-nadiah",
    app: "whatsapp",
    threadId: "nadiah",
    delayMs: 27000,
    title: "Nadiah",
    encouragement: "Compare availability against Calendar before confirming.",
  },
  {
    id: "sms-bank",
    app: "sms",
    threadId: "bank",
    delayMs: 36000,
    title: "DBS Bank",
    encouragement: "Pause and identify the safety warning.",
  },
  {
    id: "wa-family",
    app: "whatsapp",
    threadId: "family",
    delayMs: 45000,
    title: "Family Group",
    encouragement: "Check whether the evening slot is free before adding it.",
  },
];

function previewFor(stimulus) {
  if (stimulus.preview) {
    return stimulus.preview;
  }
  if (stimulus.app === "sms") {
    return formalThreads.find((thread) => thread.id === stimulus.threadId)?.preview || "";
  }
  const thread = whatsappThreads.find((item) => item.id === stimulus.threadId);
  return thread?.messages?.at(-1)?.text || "";
}

export function getAvailableStimuli(startedAt, now = Date.now()) {
  const elapsed = Math.max(0, now - (startedAt || now));
  return STIMULUS_SEQUENCE
    .filter((stimulus) => elapsed >= stimulus.delayMs)
    .map((stimulus) => ({ ...stimulus, preview: previewFor(stimulus) }));
}

function getScenarioForAssignment(session, accountId, mode) {
  const assignment = getCurrentAssignment(session, accountId, mode);
  if (!assignment) return null;
  return [...SCENARIO_LIBRARY, ...(session.customScenarios || [])].find((scenario) => scenario.id === assignment.scenarioId) || null;
}

function stimulusMatchesScenario(stimulus, scenario) {
  if (!scenario) return false;
  if (stimulus.app === "sms") return scenario.apps?.includes("messages");
  return scenario.apps?.includes("whatsapp");
}

function customStimuliFor(session, accountId, mode, now = Date.now()) {
  return (session.customStimuli || [])
    .filter((stimulus) => !stimulus.targetId || stimulus.targetId === "all" || stimulus.targetId === accountId)
    .filter((stimulus) => !stimulus.mode || stimulus.mode === mode)
    .filter((stimulus) => now >= (stimulus.pushedAt || 0))
    .map((stimulus) => ({
      ...stimulus,
      custom: true,
      preview: previewFor(stimulus),
    }));
}

export function getAvailableStimuliForState(state, now = Date.now()) {
  const accountId = state.session.currentUserId;
  const mode = getCurrentUserMode(state.session, accountId);
  const scenario = getScenarioForAssignment(state.session, accountId, mode);
  const startedAt = getStimulusStartAt(state.session, accountId, mode);
  const custom = customStimuliFor(state.session, accountId, mode, now);

  if (mode === "free") {
    return custom;
  }
  if (mode === "learn") {
    const learnApp = state.session.learnModules?.[accountId];
    if (learnApp === "sms") {
      return [STIMULUS_SEQUENCE.find((stimulus) => stimulus.id === "sms-doctor")]
        .filter(Boolean)
        .map((stimulus) => ({ ...stimulus, preview: previewFor(stimulus) }));
    }
    if (learnApp === "whatsapp") {
      return [STIMULUS_SEQUENCE.find((stimulus) => stimulus.id === "wa-family")]
        .filter(Boolean)
        .map((stimulus) => ({ ...stimulus, preview: previewFor(stimulus) }));
    }
    return [];
  }
  if (!["practice", "assessment"].includes(mode)) {
    return [];
  }

  return [
    ...getAvailableStimuli(startedAt, now).filter((stimulus) => stimulusMatchesScenario(stimulus, scenario)),
    ...custom,
  ];
}

export function getVisibleThreadIds(app, startedAt, now = Date.now()) {
  return getAvailableStimuli(startedAt, now)
    .filter((stimulus) => stimulus.app === app)
    .map((stimulus) => stimulus.threadId);
}

export function findStimulus(app, threadId) {
  return STIMULUS_SEQUENCE.find((stimulus) => stimulus.app === app && stimulus.threadId === threadId);
}

export function getLatestUnreadStimulus(state, now = Date.now()) {
  const accountId = state.session.currentUserId;
  const mode = getCurrentUserMode(state.session, accountId);
  if (!["practice", "assessment"].includes(mode)) {
    return null;
  }
  const readStimuli = new Set(state.session.readStimuli || []);
  const dismissedStimuli = new Set(state.session.dismissedStimuli || []);
  const available = getAvailableStimuliForState(state, now);
  return [...available]
    .reverse()
    .find((stimulus) => !readStimuli.has(stimulus.id) && !dismissedStimuli.has(stimulus.id));
}

export function getVisibleThreadIdsForState(app, state, now = Date.now()) {
  return getAvailableStimuliForState(state, now)
    .filter((stimulus) => stimulus.app === app)
    .map((stimulus) => stimulus.threadId);
}

export function findStimulusForState(app, threadId, state, now = Date.now()) {
  return getAvailableStimuliForState(state, now).find((stimulus) => stimulus.app === app && stimulus.threadId === threadId)
    || findStimulus(app, threadId);
}

export function getCustomStimuliForApp(state, app, now = Date.now()) {
  return getAvailableStimuliForState(state, now)
    .filter((stimulus) => stimulus.custom && stimulus.app === app);
}

export function getLatestCustomStimulusForState(state, now = Date.now()) {
  const accountId = state.session.currentUserId;
  const mode = getCurrentUserMode(state.session, accountId);
  if (mode !== "free") {
    return null;
  }
  return customStimuliFor(state.session, accountId, mode, now).at(-1) || null;
}
