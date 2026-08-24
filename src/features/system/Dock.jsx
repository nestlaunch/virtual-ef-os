import { useVirtualOS } from "../../state/VirtualOSContext";

export function Dock({ onExit }) {
  const { goBack, goHome, state, toggleTabs, setTabsOpen } = useVirtualOS();

  function handleBack() {
    const ev = new CustomEvent("virtual-os-back", { cancelable: true });
    window.dispatchEvent(ev);
    if (!ev.defaultPrevented) {
      const hasEarlierApp = (state.appHistory || []).some((app) => app && app !== "home");
      const isAtPhoneHome = ["home", "instructions"].includes(state.currentApp) && !hasEarlierApp;
      if (onExit && isAtPhoneHome) {
        setTabsOpen(false);
        onExit();
        return;
      }
      goBack();
    }
  }

  return (
    <footer className="system-nav-wrap">
      <div className="system-nav">
        <button type="button" className="sys-btn" data-learn-target="nav-back" onClick={handleBack} aria-label="Back">
          <span className="icon-back" />
        </button>
        <button
          type="button"
          className="sys-btn"
          data-learn-target="nav-home"
          onClick={() => {
            setTabsOpen(false);
            goHome();
          }}
          aria-label="Home"
        >
          <span className="icon-home" />
        </button>
        <button
          type="button"
          className={`sys-btn ${state.tabSwitcherOpen ? "active" : ""}`}
          data-learn-target="nav-tabs"
          onClick={toggleTabs}
          aria-label="Tabs"
        >
          <span className="icon-tabs" />
        </button>
      </div>
      <div className="gesture-pill" />
    </footer>
  );
}

