import { SCENARIO_LIBRARY } from "../../state/v2Assessment.js";
import { getTaskAnswerIds } from "../taskAnswerChecks.js";

function text(value) {
  return String(value || "").toLowerCase();
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function getRecordActions(item) {
  return item.taskEvidence?.recentActions || [];
}

function recordOpenedApp(item, app) {
  return getRecordActions(item).some((entry) => entry.kind === "open_app" && entry.app === app);
}

function recordClicked(item, target) {
  const needle = text(target);
  return getRecordActions(item).some((entry) => text(entry.target).includes(needle));
}

function taskAnswersForIds(item, ids) {
  const idSet = new Set(ids);
  return getRecordActions(item).filter((entry) => (
    (entry.kind === "practice_answer" && (idSet.has(entry.stepId) || idSet.has(entry.answerCheckId)))
    || (entry.kind === "assessment_answer" && idSet.has(entry.checkId))
  ));
}

function summarizeAnswerEvidence(item, ids) {
  const attempts = taskAnswersForIds(item, ids);
  if (attempts.length === 0) {
    return null;
  }
  const correct = attempts.filter((entry) => entry.correct).length;
  return `Task-card answer ${correct}/${attempts.length} correct`;
}

function hasTaskAnswerEvidenceForIds(item, ids) {
  return taskAnswersForIds(item, ids).length > 0;
}

function recordAnsweredTaskItem(item, ids) {
  return taskAnswersForIds(item, ids).some((entry) => entry.correct);
}

export function getPracticeAnswerAccuracy(item) {
  const attempts = item.practiceMetrics?.answerAttempts
    ?? getRecordActions(item).filter((entry) => entry.kind === "practice_answer").length;
  const correct = item.practiceMetrics?.correctAnswers
    ?? getRecordActions(item).filter((entry) => entry.kind === "practice_answer" && entry.correct).length;
  if (!attempts) {
    return null;
  }
  return {
    correct,
    attempts,
    pct: Math.round((correct / attempts) * 100),
  };
}

export function getAssessmentAnswerAccuracy(item) {
  const attempts = item.assessmentMetrics?.answerAttempts
    ?? getRecordActions(item).filter((entry) => entry.kind === "assessment_answer").length;
  const correct = item.assessmentMetrics?.correctAnswers
    ?? getRecordActions(item).filter((entry) => entry.kind === "assessment_answer" && entry.correct).length;
  if (!attempts) {
    return null;
  }
  return {
    correct,
    attempts,
    pct: Math.round((correct / attempts) * 100),
  };
}

export function getTaskAnswerAccuracy(item) {
  return getPracticeAnswerAccuracy(item) || getAssessmentAnswerAccuracy(item);
}

export function getCompletedFunctionalStepIds(item) {
  const practiceSteps = item.practiceMetrics?.completedSteps || [];
  const assessmentSteps = item.assessmentMetrics?.completedSteps || [];
  return [...new Set([...practiceSteps, ...assessmentSteps])];
}

export function formatFunctionalStepId(stepId) {
  return String(stepId || "")
    .split("-")
    .filter(Boolean)
    .map((part) => part.length <= 3 ? part.toUpperCase() : `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export function percentChange(first, latest, lowerIsBetter = false) {
  if (typeof first !== "number" || typeof latest !== "number" || first <= 0) return "-";
  const delta = ((latest - first) / first) * 100;
  const value = Math.round(Math.abs(delta));
  if (value === 0) return "0% change";
  const improved = lowerIsBetter ? delta < 0 : delta > 0;
  return `${value}% ${improved ? "improved" : "worse"}`;
}

export function getScenarioForRecord(item) {
  return SCENARIO_LIBRARY.find((scenario) => scenario.id === item.scenarioId) || {
    id: item.scenarioId || "",
    title: item.scenarioTitle || "Unassigned session",
    apps: item.apps || [],
    successCriteria: [],
  };
}

export function checkRecordCriterion(item, criterion) {
  const c = text(criterion);
  const evidence = item.taskEvidence || {};
  if (["messages", "sms"].includes(c)) return recordOpenedApp(item, "sms");
  if (c === "calendar") return recordOpenedApp(item, "calendar");
  if (c === "whatsapp") return recordOpenedApp(item, "whatsapp");
  if (c === "maps") return recordOpenedApp(item, "maps");
  if (c === "bank") return recordOpenedApp(item, "bank");
  if (c === "singpass") return recordOpenedApp(item, "singpass");
  if (c === "home") return recordOpenedApp(item, "home") || getRecordActions(item).some((entry) => entry.kind === "go_home");
  if (c.includes("open messages")) return recordOpenedApp(item, "sms");
  if (c.includes("open calendar")) return recordOpenedApp(item, "calendar");
  if (c.includes("open maps")) return recordOpenedApp(item, "maps");
  if (c.includes("open bank")) return recordOpenedApp(item, "bank");
  if (c.includes("open singpass")) return recordOpenedApp(item, "singpass");
  if (c.includes("open family")) return recordOpenedApp(item, "whatsapp") || recordClicked(item, "family");
  if (c.includes("doctor") || c.includes("read doctor") || c.includes("read appointment") || c.includes("appointment message") || c.includes("identify")) {
    const answerIds = getTaskAnswerIds("appointmentDetails");
    const answerChecked = hasTaskAnswerEvidenceForIds(item, answerIds);
    const answerCorrect = recordAnsweredTaskItem(item, answerIds);
    return answerChecked ? answerCorrect : recordClicked(item, "doctor") || (evidence.calendar?.scheduledFromMessages || 0) > 0;
  }
  if (c.includes("read location") || c.includes("clinic location") || c.includes("check calendar appointment")) {
    const answerIds = getTaskAnswerIds("clinicLocation");
    const answerChecked = hasTaskAnswerEvidenceForIds(item, answerIds);
    const answerCorrect = recordAnsweredTaskItem(item, answerIds);
    if (answerChecked) return answerCorrect;
  }
  if (
    c.includes("calendar")
    || c.includes("psychiatry")
    || c.includes("save appointment")
    || c.includes("save event")
    || /\b(set|select)\s+\d{1,2}\s+[a-z]{3}\s+\d{4}/i.test(c)
  ) return (evidence.calendar?.manualEntries || 0) > 0 || (evidence.calendar?.scheduledFromMessages || 0) > 0;
  if (c.includes("reply") || c.includes("send")) return (evidence.whatsapp?.totalReplies || 0) > 0;
  if (c.includes("duration") || c.includes("read route duration") || c.includes("travel duration")) {
    const answerIds = getTaskAnswerIds("routeDuration");
    const answerChecked = hasTaskAnswerEvidenceForIds(item, answerIds);
    const answerCorrect = recordAnsweredTaskItem(item, answerIds);
    if (answerChecked) return answerCorrect;
  }
  if (c.includes("set start") || c.includes("set destination") || c.includes("public transport") || c.includes("directions") || c.includes("duration") || c.includes("route") || c.includes("travel")) {
    return recordOpenedApp(item, "maps") && getRecordActions(item).some((entry) => {
      const target = text(entry.target);
      return target.includes("directions") || target.includes("route") || target.includes("maps-field") || target.includes("maps-route-options") || target.includes("select");
    });
  }
  if (c.includes("balance") || c.includes("check total balance")) {
    const answerIds = getTaskAnswerIds("bankBalance");
    const answerChecked = hasTaskAnswerEvidenceForIds(item, answerIds);
    const answerCorrect = recordAnsweredTaskItem(item, answerIds);
    if (answerChecked) return answerCorrect;
  }
  if (c.includes("review before approving") || c.includes("review and approve") || c.includes("pay hougang") || c.includes("payment recipient")) {
    const answerIds = getTaskAnswerIds("paymentDetails");
    const answerChecked = hasTaskAnswerEvidenceForIds(item, answerIds);
    const answerCorrect = recordAnsweredTaskItem(item, answerIds);
    if (answerChecked) return answerCorrect;
  }
  if (c.includes("match recipient") || c.includes("match singpass")) {
    return recordOpenedApp(item, "singpass") && hasTaskAnswerEvidenceForIds(item, getTaskAnswerIds("paymentDetails"));
  }
  if (c.includes("approve payment in singpass")) {
    return getRecordActions(item).some((entry) => entry.kind === "singpass_approved");
  }
  if (c.includes("balance") || c.includes("hougang") || c.includes("amount") || c.includes("purpose") || c.includes("payment") || c.includes("pay") || c.includes("approve") || c.includes("review")) {
    return recordOpenedApp(item, "bank") && getRecordActions(item).some((entry) => {
      const target = text(entry.target);
      return target.includes("bank") || target.includes("payee") || target.includes("amount") || target.includes("review") || target.includes("confirm");
    });
  }
  return false;
}

export function getCriterionEvidenceDetail(item, criterion) {
  const c = text(criterion);
  const evidence = item.taskEvidence || {};
  const actions = getRecordActions(item);

  if (["messages", "sms"].includes(c) || c.includes("open messages")) {
    return recordOpenedApp(item, "sms") ? "Messages app opened" : "Messages app not opened";
  }
  if (c === "calendar" || c.includes("open calendar")) {
    return recordOpenedApp(item, "calendar") ? "Calendar app opened" : "Calendar app not opened";
  }
  if (c === "whatsapp" || c.includes("open family")) {
    return recordOpenedApp(item, "whatsapp") || recordClicked(item, "family")
      ? "WhatsApp/family chat opened"
      : "WhatsApp/family chat not detected";
  }
  if (c === "maps" || c.includes("open maps")) {
    return recordOpenedApp(item, "maps") ? "Maps app opened" : "Maps app not opened";
  }
  if (c === "bank" || c.includes("open bank")) {
    return recordOpenedApp(item, "bank") ? "Bank app opened" : "Bank app not opened";
  }
  if (c === "singpass" || c.includes("open singpass")) {
    return recordOpenedApp(item, "singpass") ? "Singpass app opened" : "Singpass app not opened";
  }

  if (c.includes("doctor") || c.includes("read doctor") || c.includes("read appointment") || c.includes("appointment message") || c.includes("identify")) {
    return summarizeAnswerEvidence(item, getTaskAnswerIds("appointmentDetails"))
      || (recordClicked(item, "doctor") ? "Doctor message row opened" : "Doctor message not detected");
  }
  if (c.includes("read location") || c.includes("clinic location") || c.includes("check calendar appointment")) {
    return summarizeAnswerEvidence(item, getTaskAnswerIds("clinicLocation"))
      || (recordClicked(item, "clinic") ? "Clinic detail viewed" : "Clinic detail not confirmed");
  }
  if (c.includes("duration") || c.includes("read route duration") || c.includes("travel duration")) {
    return summarizeAnswerEvidence(item, getTaskAnswerIds("routeDuration"))
      || (actions.some((entry) => text(entry.target).includes("directions") || text(entry.target).includes("route"))
        ? "Route/directions action detected"
        : "Route duration not confirmed");
  }
  if (c.includes("balance") || c.includes("check total balance")) {
    return summarizeAnswerEvidence(item, getTaskAnswerIds("bankBalance"))
      || (recordOpenedApp(item, "bank") ? "Bank balance screen visited" : "Bank balance not confirmed");
  }
  if (c.includes("review before approving") || c.includes("review and approve") || c.includes("pay hougang") || c.includes("payment recipient")) {
    return summarizeAnswerEvidence(item, getTaskAnswerIds("paymentDetails"))
      || (actions.some((entry) => text(entry.target).includes("review") || text(entry.target).includes("confirm"))
        ? "Payment review/confirm action detected"
        : "Payment details not confirmed");
  }
  if (c.includes("match recipient") || c.includes("match singpass")) {
    return summarizeAnswerEvidence(item, getTaskAnswerIds("paymentDetails"))
      || (recordOpenedApp(item, "singpass") ? "Singpass details viewed" : "Singpass request not opened");
  }
  if (c.includes("approve payment in singpass")) {
    return getRecordActions(item).some((entry) => entry.kind === "singpass_approved")
      ? "Singpass approval detected"
      : "Singpass approval not detected";
  }
  if (
    c.includes("calendar")
    || c.includes("psychiatry")
    || c.includes("save appointment")
    || c.includes("save event")
    || /\b(set|select)\s+\d{1,2}\s+[a-z]{3}\s+\d{4}/i.test(c)
  ) {
    const manual = evidence.calendar?.manualEntries || 0;
    const scheduled = evidence.calendar?.scheduledFromMessages || 0;
    return manual || scheduled
      ? `${manual} manual calendar entr${manual === 1 ? "y" : "ies"}; ${scheduled} SMS-scheduled appointment${scheduled === 1 ? "" : "s"}`
      : "Matching calendar entry not detected";
  }
  if (c.includes("reply") || c.includes("send")) {
    const replies = evidence.whatsapp?.totalReplies || 0;
    return replies ? `${replies} WhatsApp repl${replies === 1 ? "y" : "ies"} sent` : "Reply not detected";
  }
  if (c.includes("set start") || c.includes("set destination") || c.includes("public transport") || c.includes("directions") || c.includes("route") || c.includes("travel")) {
    const mapActions = actions.filter((entry) => text(entry.target).includes("maps") || text(entry.target).includes("route") || text(entry.target).includes("directions") || text(entry.target).includes("select"));
    return mapActions.length ? `${mapActions.length} map route action${mapActions.length === 1 ? "" : "s"} detected` : "Route-planning action not detected";
  }
  if (c.includes("hougang") || c.includes("amount") || c.includes("purpose") || c.includes("payment") || c.includes("pay") || c.includes("approve") || c.includes("review")) {
    const bankActions = actions.filter((entry) => text(entry.target).includes("bank") || text(entry.target).includes("payee") || text(entry.target).includes("amount") || text(entry.target).includes("review") || text(entry.target).includes("confirm"));
    return bankActions.length ? `${bankActions.length} banking/payment action${bankActions.length === 1 ? "" : "s"} detected` : "Banking/payment action not detected";
  }
  return checkRecordCriterion(item, criterion) ? "Objective app evidence detected" : "No objective evidence detected";
}

export function getFunctionalCompletion(item) {
  const scenario = getScenarioForRecord(item);
  const criteria = scenario.successCriteria?.length ? scenario.successCriteria : item.apps || [];
  if (criteria.length === 0) return null;
  const done = criteria.filter((criterion) => checkRecordCriterion(item, criterion)).length;
  return { done, total: criteria.length, pct: Math.round((done / criteria.length) * 100), criteria };
}

export function getCriterionDomain(criterion) {
  const c = text(criterion);
  if (c.includes("review") || c.includes("correct") || c.includes("before approving") || c.includes("before confirming")) {
    return "Self-monitoring";
  }
  if (
    c.includes("read")
    || c.includes("identify")
    || c.includes("check total balance")
    || c.includes("check calendar appointment")
    || c.includes("read duration")
    || c.includes("read location")
  ) {
    return "Information extraction";
  }
  if (
    c.includes("open")
    || c.includes("choose")
    || c.includes("select")
    || c.includes("set start")
    || c.includes("set destination")
    || c.includes("set home to")
  ) {
    return "App navigation";
  }
  if (c.includes("plan route")) {
    return "Sequencing";
  }
  if (c.includes("enter") || c.includes("type") || c.includes("send") || c.includes("reply") || c.includes("save") || c.includes("pay")) {
    return "Task execution";
  }
  if (c.includes("route") || c.includes("calendar") || c.includes("appointment")) {
    return "Sequencing";
  }
  return "Task execution";
}

export function summarizeCriteriaByDomain(item) {
  const completion = getFunctionalCompletion(item);
  const criteria = completion?.criteria || [];
  return criteria.reduce((acc, criterion) => {
    const domain = getCriterionDomain(criterion);
    if (!acc[domain]) {
      acc[domain] = { total: 0, done: 0 };
    }
    acc[domain].total += 1;
    if (checkRecordCriterion(item, criterion)) {
      acc[domain].done += 1;
    }
    return acc;
  }, {});
}

function pct(done, total) {
  return total > 0 ? Math.round((done / total) * 100) : null;
}

function latestPromptText(item) {
  const prompts = [
    ...(item.assessmentMetrics?.promptHistory || []),
    ...(item.practiceMetrics?.promptHistory || []),
  ].sort((a, b) => (b.at || 0) - (a.at || 0));
  const latest = prompts[0];
  if (!latest) return "No therapist prompt used.";
  return latest.text || latest.label || `Prompt level ${latest.level || 1} recorded`;
}

export function getCognitiveReportRows(latest, first = latest) {
  const latestCompletion = getFunctionalCompletion(latest);
  const firstCompletion = getFunctionalCompletion(first);
  const latestInterval = getAssessmentMetric(latest, "avgActionInterval");
  const firstInterval = getAssessmentMetric(first, "avgActionInterval");
  const latestInitiation = getAssessmentMetric(latest, "timeToFirstActionMs");
  const firstInitiation = getAssessmentMetric(first, "timeToFirstActionMs");
  const promptLevel = getAssessmentMetric(latest, "highestPromptLevel") || 0;
  const stuckAlerts = getAssessmentMetric(latest, "stuckAlerts") || 0;
  const latestAnswerAccuracy = getTaskAnswerAccuracy(latest);
  const firstAnswerAccuracy = getTaskAnswerAccuracy(first);
  const domainSummary = summarizeCriteriaByDomain(latest);
  const rows = [
    {
      label: "Initiation",
      value: latestInitiation,
      display: latestInitiation,
      change: percentChange(firstInitiation, latestInitiation, true),
      evidence: "Time from task push/start to first independent action.",
      format: "duration",
    },
    {
      label: "Working memory / goal maintenance",
      value: latestCompletion?.pct ?? null,
      display: latestCompletion ? `${latestCompletion.done}/${latestCompletion.total} steps` : "-",
      change: percentChange(firstCompletion?.pct, latestCompletion?.pct),
      evidence: "How many required scenario steps were completed from objective app evidence.",
      format: "text",
    },
    {
      label: "Processing efficiency",
      value: latestInterval,
      display: latestInterval,
      change: percentChange(firstInterval, latestInterval, true),
      evidence: "Average delay between recorded actions.",
      format: "duration",
    },
    {
      label: "Cognitive flexibility",
      value: latest.metrics?.contextSwitches ?? null,
      display: latest.metrics?.contextSwitches ?? "-",
      change: percentChange(first.metrics?.contextSwitches, latest.metrics?.contextSwitches),
      evidence: "App/home/back transitions used while completing the scenario.",
      format: "text",
    },
    {
      label: "Cueing required",
      value: promptLevel,
      display: promptLevel === 0 ? "No prompt used" : latestPromptText(latest),
      change: percentChange(getAssessmentMetric(first, "highestPromptLevel") || 0, promptLevel, true),
      evidence: "Specific therapist prompt used during the task.",
      format: "text",
    },
    {
      label: "Sustained task engagement",
      value: stuckAlerts,
      display: stuckAlerts,
      change: percentChange(getAssessmentMetric(first, "stuckAlerts") || 0, stuckAlerts, true),
      evidence: "Number of >30s stuck alerts during assessment.",
      format: "text",
    },
  ];

  if (latestAnswerAccuracy) {
    rows.push({
      label: "Information retrieval accuracy",
      value: latestAnswerAccuracy.pct,
      display: `${latestAnswerAccuracy.correct}/${latestAnswerAccuracy.attempts} answers`,
      change: percentChange(firstAnswerAccuracy?.pct, latestAnswerAccuracy.pct),
      evidence: "Correct task-card answers for information that had to be read from the app.",
      format: "text",
    });
  }

  Object.entries(domainSummary).forEach(([label, summary]) => {
    rows.push({
      label,
      value: pct(summary.done, summary.total),
      display: `${summary.done}/${summary.total} steps`,
      change: "-",
      evidence: "Scenario checklist items mapped to this functional cognition domain.",
      format: "text",
    });
  });

  return rows;
}

export function getAppCompetency(items, appId) {
  const relevant = items.filter((item) => (item.apps || []).includes(appId));
  if (relevant.length === 0) return null;
  const scores = relevant.map((item) => getFunctionalCompletion(item)?.pct).filter((value) => typeof value === "number");
  if (scores.length === 0) return null;
  return Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length);
}

function latestNumericMetric(items, key) {
  const record = items.find((item) => typeof getAssessmentMetric(item, key) === "number");
  return record ? getAssessmentMetric(record, key) : null;
}

export function getDischargeRelevantIndicators(items = []) {
  const sorted = [...items].sort((a, b) => b.completedAt - a.completedAt);
  const latest = sorted[0];
  const first = sorted.at(-1);
  if (!latest) {
    return [];
  }
  const latestCompletion = getFunctionalCompletion(latest);
  const firstCompletion = first ? getFunctionalCompletion(first) : null;
  const latestAnswerAccuracy = getTaskAnswerAccuracy(latest);
  const latestPromptLevel = getAssessmentMetric(latest, "highestPromptLevel") || 0;
  const latestStuckAlerts = getAssessmentMetric(latest, "stuckAlerts") || 0;
  const latestInitiation = latestNumericMetric(sorted, "timeToFirstActionMs");
  const firstInitiation = typeof getAssessmentMetric(first, "timeToFirstActionMs") === "number"
    ? getAssessmentMetric(first, "timeToFirstActionMs")
    : latestInitiation;
  const appScores = [...new Set(sorted.flatMap((item) => item.apps || []))]
    .map((appId) => ({ appId, score: getAppCompetency(sorted, appId) }))
    .filter((item) => typeof item.score === "number");
  const appsAtOrAbove80 = appScores.filter((item) => item.score >= 80).length;

  return [
    {
      label: "Functional consistency",
      met: latestCompletion ? latestCompletion.pct >= 80 : false,
      value: latestCompletion ? `${latestCompletion.done}/${latestCompletion.total} steps (${latestCompletion.pct}%)` : "No scenario checklist data",
      evidence: `Latest objective completion; change from first: ${percentChange(firstCompletion?.pct, latestCompletion?.pct)}.`,
    },
    {
      label: "Cueing burden",
      met: latestPromptLevel <= 1,
      value: latestPromptLevel === 0 ? "No prompt used" : latestPromptText(latest),
      evidence: "Specific prompt support recorded during the task.",
    },
    {
      label: "Initiation",
      met: typeof latestInitiation === "number" && (latestInitiation <= 30000 || percentChange(firstInitiation, latestInitiation, true).includes("improved")),
      value: typeof latestInitiation === "number" ? `${Math.round(latestInitiation / 1000)}s` : "No initiation timing",
      evidence: `Time from task start/push to first action; change from first: ${percentChange(firstInitiation, latestInitiation, true)}.`,
    },
    {
      label: "Task engagement",
      met: latestStuckAlerts === 0,
      value: `${latestStuckAlerts} stuck alert${latestStuckAlerts === 1 ? "" : "s"}`,
      evidence: "Counts >30s periods without progress during assessment.",
    },
    {
      label: "Information retrieval",
      met: latestAnswerAccuracy ? latestAnswerAccuracy.pct >= 80 : null,
      value: latestAnswerAccuracy ? `${latestAnswerAccuracy.correct}/${latestAnswerAccuracy.attempts} correct (${latestAnswerAccuracy.pct}%)` : "No checked information-retrieval task",
      evidence: "Task-card answers for information the patient had to read from the app.",
    },
    {
      label: "App competency breadth",
      met: appScores.length > 0 ? appsAtOrAbove80 === appScores.length : null,
      value: appScores.length > 0 ? `${appsAtOrAbove80}/${appScores.length} app areas at >=80%` : "No app-specific records",
      evidence: "Average detected functional completion across practiced app areas.",
    },
  ];
}

export function getAssessmentMetric(item, key) {
  const assessment = item.assessmentMetrics || {};
  const practice = item.practiceMetrics || {};
  if (typeof assessment[key] === "number") return assessment[key];
  if (typeof practice[key] === "number") return practice[key];
  if (key === "highestPromptLevel") return assessment.highestPromptLevel || practice.highestPromptLevel || 0;
  if (key === "stuckAlerts") return assessment.stuckAlerts?.length || 0;
  if (key === "avgActionInterval") return average(assessment.actionIntervalsMs || []);
  if (key === "practiceSteps") return getCompletedFunctionalStepIds(item).length;
  return item.metrics?.[key] ?? null;
}

export function filterRecordItems(items, filters) {
  return items.filter((item) => {
    const modeMatch = filters.mode === "all" || item.mode === filters.mode;
    const appMatch = filters.app === "all" || (item.apps || []).includes(filters.app);
    const scenarioMatch = filters.scenario === "all" || item.scenarioId === filters.scenario;
    return modeMatch && appMatch && scenarioMatch;
  });
}
