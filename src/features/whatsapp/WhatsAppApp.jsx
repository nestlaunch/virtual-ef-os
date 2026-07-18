import { useEffect, useMemo, useRef, useState } from "react";
import { whatsappThreads } from "../../state/seedData";
import { useVirtualOS } from "../../state/VirtualOSContext";
import { analyzeWhatsAppTurn } from "../../services/aiReplyClient";
import { findStimulusForState, getCustomStimuliForApp, getVisibleThreadIdsForState } from "../../state/stimulusSequence";
import { getCurrentAssignment } from "../../state/sessionLifecycle";
import { clearWhatsAppStorage, getWhatsAppStorageKey } from "./whatsappSession";

const MAX_USER_REPLIES_PER_THREAD = 5;

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

function groupCustomStimuli(stimuli) {
  const groups = new Map();
  stimuli.forEach((stimulus) => {
    const existing = groups.get(stimulus.threadId) || {
      id: stimulus.threadId,
      sender: stimulus.title,
      timeLabel: "Now",
      unreadMessages: 0,
      messages: [],
      custom: true,
    };
    existing.unreadMessages += 1;
    existing.messages.unshift({ id: `${stimulus.id}-msg`, mine: false, text: stimulus.message || stimulus.preview });
    groups.set(stimulus.threadId, existing);
  });
  return [...groups.values()];
}

function loadPersistedThreads(storageKey) {
  try {
    const raw = window.localStorage.getItem(storageKey);
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
  const { state, markStimulusRead, trackWhatsAppReply, trackWhatsAppConfirmation, trackWhatsAppFriendConfirmation } = useVirtualOS();
  const effectiveMode = state.session.currentUserId
    ? state.session.userModes[state.session.currentUserId] || state.session.mode
    : state.session.mode;
  const isWhatsAppLearn = effectiveMode === "learn" && state.session.learnModules?.[state.session.currentUserId] === "whatsapp";
  const storageKey = getWhatsAppStorageKey(state.session, effectiveMode);
  const [threads, setThreads] = useState(() => loadPersistedThreads(storageKey));
  const [activeId, setActiveId] = useState(null);
  const [draft, setDraft] = useState("");
  const [replyNotice, setReplyNotice] = useState(null);
  const currentAssignment = getCurrentAssignment(state.session, state.session.currentUserId, effectiveMode);

  const activeIdRef = useRef(activeId);
  const pendingTimersRef = useRef([]);

  const visibleIds = getVisibleThreadIdsForState("whatsapp", state);
  const customThreads = groupCustomStimuli(getCustomStimuliForApp(state, "whatsapp"));
  const customThreadIds = new Set(customThreads.map((thread) => thread.id));
  const baseVisibleThreads = threads.filter((thread) => visibleIds.includes(thread.id) && !customThreadIds.has(thread.id));
  const mergedCustomThreads = customThreads.map((thread) => {
    const localThread = threads.find((item) => item.id === thread.id);
    const localReplies = (localThread?.messages || []).filter((message) => message.mine);
    return {
      ...thread,
      messages: [...thread.messages, ...localReplies],
      unreadMessages: localThread?.unreadMessages ?? thread.unreadMessages,
    };
  });
  const visibleThreads = isWhatsAppLearn
    ? threads.filter((thread) => ["jia-wei", "nadiah", "family"].includes(thread.id))
    : [
      ...baseVisibleThreads,
      ...mergedCustomThreads,
    ];
  const active = useMemo(() => visibleThreads.find((t) => t.id === activeId), [visibleThreads, activeId]);
  const activeUserReplyCount = active?.messages.filter((message) => message.mine).length || 0;
  const conversationLimitReached = activeUserReplyCount >= MAX_USER_REPLIES_PER_THREAD;

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(threads));
    } catch {
      // Ignore storage write failures so chat flow still works.
    }
  }, [storageKey, threads]);

  useEffect(() => {
    if (customThreads.length === 0) {
      return;
    }
    setThreads((prev) => {
      let changed = false;
      const next = prev.map((thread) => {
        const custom = customThreads.find((item) => item.id === thread.id);
        if (!custom) {
          return thread;
        }
        const existingIds = new Set(thread.messages.map((message) => message.id));
        const newMessages = custom.messages.filter((message) => !existingIds.has(message.id));
        if (newMessages.length === 0) {
          return thread;
        }
        changed = true;
        return {
          ...thread,
          sender: custom.sender,
          timeLabel: custom.timeLabel,
          custom: true,
          unreadMessages: thread.unreadMessages + newMessages.length,
          messages: [...thread.messages, ...newMessages],
        };
      });
      const missing = customThreads.filter((thread) => !next.some((item) => item.id === thread.id));
      if (missing.length) {
        changed = true;
      }
      return changed ? [...missing, ...next] : prev;
    });
  }, [state.session.customStimuli]);

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
        clearWhatsAppStorage(window.localStorage, storageKey);
      } catch {
        // Ignore storage errors during reset.
      }
    }
    window.addEventListener("virtual-os-reset-evaluation", onReset);
    return () => window.removeEventListener("virtual-os-reset-evaluation", onReset);
  }, [storageKey]);

  useEffect(() => {
    pendingTimersRef.current.forEach((timer) => clearTimeout(timer));
    pendingTimersRef.current = [];
    setThreads(deepCloneThreads());
    setActiveId(null);
    setDraft("");
      setReplyNotice(null);
      try {
        clearWhatsAppStorage(window.localStorage, storageKey);
      } catch {
        // Ignore storage errors during session refresh.
      }
  }, [state.session.startedAt, storageKey]);

  useEffect(() => {
    pendingTimersRef.current.forEach((timer) => clearTimeout(timer));
    pendingTimersRef.current = [];
    setThreads(deepCloneThreads());
    setActiveId(null);
    setDraft("");
    setReplyNotice(null);
    try {
      clearWhatsAppStorage(window.localStorage, storageKey);
    } catch {
      // Ignore storage errors during assignment refresh.
    }
  }, [state.session.currentUserId, currentAssignment?.id, storageKey]);

  function showReplyNotification(sender, text) {
    setReplyNotice({ id: Date.now(), sender, text });
    const timer = setTimeout(() => setReplyNotice(null), 3000);
    pendingTimersRef.current.push(timer);
  }

  function openThread(threadId) {
    const stimulus = findStimulusForState("whatsapp", threadId, state);
    if (stimulus) {
      markStimulusRead(stimulus.id);
    }
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
    const activeThreadSnapshot = visibleThreads.find((t) => t.id === threadId);
    if (!activeThreadSnapshot) {
      return;
    }
    const userReplyCount = activeThreadSnapshot.messages.filter((message) => message.mine).length;
    if (userReplyCount >= MAX_USER_REPLIES_PER_THREAD) {
      showReplyNotification(activeThreadSnapshot.sender, "Conversation limit reached for this practice chat.");
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
    if (!isWhatsAppLearn || threadId === "family") {
      window.dispatchEvent(new CustomEvent("virtual-os-learn-whatsapp-replied", { detail: { threadId } }));
    }
    setDraft("");

    const scenarioHint = threadId === "jia-wei"
      ? "Scheduling scenario: initial proposed timing conflicts with clinic appointment. If user is unavailable, propose a concrete alternative afternoon time and close naturally when confirmed."
      : threadId === "nadiah"
        ? "Scheduling scenario: availability is typically weekday afternoons after 3 PM. Keep responses natural and flexible."
        : "General chat scenario: respond naturally.";

    let turn = null;
    try {
      turn = await analyzeWhatsAppTurn({
        sessionPin: state.session.pin,
        accountId: state.session.currentUserId,
        threadId,
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
    const aiReply = String(turn?.reply || "").trim();
    const shouldAvoidAiReply = !aiReply || normText(aiReply) === normText(lastIncoming);
    const resolvedReply = shouldAvoidAiReply
      ? buildFallbackReply(threadId, content, historyWithUser)
      : aiReply;

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
            <p
              key={msg.id}
              className={`wa-bubble ${msg.mine ? "mine" : ""}`}
              data-learn-target={isWhatsAppLearn && active.id === "family" && !msg.mine ? "wa-dinner-bubble" : undefined}
            >
              {msg.text}
            </p>
          ))}
        </div>
        <div className="wa-input-row">
          <input
            value={draft}
            disabled={conversationLimitReached}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                sendReply(draft);
              }
            }}
            placeholder={conversationLimitReached ? "Conversation limit reached" : "Type message"}
          />
          <button type="button" disabled={conversationLimitReached} onClick={() => sendReply(draft)}>Send</button>
        </div>
        {conversationLimitReached ? (
          <p className="wa-limit-note">Conversation limit reached for this chat.</p>
        ) : null}
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
        {visibleThreads.map((thread) => (
          <button
            key={thread.id}
            type="button"
            className="wa-row"
            data-thread-id={thread.id}
            data-learn-target={isWhatsAppLearn && thread.id === "family" ? "wa-dinner-row" : undefined}
            onClick={() => openThread(thread.id)}
          >
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
        {visibleThreads.length === 0 ? <p className="thread-bubble">Waiting for new chats.</p> : null}
      </div>
    </div>
  );
}
