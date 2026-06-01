export function dateInputValue(dateObj) {
  if (!dateObj) {
    return "";
  }
  const d = new Date(dateObj.year, dateObj.month, dateObj.date);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}${mm}${yyyy}`;
}

export function parseDateInput(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length !== 8) {
    return null;
  }
  const date = Number(digits.slice(0, 2));
  const month = Number(digits.slice(2, 4));
  const year = Number(digits.slice(4, 8));
  const parsed = new Date(year, month - 1, date);
  if (
    parsed.getFullYear() !== year
    || parsed.getMonth() !== month - 1
    || parsed.getDate() !== date
  ) {
    return null;
  }
  return { year, month: month - 1, date };
}

export function cleanDateInput(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 8);
}

export function datePartsFromValue(value, fallback) {
  const parsed = parseDateInput(value);
  return parsed || fallback || { date: 1, month: 0, year: new Date().getFullYear() };
}

export function updateDatePartValue(currentDate, part, value) {
  const next = {
    ...currentDate,
    [part]: Number(value),
  };
  const daysInMonth = new Date(next.year, next.month + 1, 0).getDate();
  next.date = Math.min(next.date, daysInMonth);
  return next;
}
