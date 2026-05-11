import { AnimatePresence, motion } from "framer-motion";
import { VirtualOSProvider, useVirtualOS } from "../state/VirtualOSContext";
import { StatusBar } from "../features/system/StatusBar";
import { HomeScreen } from "../features/home/HomeScreen";
import { CalendarApp } from "../features/calendar/CalendarApp";
import { SMSApp } from "../features/messages/SMSApp";
import { WhatsAppApp } from "../features/whatsapp/WhatsAppApp";
import { SettingsApp } from "../features/settings/SettingsApp";
import { MapsApp } from "../features/maps/MapsApp";
import { BankApp } from "../features/bank/BankApp";
import { Dock } from "../features/system/Dock";
import { InstructionPage } from "../features/instructions/InstructionPage";
import { TourOverlay } from "../features/system/TourOverlay";

function AppSwitcher() {
  const { state, openApp, setTabsOpen } = useVirtualOS();
  const apps = [
    { id: "instructions", label: "Instructions" },
    { id: "home", label: "Home" },
    { id: "calendar", label: "Calendar" },
    { id: "sms", label: "Messages" },
    { id: "whatsapp", label: "WhatsApp" },
    { id: "maps", label: "Maps" },
    { id: "bank", label: "Bank" },
    { id: "settings", label: "Settings" },
  ];

  if (!state.tabSwitcherOpen) {
    return null;
  }

  return (
    <div className="app-switcher-backdrop" onClick={() => setTabsOpen(false)}>
      <div className="app-switcher" onClick={(e) => e.stopPropagation()}>
        {apps.map((app) => (
          <button
            key={app.id}
            type="button"
            className={`switcher-card ${state.currentApp === app.id ? "active" : ""}`}
            onClick={() => {
              if (app.id === "home") {
                openApp("home");
              } else {
                openApp(app.id);
              }
              setTabsOpen(false);
            }}
          >
            {app.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ActiveApp() {
  const { state } = useVirtualOS();

  const appMap = {
    instructions: <InstructionPage />,
    home: <HomeScreen />,
    calendar: <CalendarApp />,
    sms: <SMSApp />,
    whatsapp: <WhatsAppApp />,
    maps: <MapsApp />,
    bank: <BankApp />,
    settings: <SettingsApp />,
  };

  return (
    <>
      <StatusBar />
      <div className="phone-content">
        <AnimatePresence mode="wait">
          <motion.div
            key={state.currentApp}
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -14, scale: 0.985 }}
            transition={{ duration: 0.22 }}
            className="app-page"
          >
            {appMap[state.currentApp]}
          </motion.div>
        </AnimatePresence>
      </div>
      {state.currentApp !== "instructions" ? <Dock /> : null}
      <TourOverlay />
      <AppSwitcher />
    </>
  );
}

export default function App() {
  return (
    <VirtualOSProvider>
      <main className="scene">
        <section className="phone-shell">
          <ActiveApp />
        </section>
      </main>
    </VirtualOSProvider>
  );
}








