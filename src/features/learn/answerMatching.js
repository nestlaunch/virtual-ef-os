const MONTH_ALIASES = new Map([
  ["january", "jan"],
  ["february", "feb"],
  ["march", "mar"],
  ["april", "apr"],
  ["may", "may"],
  ["june", "jun"],
  ["july", "jul"],
  ["august", "aug"],
  ["september", "sep"],
  ["sept", "sep"],
  ["october", "oct"],
  ["november", "nov"],
  ["december", "dec"],
]);

const MONTH_NUMBERS = new Map([
  ["jan", "1"],
  ["feb", "2"],
  ["mar", "3"],
  ["apr", "4"],
  ["may", "5"],
  ["jun", "6"],
  ["jul", "7"],
  ["aug", "8"],
  ["sep", "9"],
  ["oct", "10"],
  ["nov", "11"],
  ["dec", "12"],
]);

function normalizeNumericToken(token) {
  if (!/^\d+$/.test(token)) {
    return token;
  }
  return String(Number(token));
}

export function normalizeAnswer(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/s\$/g, "$")
    .replace(/(\d):00\s*(am|pm)\b/g, "$1 $2")
    .replace(/(\d)(am|pm)\b/g, "$1 $2")
    .replace(/[^a-z0-9.$]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => MONTH_ALIASES.get(token) || normalizeNumericToken(token))
    .join(" ")
    .trim();
}

function numericValue(value) {
  const match = String(value || "").replace(/,/g, "").match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function coreTokens(value) {
  return normalizeAnswer(value)
    .split(" ")
    .filter((token) => token && !["at", "on", "the", "is", "shown", "min", "mins", "minute", "minutes"].includes(token));
}

function dateKey(day, month, year) {
  return `${Number(year)}-${Number(month)}-${Number(day)}`;
}

function validDateParts(day, month, year) {
  const d = Number(day);
  const m = Number(month);
  const y = Number(year);
  if (!d || !m || !y || m < 1 || m > 12 || y < 1900 || y > 2100) {
    return false;
  }
  const parsed = new Date(y, m - 1, d);
  return parsed.getFullYear() === y && parsed.getMonth() === m - 1 && parsed.getDate() === d;
}

function extractDateInfo(value) {
  const raw = String(value || "").toLowerCase();
  const signatures = new Set();
  const tokens = new Set();

  for (const match of raw.matchAll(/\b(\d{1,2})\D+(\d{1,2})\D+((?:19|20)\d{2})\b/g)) {
    const [, day, month, year] = match;
    if (validDateParts(day, month, year)) {
      signatures.add(dateKey(day, month, year));
      tokens.add(String(Number(day)));
      tokens.add(String(Number(month)));
      tokens.add(String(Number(year)));
    }
  }

  for (const match of raw.matchAll(/\b(\d{2})(\d{2})((?:19|20)\d{2})\b/g)) {
    const [, day, month, year] = match;
    if (validDateParts(day, month, year)) {
      signatures.add(dateKey(day, month, year));
      tokens.add(String(Number(day)));
      tokens.add(String(Number(month)));
      tokens.add(String(Number(year)));
    }
  }

  const normalizedTokens = coreTokens(value);
  normalizedTokens.forEach((token, index) => {
    if (!MONTH_NUMBERS.has(token)) {
      return;
    }
    const month = MONTH_NUMBERS.get(token);
    const nearby = normalizedTokens.slice(Math.max(0, index - 2), index + 3);
    const year = nearby.find((item) => /^(?:19|20)\d{2}$/.test(item));
    const day = nearby.find((item) => /^\d{1,2}$/.test(item) && item !== month && item !== year && Number(item) >= 1 && Number(item) <= 31);
    if (day && year && validDateParts(day, month, year)) {
      signatures.add(dateKey(day, month, year));
      tokens.add(String(Number(day)));
      tokens.add(token);
      tokens.add(month);
      tokens.add(String(Number(year)));
    }
  });

  return { signatures, tokens };
}

function timeTokenVariants(tokens) {
  const variants = new Map();
  tokens.forEach((token, index) => {
    if (/^\d{3,4}$/.test(token)) {
      const padded = token.padStart(4, "0");
      const h24 = Number(padded.slice(0, 2));
      const m = Number(padded.slice(2));
      if (h24 < 24 && m < 60) {
        const suffix = h24 >= 12 ? "pm" : "am";
        const h12 = h24 % 12 || 12;
        variants.set(token, [token, String(h24), String(m), String(h12), suffix, `${h12}${suffix}`, `${h24}${String(m).padStart(2, "0")}`]);
      }
    }
    if ((token === "am" || token === "pm") && index > 0 && /^\d+$/.test(tokens[index - 1])) {
      const h12 = Number(tokens[index - 1]);
      if (h12 >= 1 && h12 <= 12) {
        const h24 = token === "pm" && h12 < 12 ? h12 + 12 : token === "am" && h12 === 12 ? 0 : h12;
        variants.set(`${tokens[index - 1]} ${token}`, [String(h24), "0", String(h12), token, `${h12}${token}`, `${String(h24).padStart(2, "0")}00`]);
      }
    }
  });
  return variants;
}

function expandedTokenSet(tokens) {
  const expanded = new Set(tokens);
  tokens.forEach((token) => {
    if (MONTH_NUMBERS.has(token)) {
      expanded.add(MONTH_NUMBERS.get(token));
    }
  });
  const timeVariants = timeTokenVariants(tokens);
  timeVariants.forEach((variants) => variants.forEach((variant) => expanded.add(variant)));
  for (let index = 1; index < tokens.length; index += 1) {
    const phrase = `${tokens[index - 1]} ${tokens[index]}`;
    if (timeVariants.has(phrase)) {
      timeVariants.get(phrase).forEach((variant) => expanded.add(variant));
    }
  }
  return expanded;
}

export function answerMatches(input, accepted) {
  const normalizedInput = normalizeAnswer(input);
  const normalizedAccepted = normalizeAnswer(accepted);
  if (!normalizedInput || !normalizedAccepted) {
    return false;
  }
  if (normalizedInput === normalizedAccepted) {
    return true;
  }
  const inputCoreTokens = coreTokens(input);
  const acceptedCoreTokens = coreTokens(accepted);
  const inputDateInfo = extractDateInfo(input);
  const acceptedDateInfo = extractDateInfo(accepted);
  const hasAcceptedDate = acceptedDateInfo.signatures.size > 0;
  const hasCompatibleDate = hasAcceptedDate
    && [...acceptedDateInfo.signatures].some((signature) => inputDateInfo.signatures.has(signature));
  if (hasAcceptedDate && !hasCompatibleDate) {
    return false;
  }
  const inputNumber = numericValue(input);
  const acceptedNumber = numericValue(accepted);
  if (
    inputCoreTokens.length <= 2
    && acceptedCoreTokens.length <= 2
    && inputNumber !== null
    && acceptedNumber !== null
    && Math.abs(inputNumber - acceptedNumber) < 0.001
  ) {
    return true;
  }
  const inputTokens = expandedTokenSet(inputCoreTokens);
  const tokensToMatch = hasCompatibleDate
    ? acceptedCoreTokens.filter((token) => !acceptedDateInfo.tokens.has(token))
    : acceptedCoreTokens;
  return tokensToMatch.length > 0 && tokensToMatch.every((token) => inputTokens.has(token));
}

export function isCorrectLearnAnswer(input, answers) {
  return (answers || [])
    .filter((answer) => answer.correct)
    .flatMap((answer) => [answer.label, ...(answer.accepted || [])])
    .some((accepted) => answerMatches(input, accepted));
}
