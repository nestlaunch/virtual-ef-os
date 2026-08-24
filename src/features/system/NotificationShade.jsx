import { motion, useDragControls, useMotionValue, useTransform } from "framer-motion";
import { useMemo, useRef } from "react";
import { getAvailableStimuliForState } from "../../state/stimulusSequence";
import { useVirtualOS } from "../../state/VirtualOSContext";

export function NotificationShade({ open, onOpen, onClose }) {
  const { state, helpers, openApp, markStimulusRead, dismissStimulus, openConnectivity, setConnectivitySetting } = useVirtualOS();
  const controls = useDragControls();
  const shellHeight = 780;
  const y = useMotionValue(open ? 0 : -shellHeight);
  const scrim = useTransform(y, [-shellHeight, 0], [0, 0.62]);
  const shadeRef = useRef(null);
  const notifications = useMemo(() => {
    const dismissed = new Set(state.session.dismissedStimuli || []);
    return getAvailableStimuliForState(state).filter((item) => !dismissed.has(item.id)).reverse();
  }, [state, state.currentMinutes]);

  function finishDrag(_, info) {
    if (open) {
      if (info.offset.y < -16 || info.velocity.y < -100) onClose();
      else onOpen();
      return;
    }
    if (info.offset.y > 45 || info.velocity.y > 350) onOpen();
    else onClose();
  }

  function openNotification(item) {
    markStimulusRead(item.id);
    onClose();
    openApp(item.app === "sms" ? "sms" : "whatsapp");
  }

  const c = state.connectivity;
  const currentUserId = state.session.currentUserId;
  const effectiveMode = currentUserId ? state.session.userModes[currentUserId] || state.session.mode : state.session.mode;
  const isConnectivityLearn = effectiveMode === "learn" && state.session.learnModules?.[currentUserId] === "connectivity";
  return <>
    <div className="notification-drag-zone" onPointerDown={(event) => controls.start(event)} aria-hidden="true" />
    <motion.button type="button" aria-label="Close notification shade" className="notification-scrim" style={{ opacity: scrim }} animate={{ pointerEvents: open ? "auto" : "none" }} onClick={onClose} />
    <motion.aside ref={shadeRef} className="notification-shade" aria-label="Notifications and quick settings" aria-hidden={!open} style={{ y }} drag="y" dragControls={controls} dragListener={false} dragConstraints={{ top: -shellHeight, bottom: 0 }} dragElastic={0.08} onDragEnd={finishDrag} animate={{ y: open ? 0 : -shellHeight }} transition={{ type: "spring", stiffness: 380, damping: 36, mass: .9 }}>
      <button type="button" className="shade-drag-handle" aria-label="Drag notification shade" onPointerDown={(event) => controls.start(event)}><span /></button>
      <header><strong>{helpers.minutesToClock(state.currentMinutes)}</strong><span>{helpers.todayLabel}</span><button type="button" onClick={() => { onClose(); openApp("settings"); }} aria-label="Open Settings">⚙</button></header>
      <div className="quick-settings-grid">
        <button type="button" className={c.wifiEnabled ? "active" : ""} onClick={() => setConnectivitySetting("wifiEnabled", !c.wifiEnabled)} onDoubleClick={() => { onClose(); openConnectivity("wifi"); }}><b>◔</b><span><strong>Wi‑Fi</strong><small>{c.connectedNetwork?.name || (c.wifiEnabled ? "On" : "Off")}</small></span><i onClick={(e) => { e.stopPropagation(); onClose(); openConnectivity("wifi"); }}>›</i></button>
        <button type="button" data-learn-target="shade-mobile-data" className={c.mobileDataEnabled ? "active" : ""} onClick={() => setConnectivitySetting("mobileDataEnabled", !c.mobileDataEnabled)}><b>↕</b><span><strong>Mobile data</strong><small>{c.mobileDataEnabled ? "On" : "Off"}</small></span><i onClick={(e) => { if (isConnectivityLearn) return; e.stopPropagation(); onClose(); openConnectivity("mobile"); }}>›</i></button>
        <button type="button" className={c.airplaneMode ? "active" : ""} onClick={() => setConnectivitySetting("airplaneMode", !c.airplaneMode)}><b>✈</b><span><strong>Airplane mode</strong><small>{c.airplaneMode ? "On" : "Off"}</small></span></button>
        <button type="button" className={c.dataSaverEnabled ? "active" : ""} onClick={() => setConnectivitySetting("dataSaverEnabled", !c.dataSaverEnabled)}><b>▣</b><span><strong>Data Saver</strong><small>{c.dataSaverEnabled ? "On" : "Off"}</small></span></button>
      </div>
      <section className="shade-notifications"><div className="shade-section-title"><strong>Notifications</strong>{notifications.length ? <button type="button" onClick={() => notifications.forEach((item) => dismissStimulus(item.id))}>Clear all</button> : null}</div>{notifications.length ? notifications.map((item) => <article key={item.id} className="shade-notification"><button type="button" onClick={() => openNotification(item)}><span className={`notification-app-icon ${item.app}`}>{item.app === "sms" ? "✉" : "☎"}</span><span><small>{item.app === "sms" ? "Messages" : "WhatsApp"} · now</small><strong>{item.title}</strong><p>{item.preview}</p></span></button><button type="button" aria-label={`Dismiss ${item.title} notification`} onClick={() => dismissStimulus(item.id)}>×</button></article>) : <div className="no-notifications"><span>✓</span><strong>No notifications</strong><p>You’re all caught up.</p></div>}</section>
      <motion.button
        type="button"
        data-learn-target="shade-close"
        className="shade-close-handle"
        aria-label="Close notification shade"
        onPointerDown={(event) => controls.start(event)}
        onTap={onClose}
        whileTap={{ backgroundColor: "rgba(148, 163, 184, .16)" }}
      ><span /></motion.button>
    </motion.aside>
  </>;
}
