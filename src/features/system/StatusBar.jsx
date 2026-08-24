import { useVirtualOS } from "../../state/VirtualOSContext";

export function StatusBar({ onOpenNotifications }) {
  const { state, helpers } = useVirtualOS();
  const connectivity = state.connectivity;
  const connectionLabel = connectivity.airplaneMode ? "Airplane mode" : connectivity.connectedNetwork ? "Wi-Fi connected" : connectivity.mobileDataEnabled ? "5G mobile data" : "Offline";

  return (
    <header className="os-statusbar" role="button" tabIndex="0" aria-label={`${connectionLabel}. Open notifications`} onClick={onOpenNotifications} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onOpenNotifications?.(); }}>
      <span className="status-time">{helpers.minutesToClock(state.currentMinutes)}</span>
      <div className="status-icons">
        <span className={`status-network ${connectivity.airplaneMode || (!connectivity.connectedNetwork && !connectivity.mobileDataEnabled) ? "offline" : ""}`} data-learn-target="status-signal">
          <span className="status-bars-mini" aria-hidden="true"><i /><i /><i /><i /></span>
          <span className="status-signal">{connectivity.airplaneMode ? "✈" : connectivity.connectedNetwork ? "Wi‑Fi" : connectivity.mobileDataEnabled ? "5G" : "×"}</span>
        </span>
        <span className="status-battery" data-learn-target="status-battery">61</span>
      </div>
    </header>
  );
}

