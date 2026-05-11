import { createContext, useContext, useEffect, useMemo, useReducer } from "react";
import { formalThreads, initialEvents, calendarMeta } from "./seedData";

const MINUTES_PER_DAY = 24 * 60;
const CLOCK_SPEED = 6;

const rigidAppointments = formalThreads
  .flatMap((thread) => thread.messages)
  .filter((msg) => msg.appointment)
  .map((msg) => msg.appointment);

const initialState = {
  session: {
    startedAt: Date.now(),
    firstEntryAt: null,
    completedAt: null,
  },
  currentMinutes: 8 * 60,
  currentApp: "instructions",
  appHistory: [],
  tabSwitcherOpen: false,
  tour: {
    active: false,
    step: 0,
  },
  events: initialEvents,
  scheduledSourceIds: initialEvents.map((event) => event.sourceId).filter(Boolean),
  contextSwitches: 0,
  appMutations: {
    calendar: 0,
    sms: 0,
    whatsapp: 0,
    maps: 0,
    bank: 0,
    settings: 0,
    home: 0,
  },
  lastOpenMutationSnapshot: {
    calendar: 0,
    sms: 0,
    whatsapp: 0,
    maps: 0,
    bank: 0,
    settings: 0,
    home: 0,
  },
  metrics: {
    omissionErrors: rigidAppointments.length,
    perseveration: 0,
    ruleBreaking: 0,
    contextSwitches: 0,
    whatsappReplies: {},
    whatsappConfirmed: {},
    whatsappFriendConfirmed: {},
    inhibitionFailure: {
      noiseMs: 0,
      taskMs: 0,
    },
  },
  hiddenLog: [],
};

function minutesToClock(minutes) {
  const normalized = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const h = String(Math.floor(normalized / 60)).padStart(2, "0");
  const m = String(normalized % 60).padStart(2, "0");
  return `${h}:${m}`;
}

function overlaps(a, b) {
  if ((a.month ?? calendarMeta.todayMonth) !== (b.month ?? calendarMeta.todayMonth)) {
    return false;
  }
  return a.date === b.date && a.start < b.end && b.start < a.end;
}

function calculateRuleBreaking(events) {
  let violations = 0;
  const buckets = events.reduce((acc, event) => {
    const key = `${event.year ?? calendarMeta.todayYear}-${event.month ?? calendarMeta.todayMonth}-${event.date}`;
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(event);
    return acc;
  }, {});

  Object.values(buckets).forEach((dayEvents) => {
    const sorted = [...dayEvents].sort((a, b) => a.start - b.start);
    if (sorted.length > 4) {
      violations += sorted.length - 4;
    }
    for (let i = 1; i < sorted.length; i += 1) {
      if (sorted[i].start - sorted[i - 1].end < 30) {
        violations += 1;
      }
    }
  });

  events.forEach((a, idx) => {
    if (a.rigid || a.source === "SMS") {
      return;
    }
    for (let j = 0; j < events.length; j += 1) {
      if (idx === j) {
        continue;
      }
      const b = events[j];
      if ((b.rigid || b.source === "SMS") && overlaps(a, b)) {
        violations += 1;
      }
    }
  });

  return violations;
}

function recalcMetrics(state) {
  const omissionErrors = rigidAppointments.filter((appointment) => !state.scheduledSourceIds.includes(appointment.id)).length;
  const ruleBreaking = calculateRuleBreaking(state.events);
  return {
    ...state.metrics,
    omissionErrors,
    ruleBreaking,
    contextSwitches: state.contextSwitches,
  };
}

function appendLog(state, entry) {
  return [...state.hiddenLog.slice(-399), { at: Date.now(), simClock: minutesToClock(state.currentMinutes), ...entry }];
}

function baseMetrics() {
  return {
    omissionErrors: rigidAppointments.length,
    perseveration: 0,
    ruleBreaking: 0,
    contextSwitches: 0,
    whatsappReplies: {},
    whatsappConfirmed: {},
    whatsappFriendConfirmed: {},
    inhibitionFailure: {
      noiseMs: 0,
      taskMs: 0,
    },
  };
}

function reducer(state, action) {
  switch (action.type) {
    case "TICK":
      return { ...state, currentMinutes: state.currentMinutes + action.delta };
    case "OPEN_APP": {
      const app = action.app;
      if (state.currentApp === app) {
        return state;
      }
      const prevSnapshot = state.lastOpenMutationSnapshot[app] ?? 0;
      const currMut = state.appMutations[app] ?? 0;
      const wasPerseverating = currMut === prevSnapshot;
      const next = {
        ...state,
        currentApp: app,
        tabSwitcherOpen: false,
        tour: state.tour.active ? { ...state.tour, active: false } : state.tour,
        appHistory: [...state.appHistory, state.currentApp].slice(-20),
        contextSwitches: state.contextSwitches + 1,
        metrics: {
          ...state.metrics,
          perseveration: wasPerseverating ? state.metrics.perseveration + 1 : state.metrics.perseveration,
        },
      };
      const withMetrics = { ...next, metrics: recalcMetrics(next) };
      return { ...withMetrics, hiddenLog: appendLog(withMetrics, { kind: "open_app", app }) };
    }
    case "GO_HOME": {
      if (state.currentApp === "home") {
        return { ...state, tabSwitcherOpen: false };
      }
      const next = {
        ...state,
        currentApp: "home",
        tabSwitcherOpen: false,
        tour: state.tour.active ? { ...state.tour, active: false } : state.tour,
        appHistory: [...state.appHistory, state.currentApp].slice(-20),
        contextSwitches: state.contextSwitches + 1,
        lastOpenMutationSnapshot: {
          ...state.lastOpenMutationSnapshot,
          [state.currentApp]: state.appMutations[state.currentApp] ?? 0,
        },
      };
      const withMetrics = { ...next, metrics: recalcMetrics(next) };
      return { ...withMetrics, hiddenLog: appendLog(withMetrics, { kind: "go_home" }) };
    }
    case "GO_BACK": {
      const prev = state.appHistory[state.appHistory.length - 1] || "home";
      if (prev === state.currentApp) {
        return state;
      }
      const next = {
        ...state,
        currentApp: prev,
        tabSwitcherOpen: false,
        tour: state.tour.active ? { ...state.tour, active: false } : state.tour,
        appHistory: state.appHistory.slice(0, -1),
        contextSwitches: state.contextSwitches + 1,
      };
      const withMetrics = { ...next, metrics: recalcMetrics(next) };
      return { ...withMetrics, hiddenLog: appendLog(withMetrics, { kind: "go_back", to: prev }) };
    }
    case "TOGGLE_TABS":
      return { ...state, tabSwitcherOpen: !state.tabSwitcherOpen };
    case "SET_TABS":
      return { ...state, tabSwitcherOpen: action.open };
    case "ADD_EVENT": {
      const event = action.event;
      const nextIds = event.sourceId && !state.scheduledSourceIds.includes(event.sourceId)
        ? [...state.scheduledSourceIds, event.sourceId]
        : state.scheduledSourceIds;
      const next = {
        ...state,
        session: {
          ...state.session,
          firstEntryAt: state.session.firstEntryAt ?? Date.now(),
        },
        events: [...state.events, event],
        scheduledSourceIds: nextIds,
        appMutations: {
          ...state.appMutations,
          calendar: state.appMutations.calendar + 1,
        },
      };
      const withMetrics = { ...next, metrics: recalcMetrics(next) };
      return { ...withMetrics, hiddenLog: appendLog(withMetrics, { kind: "add_event", eventId: event.id }) };
    }
    case "UPDATE_EVENT": {
      const nextEvents = state.events.map((event) => (event.id === action.id ? { ...event, ...action.patch } : event));
      const next = {
        ...state,
        events: nextEvents,
        appMutations: {
          ...state.appMutations,
          calendar: state.appMutations.calendar + 1,
        },
      };
      const withMetrics = { ...next, metrics: recalcMetrics(next) };
      return { ...withMetrics, hiddenLog: appendLog(withMetrics, { kind: "update_event", eventId: action.id }) };
    }
    case "TRACK_WA_REPLY": {
      const next = {
        ...state,
        metrics: {
          ...state.metrics,
          whatsappReplies: {
            ...state.metrics.whatsappReplies,
            [action.threadId]: (state.metrics.whatsappReplies[action.threadId] ?? 0) + 1,
          },
        },
      };
      return { ...next, hiddenLog: appendLog(next, { kind: "wa_reply", threadId: action.threadId }) };
    }
    case "TRACK_WA_CONFIRM": {
      const next = {
        ...state,
        metrics: {
          ...state.metrics,
          whatsappConfirmed: {
            ...state.metrics.whatsappConfirmed,
            [action.threadId]: true,
          },
        },
      };
      return { ...next, hiddenLog: appendLog(next, { kind: "wa_confirm", threadId: action.threadId }) };
    }
    case "TRACK_WA_FRIEND_CONFIRM": {
      const next = {
        ...state,
        metrics: {
          ...state.metrics,
          whatsappFriendConfirmed: {
            ...state.metrics.whatsappFriendConfirmed,
            [action.threadId]: true,
          },
        },
      };
      return { ...next, hiddenLog: appendLog(next, { kind: "wa_friend_confirm", threadId: action.threadId }) };
    }
    case "RESET_EVALUATION": {
      return {
        ...state,
        session: {
          startedAt: Date.now(),
          firstEntryAt: null,
          completedAt: null,
        },
        events: initialEvents,
        scheduledSourceIds: initialEvents.map((event) => event.sourceId).filter(Boolean),
        contextSwitches: 0,
        appMutations: {
          calendar: 0,
          sms: 0,
          whatsapp: 0,
          maps: 0,
          bank: 0,
          settings: 0,
          home: 0,
        },
        lastOpenMutationSnapshot: {
          calendar: 0,
          sms: 0,
          whatsapp: 0,
          maps: 0,
          bank: 0,
          settings: 0,
          home: 0,
        },
        metrics: baseMetrics(),
        hiddenLog: [],
      };
    }
    case "MARK_COMPLETED": {
      const next = {
        ...state,
        session: {
          ...state.session,
          completedAt: Date.now(),
        },
      };
      return { ...next, hiddenLog: appendLog(next, { kind: "mark_completed" }) };
    }
    case "START_ASSESSMENT": {
      const next = {
        ...state,
        currentApp: "home",
        tabSwitcherOpen: false,
        tour: {
          active: false,
          step: 0,
        },
      };
      return { ...next, hiddenLog: appendLog(next, { kind: "start_assessment" }) };
    }
    case "START_TOUR": {
      const next = {
        ...state,
        currentApp: "home",
        tabSwitcherOpen: false,
        tour: {
          active: true,
          step: 0,
        },
      };
      return { ...next, hiddenLog: appendLog(next, { kind: "start_tour" }) };
    }
    case "NEXT_TOUR_STEP": {
      if (!state.tour.active) {
        return state;
      }
      const nextStep = state.tour.step + 1;
      const steps = ["home", "calendar", "sms", "whatsapp", "settings"];
      if (nextStep >= steps.length) {
        const next = {
          ...state,
          currentApp: "home",
          tour: {
            active: false,
            step: 0,
          },
        };
        return { ...next, hiddenLog: appendLog(next, { kind: "end_tour" }) };
      }
      const next = {
        ...state,
        currentApp: steps[nextStep],
        tour: {
          ...state.tour,
          step: nextStep,
        },
      };
      return { ...next, hiddenLog: appendLog(next, { kind: "next_tour_step", step: nextStep }) };
    }
    case "END_TOUR": {
      return {
        ...state,
        tour: {
          active: false,
          step: 0,
        },
      };
    }
    default:
      return state;
  }
}

const VirtualOSContext = createContext(null);

export function VirtualOSProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    const timer = setInterval(() => {
      dispatch({ type: "TICK", delta: CLOCK_SPEED });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const api = useMemo(() => {
    return {
      state,
      helpers: { minutesToClock, rigidAppointments, todayLabel: calendarMeta.todayLabel, todayDate: calendarMeta.todayDate },
      openApp: (app) => dispatch({ type: "OPEN_APP", app }),
      goHome: () => dispatch({ type: "GO_HOME" }),
      goBack: () => dispatch({ type: "GO_BACK" }),
      toggleTabs: () => dispatch({ type: "TOGGLE_TABS" }),
      setTabsOpen: (open) => dispatch({ type: "SET_TABS", open }),
      addEvent: (event) => dispatch({ type: "ADD_EVENT", event }),
      updateEvent: (id, patch) => dispatch({ type: "UPDATE_EVENT", id, patch }),
      trackWhatsAppReply: (threadId) => dispatch({ type: "TRACK_WA_REPLY", threadId }),
      trackWhatsAppConfirmation: (threadId) => dispatch({ type: "TRACK_WA_CONFIRM", threadId }),
      trackWhatsAppFriendConfirmation: (threadId) => dispatch({ type: "TRACK_WA_FRIEND_CONFIRM", threadId }),
      resetEvaluation: () => dispatch({ type: "RESET_EVALUATION" }),
      markEvaluationCompleted: () => dispatch({ type: "MARK_COMPLETED" }),
      startAssessment: () => dispatch({ type: "START_ASSESSMENT" }),
      startTour: () => dispatch({ type: "START_TOUR" }),
      nextTourStep: () => dispatch({ type: "NEXT_TOUR_STEP" }),
      endTour: () => dispatch({ type: "END_TOUR" }),
    };
  }, [state]);

  return <VirtualOSContext.Provider value={api}>{children}</VirtualOSContext.Provider>;
}

export function useVirtualOS() {
  const ctx = useContext(VirtualOSContext);
  if (!ctx) {
    throw new Error("useVirtualOS must be used inside VirtualOSProvider");
  }
  return ctx;
}

