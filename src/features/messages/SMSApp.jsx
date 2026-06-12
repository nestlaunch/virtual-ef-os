import { useEffect, useMemo, useState } from "react";
import { formalThreads } from "../../state/seedData";
import { findStimulusForState, getCustomStimuliForApp, getVisibleThreadIdsForState } from "../../state/stimulusSequence";
import { useVirtualOS } from "../../state/VirtualOSContext";
import { getCurrentAssignment } from "../../state/sessionLifecycle";

function groupCustomStimuli(stimuli) {
  const groups = new Map();
  stimuli.forEach((stimulus) => {
    const key = stimulus.threadId;
    const existing = groups.get(key) || {
      id: stimulus.threadId,
      sender: stimulus.title,
      preview: stimulus.preview || stimulus.message,
      timeLabel: "Now",
      unread: 0,
      avatarColor: "#0f62b6",
      messages: [],
    };
    existing.preview = stimulus.preview || stimulus.message;
    existing.unread += 1;
    existing.messages.unshift({ id: `${stimulus.id}-msg`, text: stimulus.message || stimulus.preview, time: "Today" });
    groups.set(key, existing);
  });
  return [...groups.values()];
}

function Avatar({ color }) {
  return (
    <span className="msg-avatar" style={{ backgroundColor: color }}>
      <span className="avatar-cut" />
    </span>
  );
}

export function SMSApp() {
  const { state, markStimulusRead } = useVirtualOS();
  const [activeId, setActiveId] = useState(null);
  const currentAssignment = getCurrentAssignment(state.session, state.session.currentUserId);
  const visibleIds = getVisibleThreadIdsForState("sms", state);
  const customThreads = groupCustomStimuli(getCustomStimuliForApp(state, "sms"));
  const visibleThreads = [
    ...formalThreads.filter((thread) => visibleIds.includes(thread.id)),
    ...customThreads,
  ];
  const active = useMemo(() => visibleThreads.find((t) => t.id === activeId), [activeId, visibleThreads]);

  useEffect(() => {
    setActiveId(null);
  }, [state.session.currentUserId, currentAssignment?.id]);

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

  function openThread(threadId) {
    const stimulus = findStimulusForState("sms", threadId, state);
    if (stimulus) {
      markStimulusRead(stimulus.id);
    }
    setActiveId(threadId);
  }

  if (active) {
    return (
      <div className="sms-app">
        <header className="sms-thread-head">
          <button type="button" onClick={() => setActiveId(null)}>{"<"}</button>
          <h2>{active.sender}</h2>
        </header>
        <div className="thread-list">
          {active.messages.map((msg) => (
            <div
              key={msg.id}
              className="thread-bubble"
              data-learn-target={active.id === "doctor" && msg.appointment ? "sms-doctor-message" : undefined}
            >
              <p>{msg.text}</p>
              <span>{msg.time}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="sms-app">
      <header className="sms-head">
        <h2>Google Messages</h2>
        <div className="sms-head-actions">
          <span className="search">O</span>
          <span className="profile">K</span>
        </div>
      </header>
      <div className="sms-list">
        {visibleThreads.map((thread) => (
          <button
            key={thread.id}
            type="button"
            className="sms-row"
            data-learn-target={thread.id === "doctor" ? "sms-doctor-row" : undefined}
            onClick={() => openThread(thread.id)}
          >
            <Avatar color={thread.avatarColor} />
            <span className="sms-main">
              <strong>{thread.sender}</strong>
              <span>{thread.preview}</span>
            </span>
            <span className="sms-meta">
              <em>{thread.timeLabel}</em>
              {thread.unread > 0 ? <b>{thread.unread}</b> : null}
            </span>
          </button>
        ))}
        {visibleThreads.length === 0 ? <p className="thread-bubble">Waiting for new messages.</p> : null}
      </div>
    </div>
  );
}

