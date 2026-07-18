import { normalizeSessionShape } from "./sessionStore.js";

function nextControlRevision(session) {
  return Math.max(0, Number(session?.controlRevision) || 0) + 1;
}

export function preserveLocalSessionIdentity(localSession, sharedSession) {
  const safeLocalSession = normalizeSessionShape(localSession);
  const safeSharedSession = normalizeSessionShape(sharedSession);
  const currentUserId = safeLocalSession.currentUserId;
  const localParticipant = currentUserId
    ? safeLocalSession.participants.find((participant) => participant.accountId === currentUserId)
    : null;
  const sharedParticipant = currentUserId
    ? safeSharedSession.participants.find((participant) => participant.accountId === currentUserId)
    : null;
  const assignmentChanged = Boolean(sharedParticipant) && (
    sharedParticipant.activeScenarioId !== localParticipant?.activeScenarioId
    || sharedParticipant.mode !== localParticipant?.mode
  );
  const localUserStillJoined = !currentUserId || Boolean(sharedParticipant);
  return {
    ...safeSharedSession,
    joined: localUserStillJoined ? safeLocalSession.joined : false,
    deviceId: safeLocalSession.deviceId,
    currentUserId: localUserStillJoined ? currentUserId : null,
    pendingAlias: safeLocalSession.pendingAlias,
    pendingUserPin: safeLocalSession.pendingUserPin,
    readStimuli: localUserStillJoined && !assignmentChanged ? safeLocalSession.readStimuli : [],
    dismissedStimuli: localUserStillJoined && !assignmentChanged ? safeLocalSession.dismissedStimuli : [],
  };
}

export function getCurrentAssignment(session, accountId, mode = null) {
  if (!accountId) {
    return null;
  }
  const assignments = session.assignments?.[accountId] || [];
  const scoped = mode ? assignments.filter((assignment) => assignment.mode === mode) : assignments;
  return scoped.at(-1) || null;
}

export function getCurrentUserMode(session, accountId) {
  return accountId ? session.userModes?.[accountId] || session.mode || "free" : session.mode || "free";
}

export function getStimulusStartAt(session, accountId, mode = null) {
  const assignments = session.assignments?.[accountId] || [];
  const effectiveMode = mode || getCurrentUserMode(session, accountId);
  const scopedAssignment = effectiveMode
    ? assignments.filter((assignment) => assignment.mode === effectiveMode).at(-1)
    : null;
  if (scopedAssignment) {
    return scopedAssignment.pushedAt || session.startedAt;
  }
  const hasModeScopedAssignments = assignments.some((assignment) => assignment.mode);
  const legacyAssignment = hasModeScopedAssignments ? null : assignments.at(-1);
  return legacyAssignment?.pushedAt || session.startedAt;
}

export function shouldAdoptSharedApp(localState, sharedSnapshot) {
  const accountId = localState.session.currentUserId;
  if (!accountId) {
    return true;
  }
  const localParticipant = localState.session.participants.find((participant) => participant.accountId === accountId);
  const sharedParticipant = sharedSnapshot.session?.participants?.find((participant) => participant.accountId === accountId);
  if (!sharedParticipant) {
    return false;
  }
  return (
    sharedParticipant.activeScenarioId !== localParticipant?.activeScenarioId
    || sharedParticipant.mode !== localParticipant?.mode
  );
}

export function resolveInitialCurrentApp(storedLiveState, localDeviceState, fallback = "home") {
  const globalApp = storedLiveState?.currentApp === "instructions"
    ? "home"
    : storedLiveState?.currentApp;
  const accountId = localDeviceState?.currentUserId;
  if (!accountId) {
    return globalApp || fallback;
  }
  const participantApp = storedLiveState?.session?.participants
    ?.find((participant) => participant.accountId === accountId)
    ?.currentApp;
  return participantApp === "instructions" ? "home" : participantApp || globalApp || fallback;
}

export function invalidateCompletedSessionPin(session, nextPin, completedAt) {
  return {
    ...session,
    pin: nextPin,
    completedAt,
    endingStartedAt: completedAt,
    endedAt: completedAt + 30000,
  };
}

export function clearEndedSessionForPush(session) {
  return {
    ...session,
    completedAt: null,
    endingStartedAt: null,
    endedAt: null,
  };
}

export function resetSessionForNewPin(session, options) {
  const {
    pin,
    deviceId,
    startedAt,
  } = options;
  return {
    ...session,
    controlRevision: 0,
    pin,
    joined: false,
    joinError: "",
    deviceId,
    participants: [],
    currentUserId: null,
    readStimuli: [],
    dismissedStimuli: [],
    userModes: {},
    assignments: {},
    learnModules: {},
    customStimuli: [],
    experienceRatings: {},
    startedAt,
    firstEntryAt: null,
    completedAt: null,
    endingStartedAt: null,
    endedAt: null,
  };
}

export function canJoinActiveSession(session) {
  return !session?.completedAt && !session?.endingStartedAt && !session?.endedAt;
}

export function startAssessmentTiming(metrics = {}, now) {
  return {
    ...metrics,
    startedByUserAt: now,
    completedAt: null,
    lastActionAt: now,
    timeToFirstActionMs: null,
    actionCount: 0,
    tapCount: 0,
    actionIntervalsMs: [],
    currentPrompt: null,
    promptResponseTimesMs: [],
  };
}

export function resolvePushTargets(session, targetId) {
  const livePatientIds = new Set(
    (session.participants || [])
      .filter((participant) => participant.role === "patient" && participant.accountId)
      .map((participant) => participant.accountId),
  );
  if (targetId === "all") {
    return [...livePatientIds];
  }
  return livePatientIds.has(targetId) ? [targetId] : [];
}

export function applyScenarioAssignment(session, options) {
  const {
    mode,
    scenarioId,
    targets,
    assignmentId,
    now,
    firstCurrentApp = "home",
  } = options;
  const assignment = {
    id: assignmentId,
    scenarioId,
    mode,
    pushedAt: now,
  };
  const assignments = { ...(session.assignments || {}) };
  targets.forEach((targetId) => {
    assignments[targetId] = [...(assignments[targetId] || []), assignment];
  });
  const userModes = { ...(session.userModes || {}) };
  targets.forEach((targetId) => {
    userModes[targetId] = mode;
  });
  const learnModules = { ...(session.learnModules || {}) };
  targets.forEach((targetId) => {
    delete learnModules[targetId];
  });
  const participants = (session.participants || []).map((participant) => (
    targets.includes(participant.accountId)
      ? {
          ...participant,
          activeScenarioId: scenarioId,
          mode,
          currentApp: firstCurrentApp,
          lastSeenAt: now,
        }
      : participant
  ));
  const localTargeted = targets.includes(session.currentUserId);

  return {
    session: {
      ...clearEndedSessionForPush(session),
      controlRevision: nextControlRevision(session),
      mode,
      readStimuli: localTargeted ? [] : session.readStimuli,
      dismissedStimuli: localTargeted ? [] : session.dismissedStimuli,
      userModes,
      learnModules,
      assignments,
      participants,
    },
    assignment,
    localTargeted,
  };
}

export function applyLearnModuleAssignment(session, options) {
  const {
    accountId,
    app,
    assignmentId,
    now,
  } = options;
  const liveTarget = (session.participants || []).some((participant) => (
    participant.role === "patient" && participant.accountId === accountId
  ));
  if (!liveTarget) {
    return null;
  }
  const assignment = {
    id: assignmentId,
    scenarioId: `learn-${app}`,
    mode: "learn",
    pushedAt: now,
  };
  const assignments = {
    ...(session.assignments || {}),
    [accountId]: [
      ...(session.assignments?.[accountId] || []),
      assignment,
    ],
  };
  const participants = (session.participants || []).map((participant) => (
    participant.accountId === accountId
      ? { ...participant, mode: "learn", activeScenarioId: assignment.scenarioId, currentApp: app, lastSeenAt: now }
      : participant
  ));
  const localTargeted = session.currentUserId === accountId;

  return {
    session: {
      ...clearEndedSessionForPush(session),
      controlRevision: nextControlRevision(session),
      mode: "learn",
      userModes: {
        ...(session.userModes || {}),
        [accountId]: "learn",
      },
      assignments,
      learnModules: {
        ...(session.learnModules || {}),
        [accountId]: app,
      },
      participants,
    },
    assignment,
    localTargeted,
  };
}

export function applyModeSelection(session, options) {
  const {
    accountId,
    mode,
    now,
    firstCurrentApp = "home",
  } = options;
  if (!accountId) {
    return null;
  }
  const liveTarget = (session.participants || []).some((participant) => (
    participant.role === "patient" && participant.accountId === accountId
  ));
  if (!liveTarget) {
    return null;
  }
  const assignments = { ...(session.assignments || {}) };
  delete assignments[accountId];
  const learnModules = { ...(session.learnModules || {}) };
  delete learnModules[accountId];
  const userModes = {
    ...(session.userModes || {}),
    [accountId]: mode,
  };
  const participants = (session.participants || []).map((participant) => (
    participant.accountId === accountId
      ? {
          ...participant,
          mode,
          activeScenarioId: "",
          currentApp: firstCurrentApp,
          lastSeenAt: now,
        }
      : participant
  ));
  const localTargeted = session.currentUserId === accountId;

  return {
    session: {
      ...clearEndedSessionForPush(session),
      controlRevision: nextControlRevision(session),
      mode,
      readStimuli: localTargeted ? [] : session.readStimuli,
      dismissedStimuli: localTargeted ? [] : session.dismissedStimuli,
      userModes,
      assignments,
      learnModules,
      participants,
    },
    localTargeted,
  };
}

export function attachExperienceRatingToRecords(records, accountId, rating, ratedAt) {
  return (records || []).map((record) => {
    const hasParticipant = (record.participants || []).some((participant) => participant.accountId === accountId);
    if (!hasParticipant) {
      return record;
    }
    return {
      ...record,
      experienceRatings: {
        ...(record.experienceRatings || {}),
        [accountId]: rating,
      },
      participants: record.participants.map((participant) => (
        participant.accountId === accountId
          ? {
              ...participant,
              experienceRating: rating,
              experienceRatedAt: ratedAt,
            }
          : participant
      )),
    };
  });
}
