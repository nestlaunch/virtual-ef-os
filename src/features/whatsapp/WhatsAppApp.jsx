import { useEffect, useMemo, useRef, useState } from "react";
import { whatsappThreads } from "../../state/seedData";
import { useVirtualOS } from "../../state/VirtualOSContext";
import { analyzeWhatsAppTurn } from "../../services/geminiClient";

const WA_STORAGE_KEY = "virtual-os-whatsapp-state-v1";

function createMessageId(prefix) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function deepCloneThreads() {
  return whatsappThreads.map((thread) => ({
    ...thread,
    messages: [...thread.messages],
    unreadMessages: thread.unreadMessages,
    jiaFollowUpSent: false,
  }));
}

function loadPersistedThreads() {
  try {
    const raw = window.localStorage.getItem(WA_STORAGE_KEY);
    if (!raw) {
      return deepCloneThreads();
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return deepCloneThreads();
    }
    return parsed;
  } catch {
    return deepCloneThreads();
  }
}

function randomLagMs() {
  return 1200 + Math.floor(Math.random() * 2200);
}

function normText(value) {
  return String(value || "").trim().toLowerCase();
}

function pickNonRepeating(candidates, lastIncoming) {
  const last = normText(lastIncoming);
  const unique = candidates.filter((item, index) => candidates.indexOf(item) === index);
  const firstDifferent = unique.find((candidate) => normText(candidate) !== last);
  return firstDifferent || unique[0] || "Okay.";
}

function buildFallbackReply(threadId, userMessage, history) {
  const lastIncoming = [...history].reverse().find((m) => !m.mine)?.text;
  const text = normText(userMessage);

  if (threadId === "jia-wei") {
    if (/other day|another day|any other day|other days/i.test(userMessage)) {
      return pickNonRepeating(
        [
          "Yes, Thursday 4:00 PM can. Does that work for you?",
          "I can do Friday 3:30 PM instead, if that's better.",
          "How about next Monday 4:30 PM?",
        ],
        lastIncoming
      );
    }
    if (/other time|another time|what time|when/i.test(userMessage)) {
      return pickNonRepeating(
        [
          "I can shift to 4:00 PM if that helps.",
          "Would 3:30 PM work for you?",
          "I can do 5:00 PM as well.",
        ],
        lastIncoming
      );
    }
    if (/confirm|confirmed|okay|ok|see you/i.test(text)) {
      return pickNonRepeating(["See you then.", "Great, see you then."], lastIncoming);
    }
    return pickNonRepeating(
      [
        "No worries, I can adjust. What afternoon timing works for you?",
        "Sure, let's pick another afternoon slot.",
        "Okay, can suggest another time and I'll match it.",
      ],
      lastIncoming
    );
  }

  if (threadId === "nadiah") {
    if (/10 ?am|morning/i.test(text)) {
      return pickNonRepeating(
        [
          "Morning is tough for me. I am free after 3 PM though.",
          "I can't do 10 AM, but any time after 3 PM works.",
        ],
        lastIncoming
      );
    }
    if (/confirm|confirmed|okay|ok|see you/i.test(text)) {
      return pickNonRepeating(["Perfect, see you then.", "Great, see you then."], lastIncoming);
    }
    return pickNonRepeating(
      [
        "I am good with afternoons after 3 PM.",
        "Afternoon works for me, maybe around 4 PM?",
        "Yes, after 3 PM is still good on my side.",
      ],
      lastIncoming
    );
  }

  return pickNonRepeating(["Okay, noted.", "Got it, thanks.", "Sounds good."], lastIncoming);
}

export function WhatsAppApp() {
  const { trackWhatsAppReply, trackWhatsAppConfirmation, trackWhatsAppFriendConfirmation } = useVirtualOS();
  const [threads, setThreads] = useState(() => loadPersistedThreads());
  const [activeId, setActiveId] = useState(null);
  const [draft, setDraft] = useState("");
  const [replyNotice, setReplyNotice] = useState(null);

  const activeIdRef = useRef(activeId);
  const pendingTimersRef = useRef([]);

  const active = useMemo(() => threads.find((t) => t.id === activeId), [threads, activeId]);

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  useEffect(() => {
    try {
      window.localStorage.setItem(WA_STORAGE_KEY, JSON.stringify(threads));
    } catch {
      // Ignore storage write failures so chat flow still works.
    }
  }, [threads]);

  useEffect(() => {
    return () => {
      pendingTimersRef.current.forEach((timer) => clearTimeout(timer));
      pendingTimersRef.current = [];
    };
  }, []);

  useEffect(() => {
    function onBack(ev) {
      if (activeId) {
        ev.preventDefault();
        setActiveId(null);
      }
    }
    window.addEventListener("virtual-os-back", onBack);
    return () => window.removeEventListener("virtual-os-back", onBack);
  }, [activeId]);

  useEffect(() => {
    function onReset() {
      pendingTimersRef.current.forEach((timer) => clearTimeout(timer));
      pendingTimersRef.current = [];
      setThreads(deepCloneThreads());
      setActiveId(null);
      setDraft("");
      setReplyNotice(null);
      try {
        window.localStorage.removeItem(WA_STORAGE_KEY);
      } catch {
        // Ignore storage errors during reset.
      }
    }
    window.addEventListener("virtual-os-reset-evaluation", onReset);
    return () => window.removeEventListener("virtual-os-reset-evaluation", onReset);
  }, []);

  function showReplyNotification(sender, text) {
    setReplyNotice({ id: Date.now(), sender, text });
    const timer = setTimeout(() => setReplyNotice(null), 3000);
    pendingTimersRef.current.push(timer);
  }

  function openThread(threadId) {
    setThreads((prev) => prev.map((t) => (t.id === threadId ? { ...t, unreadMessages: 0 } : t)));
    setActiveId(threadId);
  }

  function appendIncomingMessage(threadId, sender, text) {
    if (/see you then|great, see you then|perfect, see you then|sounds good, see you|see you\b/i.test(text)) {
      trackWhatsAppFriendConfirmation(threadId);
    }
    setThreads((prev) => {
      return prev.map((thread) => {
        if (thread.id !== threadId) {
          return thread;
        }
        const isViewingThread = activeIdRef.current === threadId;
        return {
          ...thread,
          messages: [...thread.messages, { id: createMessageId("in"), mine: false, text }],
          unreadMessages: isViewingThread ? 0 : thread.unreadMessages + 1,
        };
      });
    });
    showReplyNotification(sender, text);
  }

  async function sendReply(text) {
    const content = text.trim();
    if (!activeId || !content) {
      return;
    }

    const threadId = activeId;
    const activeThreadSnapshot = threads.find((t) => t.id === threadId);
    if (!activeThreadSnapshot) {
      return;
    }

    const historyWithUser = [...activeThreadSnapshot.messages, { id: createMessageId("mine"), mine: true, text: content }];

    setThreads((prev) => {
      return prev.map((thread) => {
        if (thread.id !== threadId) {
          return thread;
        }
        return { ...thread, messages: [...thread.messages, { id: createMessageId("mine"), mine: true, text: content }] };
      });
    });

    trackWhatsAppReply(threadId);
    setDraft("");

    const scenarioHint = threadId === "jia-wei"
      ? "Scheduling scenario: initial proposed timing conflicts with clinic appointment. If user is unavailable, propose a concrete alternative afternoon time and close naturally when confirmed."
      : threadId === "nadiah"
        ? "Scheduling scenario: availability is typically weekday afternoons after 3 PM. Keep responses natural and flexible."
        : "General chat scenario: respond naturally.";

    let turn = null;
    try {
      turn = await analyzeWhatsAppTurn({
        threadName: activeThreadSnapshot.sender,
        userMessage: content,
        history: historyWithUser,
        scenarioHint,
      });
    } catch {
      turn = null;
    }

    const isUserConfirmation = /confirm|confirmed|okay|ok|see you|works for me|that works|deal/i.test(content);
    if (turn?.isConfirmation || isUserConfirmation) {
      trackWhatsAppConfirmation(threadId);
    }

    if (isUserConfirmation) {
      const timer = setTimeout(() => {
        appendIncomingMessage(threadId, activeThreadSnapshot.sender, "Ok see you.");
      }, randomLagMs());
      pendingTimersRef.current.push(timer);
      return;
    }

    const lastIncoming = [...historyWithUser].reverse().find((m) => !m.mine)?.text;
    const geminiReply = String(turn?.reply || "").trim();
    const shouldAvoidGeminiReply = !geminiReply || normText(geminiReply) === normText(lastIncoming);
    const resolvedReply = shouldAvoidGeminiReply
      ? buildFallbackReply(threadId, content, historyWithUser)
      : geminiReply;

    const timer = setTimeout(() => {
      appendIncomingMessage(threadId, activeThreadSnapshot.sender, resolvedReply);
    }, randomLagMs());
    pendingTimersRef.current.push(timer);
  }

  if (active) {
    return (
      <div className="wa-app">
        {replyNotice ? (
          <div className="wa-reply-notice">
            <strong>{replyNotice.sender}</strong>
            <span>{replyNotice.text}</span>
          </div>
        ) : null}
        <header className="wa-thread-head">
          <button type="button" onClick={() => setActiveId(null)}>{"<"}</button>
          <h2>{active.sender}</h2>
          <span className="wa-dot" />
        </header>
        <div className="wa-thread-body">
          {active.messages.map((msg) => (
            <p key={msg.id} className={`wa-bubble ${msg.mine ? "mine" : ""}`}>
              {msg.text}
            </p>
          ))}
        </div>
        <div className="wa-input-row">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                sendReply(draft);
              }
            }}
            placeholder="Type message"
          />
          <button type="button" onClick={() => sendReply(draft)}>Send</button>
        </div>
      </div>
    );
  }

  return (
    <div className="wa-app">
      {replyNotice ? (
        <div className="wa-reply-notice">
          <strong>{replyNotice.sender}</strong>
          <span>{replyNotice.text}</span>
        </div>
      ) : null}
      <header className="wa-head">
        <h2>WhatsApp</h2>
        <nav>
          <span className="active">Chats</span>
          <span>Updates</span>
          <span>Calls</span>
        </nav>
      </header>
      <div className="wa-list">
        {threads.map((thread) => (
          <button key={thread.id} type="button" className="wa-row" onClick={() => openThread(thread.id)}>
            <span className="wa-avatar">{thread.sender.slice(0, 1)}</span>
            <span className="wa-main">
              <strong>{thread.sender}</strong>
              <span>{thread.messages[thread.messages.length - 1]?.text ?? ""}</span>
            </span>
            <span className="wa-meta">
              <em>{thread.timeLabel}</em>
              {thread.unreadMessages > 0 ? <b>{thread.unreadMessages}</b> : null}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
