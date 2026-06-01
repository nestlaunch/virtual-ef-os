export function canSubmitAssessmentTask(answerChecks = [], answerStatus = {}) {
  return answerChecks.length === 0 || answerChecks.every((check) => ["correct", "wrong"].includes(answerStatus[check.id]));
}
