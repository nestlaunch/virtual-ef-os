import { useEffect, useMemo, useState } from "react";
import { formalThreads } from "../../state/seedData";

function Avatar({ color }) {
  return (
    <span className="msg-avatar" style={{ backgroundColor: color }}>
      <span className="avatar-cut" />
    </span>
  );
}

export function SMSApp() {
  const [activeId, setActiveId] = useState(null);
  const active = useMemo(() => formalThreads.find((t) => t.id === activeId), [activeId]);

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

  if (active) {
    return (
      <div className="sms-app">
        <header className="sms-thread-head">
          <button type="button" onClick={() => setActiveId(null)}>{"<"}</button>
          <h2>{active.sender}</h2>
        </header>
        <div className="thread-list">
          {active.messages.map((msg) => (
            <div key={msg.id} className="thread-bubble">
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
        {formalThreads.map((thread) => (
          <button key={thread.id} type="button" className="sms-row" onClick={() => setActiveId(thread.id)}>
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
      </div>
    </div>
  );
}

