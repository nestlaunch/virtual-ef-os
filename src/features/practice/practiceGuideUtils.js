export function practicePage(id, app, label, steps) {
  return { id, app, label, steps };
}

export function stateSafeAppId(value) {
  return String(value || "practice").toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

export function buildPracticeGuide(activeScenario, appGuide, pageOverrides = {}) {
  if (!activeScenario) {
    return null;
  }
  const overridePages = pageOverrides[activeScenario.id];
  if (overridePages) {
    return {
      title: activeScenario.title,
      purpose: activeScenario.description,
      successCriteria: activeScenario.successCriteria,
      pages: overridePages,
    };
  }
  if (!appGuide) {
    return null;
  }
  return {
    ...appGuide,
    title: activeScenario.title,
    purpose: activeScenario.description,
    successCriteria: activeScenario.successCriteria,
    pages: [practicePage(`${stateSafeAppId(appGuide.title)}-page`, null, "Current page", appGuide.steps)],
  };
}

export function flattenGuideSteps(guide) {
  return (guide?.pages || []).flatMap((page) => page.steps || []);
}

export function getActivePracticePage(guide, completed, currentApp) {
  const pages = guide?.pages || [];
  if (pages.length === 0) {
    return { page: null, pageIndex: 0 };
  }
  const nextPageIndex = pages.findIndex((page) => (page.steps || []).some((step) => !completed[step.id]));
  const fallbackIndex = nextPageIndex === -1 ? pages.length - 1 : nextPageIndex;
  const currentPageIndex = pages.findIndex((page) => page.app === currentApp && (page.steps || []).some((step) => !completed[step.id]));
  const pageIndex = currentPageIndex >= 0 ? currentPageIndex : fallbackIndex;
  return { page: pages[pageIndex], pageIndex };
}
