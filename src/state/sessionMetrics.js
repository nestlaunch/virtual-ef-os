export function summarizeInteractions(actions, accountId = null, sessionStartedAt = null) {
  const relevant = (actions || []).filter((entry) => !accountId || entry.accountId === accountId);
  const firstTimedAction = relevant.find((entry) => typeof entry.at === "number");
  const typingLatencyEntries = relevant.filter((entry) => entry.kind === "typing_latency" && typeof entry.valueMs === "number");
  const contextSwitches = relevant.filter((entry) => ["open_app", "go_home", "go_back"].includes(entry.kind)).length;

  return {
    clicks: relevant.filter((entry) => entry.kind === "click").length,
    inputFocuses: relevant.filter((entry) => entry.kind === "input_focus").length,
    typingStarts: typingLatencyEntries.length,
    typingLatencyTotalMs: typingLatencyEntries.reduce((sum, entry) => sum + Math.max(0, entry.valueMs || 0), 0),
    typingLatencySamples: typingLatencyEntries.length,
    backPresses: relevant.filter((entry) => entry.kind === "go_back").length,
    homePresses: relevant.filter((entry) => entry.kind === "go_home").length,
    recentPresses: relevant.filter((entry) => entry.kind === "toggle_tabs").length,
    cueCount: relevant.filter((entry) => ["admin_cue", "assessment_prompt", "practice_prompt"].includes(entry.kind)).length,
    contextSwitches,
    timeToFirstActionMs: firstTimedAction && typeof sessionStartedAt === "number"
      ? Math.max(0, firstTimedAction.at - sessionStartedAt)
      : null,
  };
}

export function filterEvidenceActions(actions, options = {}) {
  const {
    accountId = null,
    sinceAt = null,
    kinds = null,
  } = options;
  const kindSet = Array.isArray(kinds) ? new Set(kinds) : null;
  return (actions || []).filter((entry) => {
    if (accountId && entry.accountId !== accountId) {
      return false;
    }
    if (typeof sinceAt === "number" && typeof entry.at === "number" && entry.at < sinceAt) {
      return false;
    }
    if (kindSet && !kindSet.has(entry.kind)) {
      return false;
    }
    return true;
  });
}

export function filterEvidenceEvents(events, options = {}) {
  const {
    accountId = null,
    sinceAt = null,
    source = null,
  } = options;
  return (events || []).filter((event) => {
    if (accountId && event.accountId !== accountId) {
      return false;
    }
    if (source && event.source !== source) {
      return false;
    }
    if (typeof sinceAt === "number") {
      const eventAt = event.updatedAt || event.createdAt || null;
      if (typeof eventAt !== "number" || eventAt < sinceAt) {
        return false;
      }
    }
    return true;
  });
}
