import { formalThreads, whatsappThreads } from "./seedData.js";
import { getStimulusStartAt } from "./sessionLifecycle.js";

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

export function getVisibleThreadIds(app, startedAt, now = Date.now()) {
  return getAvailableStimuli(startedAt, now)
    .filter((stimulus) => stimulus.app === app)
    .map((stimulus) => stimulus.threadId);
}

export function findStimulus(app, threadId) {
  return STIMULUS_SEQUENCE.find((stimulus) => stimulus.app === app && stimulus.threadId === threadId);
}

export function getLatestUnreadStimulus(state, now = Date.now()) {
  const readStimuli = new Set(state.session.readStimuli || []);
  const dismissedStimuli = new Set(state.session.dismissedStimuli || []);
  const available = getAvailableStimuli(getStimulusStartAt(state.session, state.session.currentUserId), now);
  return [...available]
    .reverse()
    .find((stimulus) => !readStimuli.has(stimulus.id) && !dismissedStimuli.has(stimulus.id));
}

export function getVisibleThreadIdsForState(app, state, now = Date.now()) {
  return getVisibleThreadIds(app, getStimulusStartAt(state.session, state.session.currentUserId), now);
}
