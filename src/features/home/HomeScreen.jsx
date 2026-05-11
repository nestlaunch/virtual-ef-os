import { useVirtualOS } from "../../state/VirtualOSContext";

export function HomeScreen() {
  const { openApp, helpers, state } = useVirtualOS();

  return (
    <div className="home-screen no-widget">
      <div className="home-datetime">
        <div className="home-time">{helpers.minutesToClock(state.currentMinutes)}</div>
        <div className="home-date">{helpers.todayLabel}</div>
      </div>

      <div className="home-app-row-single">
        <button type="button" className="home-app" onClick={() => openApp("calendar")}>
          <span className="app-icon calendar" aria-hidden="true">📅</span>
          <span>Calendar</span>
        </button>
        <button type="button" className="home-app" onClick={() => openApp("sms")}>
          <span className="app-icon messages" aria-hidden="true">✉</span>
          <span>Messages</span>
        </button>
        <button type="button" className="home-app" onClick={() => openApp("whatsapp")}>
          <span className="app-icon whatsapp" aria-hidden="true">☎</span>
          <span>WhatsApp</span>
        </button>
        <button type="button" className="home-app" onClick={() => openApp("maps")}>
          <span className="app-icon maps" aria-hidden="true">M</span>
          <span>Maps</span>
        </button>
        <button type="button" className="home-app" onClick={() => openApp("bank")}>
          <span className="app-icon bank" aria-hidden="true">$</span>
          <span>Bank</span>
        </button>
        <button type="button" className="home-app" onClick={() => openApp("settings")}>
          <span className="app-icon settings" aria-hidden="true">⚙</span>
          <span>Settings</span>
        </button>
      </div>
    </div>
  );
}

