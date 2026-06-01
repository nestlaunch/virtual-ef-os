export function baseLearnMetrics() {
  return {
    byAccount: {},
    modulesCompleted: 0,
    completedByApp: {},
    moduleStarts: {},
    timeByAppMs: {},
    attempts: { correct: 0, total: 0 },
    byApp: {},
  };
}

export function baseLearnAccountMetrics() {
  return {
    modulesCompleted: 0,
    completedByApp: {},
    moduleStarts: {},
    timeByAppMs: {},
    attempts: { correct: 0, total: 0 },
    byApp: {},
  };
}

export function mergeLearnAccountMetrics(metrics) {
  const base = baseLearnAccountMetrics();
  return {
    ...base,
    ...(metrics || {}),
    completedByApp: {
      ...base.completedByApp,
      ...(metrics?.completedByApp || {}),
    },
    moduleStarts: {
      ...base.moduleStarts,
      ...(metrics?.moduleStarts || {}),
    },
    timeByAppMs: {
      ...base.timeByAppMs,
      ...(metrics?.timeByAppMs || {}),
    },
    attempts: {
      ...base.attempts,
      ...(metrics?.attempts || {}),
    },
    byApp: {
      ...base.byApp,
      ...(metrics?.byApp || {}),
    },
  };
}

export function mergeLearnMetrics(metrics) {
  const base = baseLearnMetrics();
  const byAccount = Object.entries(metrics?.byAccount || {}).reduce((acc, [accountId, accountMetrics]) => {
    acc[accountId] = mergeLearnAccountMetrics(accountMetrics);
    return acc;
  }, {});
  return {
    ...base,
    ...(metrics || {}),
    byAccount,
    completedByApp: {
      ...base.completedByApp,
      ...(metrics?.completedByApp || {}),
    },
    moduleStarts: {
      ...base.moduleStarts,
      ...(metrics?.moduleStarts || {}),
    },
    timeByAppMs: {
      ...base.timeByAppMs,
      ...(metrics?.timeByAppMs || {}),
    },
    attempts: {
      ...base.attempts,
      ...(metrics?.attempts || {}),
    },
    byApp: {
      ...base.byApp,
      ...(metrics?.byApp || {}),
    },
  };
}

export function getLearnAccountMetrics(stateOrMetrics, accountId) {
  const metrics = stateOrMetrics?.learnMetrics || stateOrMetrics;
  return mergeLearnAccountMetrics(metrics?.byAccount?.[accountId]);
}

function updateLearnAccuracyBucket(metrics, app, correct) {
  const safeMetrics = mergeLearnAccountMetrics(metrics);
  const appMetrics = safeMetrics.byApp?.[app] || { correct: 0, total: 0 };
  return {
    ...safeMetrics,
    attempts: {
      correct: (safeMetrics.attempts?.correct || 0) + (correct ? 1 : 0),
      total: (safeMetrics.attempts?.total || 0) + 1,
    },
    byApp: {
      ...safeMetrics.byApp,
      [app]: {
        correct: appMetrics.correct + (correct ? 1 : 0),
        total: appMetrics.total + 1,
      },
    },
  };
}

export function updateLearnAccuracy(metrics, app, correct, accountId) {
  const safeMetrics = mergeLearnMetrics(metrics);
  const nextOverall = updateLearnAccuracyBucket(safeMetrics, app, correct);
  if (!accountId) {
    return {
      ...safeMetrics,
      attempts: nextOverall.attempts,
      byApp: nextOverall.byApp,
    };
  }
  const nextAccount = updateLearnAccuracyBucket(safeMetrics.byAccount?.[accountId], app, correct);
  return {
    ...safeMetrics,
    attempts: nextOverall.attempts,
    byApp: nextOverall.byApp,
    byAccount: {
      ...safeMetrics.byAccount,
      [accountId]: nextAccount,
    },
  };
}
