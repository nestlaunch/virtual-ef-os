export const MONTH_LABELS = Array.from({ length: 12 }, (_, index) => ({
  value: index,
  short: new Date(new Date().getFullYear(), index, 1).toLocaleDateString("en-US", { month: "short" }),
  long: new Date(new Date().getFullYear(), index, 1).toLocaleDateString("en-US", { month: "long" }),
}));

export function parseDateWheelPartInput(partId, raw, options = {}) {
  const clean = String(raw || "").trim();
  if (!clean) {
    return null;
  }

  if (partId === "date") {
    const value = Number(clean.replace(/\D/g, ""));
    const daysInMonth = options.daysInMonth || 31;
    return Number.isInteger(value) && value >= 1 && value <= daysInMonth ? value : null;
  }

  if (partId === "year") {
    const value = Number(clean.replace(/\D/g, ""));
    const minYear = options.minYear || 1900;
    const maxYear = options.maxYear || 2100;
    return Number.isInteger(value) && value >= minYear && value <= maxYear ? value : null;
  }

  if (partId === "month") {
    const numeric = Number(clean.replace(/\D/g, ""));
    if (Number.isInteger(numeric) && numeric >= 1 && numeric <= 12) {
      return numeric - 1;
    }

    const normalized = clean.toLowerCase();
    const exact = MONTH_LABELS.find((month) => (
      month.short.toLowerCase() === normalized || month.long.toLowerCase() === normalized
    ));
    if (exact) {
      return exact.value;
    }

    const partial = MONTH_LABELS.find((month) => (
      month.short.toLowerCase().startsWith(normalized) || month.long.toLowerCase().startsWith(normalized)
    ));
    return partial ? partial.value : null;
  }

  return null;
}

export function getDateWheelPartDisplay(node) {
  if (!node) {
    return "";
  }
  if ("value" in node) {
    return String(node.value || "").trim();
  }
  return String(node.textContent || "").trim();
}

export function getDateWheelFieldDisplays(field) {
  return Array.from(field?.querySelectorAll?.(".date-wheel-value") || []).map(getDateWheelPartDisplay);
}
