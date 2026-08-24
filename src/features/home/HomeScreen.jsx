import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import { useVirtualOS } from "../../state/VirtualOSContext";

const APPS_PER_PAGE = 9;

const HOME_APPS = [
  { id: "calendar", label: "Calendar", icon: "📅", className: "calendar", target: "home-app-calendar" },
  { id: "sms", label: "Messages", icon: "✉", className: "messages", target: "home-app-messages" },
  { id: "whatsapp", label: "WhatsApp", icon: "☎", className: "whatsapp", target: "home-app-whatsapp" },
  { id: "maps", label: "Maps", icon: "M", className: "maps", target: "home-app-maps" },
  { id: "bank", label: "Bank", icon: "$", className: "bank", target: "home-app-bank" },
  { id: "singpass", label: "Singpass", icon: "sp", className: "singpass", target: "home-app-singpass" },
  { id: "settings", label: "Settings", icon: "⚙", className: "settings", target: "home-app-settings" },
  { id: "mail", label: "Mail", icon: "M", className: "mail", target: "home-app-mail" },
  { id: "calculator", label: "Calculator", icon: "=", className: "calculator", target: "home-app-calculator" },
];

export function HomeScreen() {
  const { openApp, helpers, state } = useVirtualOS();
  const [page, setPage] = useState(0);
  const [direction, setDirection] = useState(1);
  const pages = useMemo(() => Array.from({ length: Math.ceil(HOME_APPS.length / APPS_PER_PAGE) }, (_, index) => HOME_APPS.slice(index * APPS_PER_PAGE, (index + 1) * APPS_PER_PAGE)), []);

  function goToPage(next) {
    const bounded = Math.max(0, Math.min(pages.length - 1, next));
    if (bounded === page) return;
    setDirection(bounded > page ? 1 : -1);
    setPage(bounded);
  }

  function launch(app) {
    openApp(app.id);
  }

  return <div className="home-screen no-widget" tabIndex="0" onKeyDown={(event) => { if (event.key === "ArrowRight") goToPage(page + 1); if (event.key === "ArrowLeft") goToPage(page - 1); }} onWheel={(event) => { const movement = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.shiftKey ? event.deltaY : 0; if (movement > 18) goToPage(page + 1); if (movement < -18) goToPage(page - 1); }}>
    <div className="home-datetime"><div className="home-time">{helpers.minutesToClock(state.currentMinutes)}</div><div className="home-date">{helpers.todayLabel}</div></div>
    <div className="home-pages-viewport" data-learn-target="home-apps">
      <AnimatePresence initial={false} custom={direction} mode="popLayout">
        <motion.div key={page} className="home-app-grid paged" custom={direction} initial={{ x: direction * 130, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: direction * -130, opacity: 0 }} transition={{ type: "spring", stiffness: 360, damping: 34 }} drag={pages.length > 1 ? "x" : false} dragConstraints={{ left: 0, right: 0 }} dragElastic={0.12} onDragEnd={(_, info) => { if (info.offset.x < -45 || info.velocity.x < -450) goToPage(page + 1); if (info.offset.x > 45 || info.velocity.x > 450) goToPage(page - 1); }}>
          {pages[page].map((app) => <button type="button" key={app.id} className="home-app" data-learn-target={app.target} onClick={() => launch(app)}><span className={`app-icon ${app.className}`} aria-hidden="true">{app.icon}</span><span>{app.label}</span></button>)}
        </motion.div>
      </AnimatePresence>
    </div>
    {pages.length > 1 ? <nav className="home-page-controls" aria-label="Home screen pages"><button type="button" aria-label="Previous home screen" disabled={page === 0} onClick={() => goToPage(page - 1)}>‹</button><div>{pages.map((_, index) => <button type="button" key={index} className={index === page ? "active" : ""} aria-label={`Home screen ${index + 1}`} aria-current={index === page ? "page" : undefined} onClick={() => goToPage(index)} />)}</div><button type="button" aria-label="Next home screen" disabled={page === pages.length - 1} onClick={() => goToPage(page + 1)}>›</button></nav> : <div className="home-page-controls single"><div><button type="button" className="active" aria-label="Home screen 1" aria-current="page" /></div></div>}
  </div>;
}
