const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const GEMINI_MODEL = import.meta.env.VITE_GEMINI_MODEL || "gemini-2.0-flash";

function extractText(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) {
    return "";
  }
  return parts
    .map((part) => part?.text || "")
    .join(" ")
    .trim();
}

function parseJsonFromText(text) {
  const raw = text.trim();
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

async function callGemini(prompt) {
  const apiKey = (GEMINI_API_KEY || "").trim();
  if (!apiKey || apiKey.includes("YOUR_GEMINI_API_KEY_HERE")) {
    return null;
  }

  const candidateModels = Array.from(new Set([GEMINI_MODEL, "gemini-2.0-flash", "gemini-2.0-flash-lite"]));

  for (const model of candidateModels) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 140,
        },
      }),
    });

    if (!response.ok) {
      if (response.status === 400 || response.status === 404) {
        continue;
      }
      return null;
    }

    const payload = await response.json();
    return extractText(payload) || null;
  }

  return null;
}

export async function analyzeWhatsAppTurn({ threadName, userMessage, history = [], scenarioHint = "" }) {
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

  const text = await callGemini(prompt);
  if (!text) {
    return null;
  }

  const parsed = parseJsonFromText(text);
  if (!parsed || typeof parsed.reply !== "string") {
    return null;
  }

  return {
    reply: parsed.reply.trim(),
    isConfirmation: Boolean(parsed.is_confirmation),
  };
}
