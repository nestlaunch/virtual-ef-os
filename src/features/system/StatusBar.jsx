import { useVirtualOS } from "../../state/VirtualOSContext";

export function StatusBar() {
  const { state, helpers } = useVirtualOS();

  return (
    <header className="os-statusbar">
      <span className="status-time">{helpers.minutesToClock(state.currentMinutes)}</span>
      <div className="status-icons">
        <span className="status-dot" />
        <span className="status-signal" data-learn-target="status-signal">5G</span>
        <span className="status-battery" data-learn-target="status-battery">61</span>
      </div>
    </header>
  );
}

