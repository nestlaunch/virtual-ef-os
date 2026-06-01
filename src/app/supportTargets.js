export const SUPPORT_TARGET_SELECTORS = [
  "[data-assessment-control]",
  "[data-support-ui]",
  ".learn-tour-card",
  ".learn-success-page",
  ".practice-guide-card",
  ".practice-answer-box",
  ".assessment-task-card",
  ".assessment-start-overlay",
  ".assessment-complete-overlay",
  ".assessment-answer-box",
  ".assessment-prompt-toast",
  ".stimulus-notification",
  ".session-ended-card",
];

export function isSupportTarget(target) {
  return Boolean(target?.closest?.(SUPPORT_TARGET_SELECTORS.join(",")));
}
