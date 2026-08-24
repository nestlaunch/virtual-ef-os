import { useEffect, useState } from "react";
import { useVirtualOS } from "../../state/VirtualOSContext";

const NETWORKS = [
  { id: "rehab-guest", name: "Rehab-Guest", security: "Secured", signal: 4, trusted: true },
  { id: "rehab-lookalike", name: "Rehab_Guest_Free", security: "Open", signal: 4, trusted: false },
  { id: "rehab-staff", name: "Rehab-Staff", security: "Secured", signal: 3, trusted: false },
  { id: "coffee-corner", name: "CoffeeCorner", security: "Secured", signal: 2, trusted: false },
];

function Toggle({ active, label, onClick, disabled = false, learnTarget }) {
  return <button type="button" className={`connectivity-toggle ${active ? "active" : ""}`} aria-label={label} aria-pressed={active} disabled={disabled} onClick={onClick} data-learn-target={learnTarget}><span /></button>;
}

export function ConnectivityApp() {
  const { state, setConnectivityView, setConnectivitySetting, connectWifi, disconnectWifi } = useVirtualOS();
  const connectivity = state.connectivity;
  const view = connectivity.view || "overview";
  const [selected, setSelected] = useState(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setSelected(null);
    setPassword("");
    setError("");
  }, [view, state.session.startedAt]);

  function submitPassword(event) {
    event.preventDefault();
    if (selected?.id === "rehab-guest" && password === "Garden2048") {
      connectWifi(selected);
      setSelected(null);
      setPassword("");
      setError("");
      return;
    }
    setError("Could not connect. Check the network name and password, then try again.");
    setConnectivitySetting("wifiErrorCount", (connectivity.wifiErrorCount || 0) + 1);
  }

  function selectNetwork(network) {
    if (network.security === "Open") {
      connectWifi(network);
      return;
    }
    setSelected(network);
    setPassword("");
    setError("");
  }

  if (view === "wifi") {
    return (
      <div className="connectivity-app">
        <header><button type="button" onClick={() => setConnectivityView("overview")} aria-label="Back to Network and internet">‹</button><div><h2>Wi‑Fi</h2><p>Connect to a nearby simulated network</p></div><Toggle label="Wi-Fi" active={connectivity.wifiEnabled} onClick={() => setConnectivitySetting("wifiEnabled", !connectivity.wifiEnabled)} /></header>
        {connectivity.wifiEnabled ? <>
          {connectivity.connectedNetwork ? <section className={`connected-network ${connectivity.connectedNetwork.trusted ? "trusted" : "warning"}`}><span>Connected</span><strong>{connectivity.connectedNetwork.name}</strong><p>{connectivity.connectedNetwork.trusted ? "Trusted training network" : "Open or unfamiliar network — avoid sensitive tasks."}</p><button type="button" onClick={disconnectWifi}>Disconnect</button></section> : null}
          <section className="network-list"><h3>Available networks</h3>{NETWORKS.map((network) => <button type="button" key={network.id} onClick={() => selectNetwork(network)}><span className="wifi-glyph">◔</span><span><strong>{network.name}</strong><small>{network.security}</small></span><em>{"●".repeat(network.signal)}</em></button>)}</section>
        </> : <div className="connectivity-empty"><strong>Wi‑Fi is off</strong><p>Turn it on to see available fictional networks.</p></div>}
        {selected ? <div className="network-dialog-backdrop" onClick={() => setSelected(null)}><form className="network-dialog" onSubmit={submitPassword} onClick={(event) => event.stopPropagation()}><span>Connect to</span><h3>{selected.name}</h3><label>Password<input autoFocus type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter password" /></label>{error ? <p role="alert">{error}</p> : null}<div><button type="button" onClick={() => setSelected(null)}>Cancel</button><button type="submit">Connect</button></div></form></div> : null}
      </div>
    );
  }

  if (view === "mobile") {
    return <div className="connectivity-app"><header><button type="button" onClick={() => setConnectivityView("overview")} aria-label="Back to Network and internet">‹</button><div data-learn-target="connectivity-mobile-status"><h2>Mobile data</h2><p>{connectivity.mobileDataEnabled ? "On · Daily Digital Mobile" : "Off · Daily Digital Mobile"}</p></div><Toggle label="Mobile data" learnTarget="connectivity-mobile-toggle" active={connectivity.mobileDataEnabled} disabled={connectivity.airplaneMode} onClick={() => setConnectivitySetting("mobileDataEnabled", !connectivity.mobileDataEnabled)} /></header><section className="data-usage-card"><span>Used this month</span><strong>1.2 GB</strong><p>of a fictional 3 GB allowance</p><div><i style={{ width: "40%" }} /></div></section><section className="connectivity-list"><div><span><strong>Data Saver</strong><small>Reduce background data use</small></span><Toggle label="Data Saver" active={connectivity.dataSaverEnabled} onClick={() => setConnectivitySetting("dataSaverEnabled", !connectivity.dataSaverEnabled)} /></div><div><span><strong>Data roaming</strong><small>May involve extra charges when overseas</small></span><Toggle label="Data roaming" active={connectivity.roamingEnabled} onClick={() => setConnectivitySetting("roamingEnabled", !connectivity.roamingEnabled)} /></div></section><section className="data-app-list"><h3>App data usage</h3><p><span>Maps</span><strong>420 MB</strong></p><p><span>Video</span><strong>380 MB</strong></p><p><span>Messages</span><strong>42 MB</strong></p></section></div>;
  }

  const connectionLabel = connectivity.airplaneMode ? "Airplane mode" : connectivity.connectedNetwork ? connectivity.connectedNetwork.name : connectivity.mobileDataEnabled ? "Using mobile data" : "Offline";
  return <div className="connectivity-app"><header className="simple"><div><h2>Network & internet</h2><p data-learn-target="connectivity-status">{connectionLabel}</p></div></header><section className="connectivity-menu"><button type="button" onClick={() => setConnectivityView("wifi")}><span className="connectivity-menu-icon">◔</span><span><strong>Wi‑Fi</strong><small>{connectivity.wifiEnabled ? connectivity.connectedNetwork?.name || "On" : "Off"}</small></span><em>›</em></button><button type="button" data-learn-target="connectivity-mobile-row" onClick={() => setConnectivityView("mobile")}><span className="connectivity-menu-icon">↕</span><span><strong>Mobile data</strong><small>{connectivity.mobileDataEnabled ? "On · 1.2 GB used" : "Off"}</small></span><em>›</em></button><div><span className="connectivity-menu-icon">✈</span><span><strong>Airplane mode</strong><small>Turns off mobile connections</small></span><Toggle label="Airplane mode" active={connectivity.airplaneMode} onClick={() => setConnectivitySetting("airplaneMode", !connectivity.airplaneMode)} /></div></section><aside className="simulation-note">Training simulation only. These controls do not change this device’s real connection.</aside></div>;
}
