import { getConfiguredCloudApiBaseUrl } from "./cloudEndpoint.js";

const API_BASE_URL = getConfiguredCloudApiBaseUrl();

function parseJsonFromText(text) {
  const raw = String(text || "").trim();
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) {
      return null;
    }
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

async function callServerAiReply(payload) {
  const pin = String(payload.sessionPin || "").trim().toUpperCase();
  if (!pin || typeof fetch !== "function") {
    return null;
  }

  const response = await fetch(`${API_BASE_URL}/api/sessions/${encodeURIComponent(pin)}/ai/reply`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    return null;
  }

  const json = await response.json();
  if (typeof json?.reply === "string") {
    return {
      reply: json.reply,
      isConfirmation: Boolean(json.isConfirmation ?? json.is_confirmation),
    };
  }
  if (typeof json?.text === "string") {
    const parsed = parseJsonFromText(json.text);
    return parsed ? { reply: parsed.reply, isConfirmation: Boolean(parsed.is_confirmation) } : null;
  }
  return null;
}

export async function analyzeWhatsAppTurn({
  sessionPin,
  accountId,
  threadId,
  threadName,
  userMessage,
  history = [],
  scenarioHint = "",
}) {
  const historyText = history
    .slice(-10)
    .map((item) => `${item.mine ? "User" : threadName}: ${item.text}`)
    .join("\n");

  const prompt = [
    "You are a WhatsApp conversation engine.",
    `Character: ${threadName}`,
    "Write a natural human WhatsApp reply to the user.",
    "Also classify whether the user message confirms availability/meeting.",
    "If user says unavailable and this chat is about scheduling, propose a specific alternative afternoon timing naturally.",
    scenarioHint,
    "Return STRICT JSON only with this schema:",
    '{"reply":"string","is_confirmation":true|false}',
    "Conversation context:",
    historyText,
    `Latest user message: ${userMessage}`,
  ].join("\n");

  const turn = await callServerAiReply({
    sessionPin,
    accountId,
    threadId,
    threadName,
    userMessage,
    history: history.slice(-10),
    scenarioHint,
    prompt,
  });
  if (!turn || typeof turn.reply !== "string") {
    return null;
  }

  return {
    reply: turn.reply.trim(),
    isConfirmation: Boolean(turn.isConfirmation),
  };
}
