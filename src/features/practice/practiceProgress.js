export function completedStepsMap(completedSteps = []) {
  return completedSteps.reduce((acc, stepId) => {
    acc[stepId] = true;
    return acc;
  }, {});
}

export function firstIncompleteIndex(steps = [], completed = {}) {
  const index = steps.findIndex((step) => !completed[step.id]);
  return index === -1 ? Math.max(0, steps.length - 1) : index;
}

export function getDetectedPracticeStep(steps = [], completed = {}, eventLike = null, pendingStepId = "") {
  if (pendingStepId) {
    return null;
  }
  const nextStep = steps[firstIncompleteIndex(steps, completed)];
  if (!nextStep || completed[nextStep.id]) {
    return null;
  }
  return nextStep.isDone?.(eventLike) ? nextStep : null;
}

export function getDetectedObservedStep(steps = [], completed = {}, eventLike = null) {
  return steps.find((step) => !completed[step.id] && step.isDone?.(eventLike)) || null;
}

export function getPracticeCompletionPatch(steps = [], completed = {}, pendingStepId = "") {
  if (!pendingStepId || completed[pendingStepId]) {
    return null;
  }
  const nextCompletedCount = Object.keys(completed).length + 1;
  return {
    stepId: pendingStepId,
    isComplete: nextCompletedCount >= steps.length,
  };
}

export function shouldCountPracticeMiss(nextStep, eventLike = null) {
  if (!nextStep || nextStep.answers?.length) {
    return false;
  }
  if (!["click", "change"].includes(eventLike?.type)) {
    return false;
  }
  const target = eventLike.target;
  if (target) {
    const isControlSetupClick = target.matches?.("input, textarea, select, option")
      || target.closest?.([
        ".date-wheel-fields",
        ".date-wheel-part",
        ".time-edit",
        ".title-input",
        ".wa-input-row",
        ".maps-field",
        ".bank-amount-form",
        ".bank-account-select",
      ].join(","));
    if (isControlSetupClick) {
      return false;
    }
  }
  return true;
}
