import { useEffect, useMemo, useState } from "react";
import { useVirtualOS } from "../../state/VirtualOSContext";

const DUMMY_NRIC = "S1234567A";
const PROFILE_NAME = "AMIR BIN HASSAN";

const SERVICES = [
  { id: "cpf", label: "CPF e-Services", abbr: "CPF", color: "#ffffff", bg: "#0b6938" },
  { id: "ica", label: "MyICA", abbr: "ICA", color: "#ffffff", bg: "#d12b2b" },
  { id: "healthhub", label: "HealthHub", abbr: "HH", color: "#ffffff", bg: "#1677c7" },
  { id: "onemotoring", label: "OneMotoring", abbr: "1M", color: "#ffffff", bg: "#f28c28" },
  { id: "hdb", label: "HDB Flat Portal", abbr: "HDB", color: "#ffffff", bg: "#7f4ac8" },
  { id: "lifesg", label: "LifeSG", abbr: "LSG", color: "#ffffff", bg: "#00a0a8" },
  { id: "iras", label: "myTax Portal", abbr: "IRAS", color: "#ffffff", bg: "#245aa6" },
  { id: "skills", label: "SkillsFuture", abbr: "SF", color: "#ffffff", bg: "#e05c52" },
];

const PROFILE_CATEGORIES = [
  { id: "personal", label: "Personal", icon: "P" },
  { id: "finance", label: "Finance", icon: "$" },
  { id: "family", label: "Family", icon: "F" },
  { id: "education", label: "Education", icon: "E" },
  { id: "property", label: "Property", icon: "H" },
  { id: "healthcare", label: "Healthcare", icon: "+" },
  { id: "employment", label: "Employment", icon: "W" },
  { id: "vehicle", label: "Vehicle &\nDriving Licence", icon: "V" },
];

const INBOX_MESSAGES = [
  {
    id: "myinfo",
    agency: "Singpass",
    title: "MyInfo Profile Retrieval",
    preview: "A bank service has retrieved your MyInfo profile for account opening.",
    date: "Today",
    unread: true,
  },
  {
    id: "face",
    agency: "Singpass",
    title: "Face Verification",
    preview: "Face Verification was performed today. Review if this was not you.",
    date: "Today",
    unread: true,
  },
  {
    id: "health",
    agency: "HealthHub",
    title: "Health Appointment",
    preview: "Your appointment reminder is available in HealthHub.",
    date: "10 Jan",
    unread: false,
  },
  {
    id: "cpf",
    agency: "CPF Board",
    title: "CPF Statement",
    preview: "Your CPF annual statement is now available.",
    date: "15 Jan",
    unread: false,
  },
];

function maskAmount(amount) {
  const value = Number(amount || 0);
  return `S$${value.toFixed(2)}`;
}

export function SingpassApp() {
  const { state, approveSingpassTransaction, rejectSingpassTransaction, openApp } = useVirtualOS();
  const transaction = state.singpass?.transaction;
  const currentUserId = state.session.currentUserId;
  const effectiveMode = currentUserId ? state.session.userModes[currentUserId] || state.session.mode : state.session.mode;
  const assignedLearnApp = currentUserId ? state.session.learnModules?.[currentUserId] : null;
  const learnAssignmentId = currentUserId
    ? state.session.assignments?.[currentUserId]?.filter((item) => item.mode === "learn").at(-1)?.id
    : null;
  const [tab, setTab] = useState("home");
  const [screen, setScreen] = useState(transaction?.status === "pending" ? "approval" : "dashboard");
  const [activeCard, setActiveCard] = useState("nric");
  const [showCards, setShowCards] = useState(true);
  const [barcodeOpen, setBarcodeOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [serviceOpen, setServiceOpen] = useState(null);
  const [expandedMessage, setExpandedMessage] = useState(null);
  const [nric, setNric] = useState("");

  useEffect(() => {
    if (transaction?.status === "pending") {
      setScreen("approval");
      setTab("home");
    }
  }, [transaction?.status]);

  useEffect(() => {
    if (effectiveMode === "learn" && assignedLearnApp === "singpass" && transaction?.status !== "pending") {
      setScreen("dashboard");
      setTab("home");
      setActiveCard("nric");
      setShowCards(true);
      setBarcodeOpen(false);
      setSettingsOpen(false);
      setServiceOpen(null);
      setExpandedMessage(null);
      setNric("");
    }
  }, [effectiveMode, assignedLearnApp, learnAssignmentId, transaction?.status]);

  const currentService = useMemo(
    () => SERVICES.find((service) => service.id === serviceOpen),
    [serviceOpen],
  );

  function fillDummyNric(event) {
    setNric(DUMMY_NRIC);
    const target = event?.currentTarget || event?.target || null;
    if (target) {
      target.value = DUMMY_NRIC;
    }
    window.setTimeout(() => {
      if (target) {
        window.dispatchEvent(new CustomEvent("virtual-os-learn-step-action", {
          detail: { eventType: "change", target },
        }));
      }
    }, 0);
  }

  function goDashboard(nextTab = "home") {
    setScreen("dashboard");
    setTab(nextTab);
  }

  function approve() {
    approveSingpassTransaction();
    window.dispatchEvent(new CustomEvent("virtual-os-learn-singpass-approved", {
      detail: { payee: transaction?.payee, amount: transaction?.amount },
    }));
    if (transaction?.source !== "bank-login") window.dispatchEvent(new CustomEvent("virtual-os-learn-bank-payment", { detail: { payee: transaction?.payee, amount: transaction?.amount } }));
    setScreen("result");
  }

  function reject() {
    rejectSingpassTransaction();
    window.dispatchEvent(new CustomEvent("virtual-os-learn-singpass-rejected", {
      detail: { payee: transaction?.payee, amount: transaction?.amount },
    }));
    setScreen("result");
  }

  if (screen === "approval" && transaction) {
    const isBankLogin = transaction.source === "bank-login";
    return (
      <div className="singpass-app singpass-dark">
        <SingpassTopBar title="Authorise" onBack={() => goDashboard("home")} onSettings={() => setSettingsOpen(true)} />
        <main className="singpass-scroll">
          <section className="singpass-approval-hero singpass-approval-card" data-learn-target="singpass-approval-card">
            <div className="singpass-auth-mark">!</div>
            <p>{isBankLogin ? "Login request" : "Payment request"}</p>
            <h2>{isBankLogin ? "Log in to Sunrise Bank" : "Review transaction"}</h2>
            <span>{isBankLogin ? "Continue only if you opened the Sunrise Practice Bank app." : "Approve only if these details match the payment you started."}</span>
          </section>

          <section className="singpass-dark-card">
            {isBankLogin ? <><DetailRow label="Service" value={transaction.service} /><DetailRow label="Request" value="Bank account login" /></> : <>
            <DetailRow label="Recipient" value={transaction.payee} />
            <DetailRow label="Amount" value={maskAmount(transaction.amount)} />
            <DetailRow label="Purpose" value={transaction.purpose} />
            <DetailRow label="Reference" value={transaction.reference} />
            </>}
          </section>

          <div className="singpass-action-row">
            <button type="button" className="singpass-secondary-btn" data-learn-target="singpass-reject" onClick={reject}>
              Reject
            </button>
            <button type="button" className="singpass-primary-btn" data-learn-target="singpass-approve" onClick={approve}>
              Approve
            </button>
          </div>
        </main>
        <SingpassBottomNav tab={tab} setTab={setTab} goDashboard={goDashboard} />
        {settingsOpen ? <SettingsSheet onClose={() => setSettingsOpen(false)} /> : null}
      </div>
    );
  }

  if (screen === "login") {
    return (
      <div className="singpass-app singpass-dark">
        <SingpassTopBar title="Log in" onBack={() => goDashboard("home")} onSettings={() => setSettingsOpen(true)} />
        <main className="singpass-scroll singpass-login-screen">
          <div className="singpass-brand-lock">
            <span>sp</span>
          </div>
          <h1>Log in with Singpass</h1>
          <p>Use your Singpass ID and password to continue.</p>
          <section className="singpass-login-panel">
            <label>
              <span>Singpass ID</span>
              <input
                data-learn-target="singpass-nric-input"
                value={nric}
                onFocus={fillDummyNric}
                onChange={fillDummyNric}
                onKeyDown={fillDummyNric}
                placeholder="Singpass ID"
              />
            </label>
            <label>
              <span>Password</span>
              <input value="********" readOnly type="password" />
            </label>
            <button type="button" className="singpass-primary-btn" data-learn-target="singpass-login-submit" onClick={() => goDashboard("home")}>
              Log in
            </button>
            <button type="button" className="singpass-link-btn">
              Forgot password?
            </button>
          </section>
        </main>
        {settingsOpen ? <SettingsSheet onClose={() => setSettingsOpen(false)} /> : null}
      </div>
    );
  }

  if (screen === "result") {
    const approved = state.singpass?.transaction?.status === "approved";
    const isBankLogin = state.singpass?.transaction?.source === "bank-login";
    return (
      <div className="singpass-app singpass-dark">
        <SingpassTopBar title="Result" onBack={() => goDashboard("home")} onSettings={() => setSettingsOpen(true)} />
        <main className="singpass-scroll">
          <section className={`singpass-result-card ${approved ? "approved" : "rejected"}`}>
            <div className="singpass-auth-mark">{approved ? "OK" : "X"}</div>
            <p>{approved ? "Approved" : "Rejected"}</p>
            <h2>{approved ? isBankLogin ? "Bank login approved" : "Transaction authorised" : isBankLogin ? "Bank login rejected" : "Transaction stopped"}</h2>
            <span>{approved ? isBankLogin ? "Return to Sunrise Bank to continue." : "Return to Bank to view the payment result." : isBankLogin ? "Sunrise Bank was not signed in." : "No simulated payment was made."}</span>
            <button type="button" className="singpass-primary-btn" onClick={() => openApp("bank")}>
              Return to Bank
            </button>
          </section>
        </main>
        <SingpassBottomNav tab={tab} setTab={setTab} goDashboard={goDashboard} />
        {settingsOpen ? <SettingsSheet onClose={() => setSettingsOpen(false)} /> : null}
      </div>
    );
  }

  return (
    <div className="singpass-app singpass-dark">
      {tab === "home" ? (
        <HomeTab
          activeCard={activeCard}
          setActiveCard={setActiveCard}
          showCards={showCards}
          setShowCards={setShowCards}
          transaction={transaction}
          onApproval={() => setScreen("approval")}
          onLogin={() => setScreen("login")}
          onBarcode={() => setBarcodeOpen(true)}
          onSettings={() => setSettingsOpen(true)}
          onService={setServiceOpen}
        />
      ) : null}
      {tab === "scan" ? <ScanTab onSettings={() => setSettingsOpen(true)} /> : null}
      {tab === "inbox" ? (
        <InboxTab expandedMessage={expandedMessage} setExpandedMessage={setExpandedMessage} onSettings={() => setSettingsOpen(true)} />
      ) : null}
      <SingpassBottomNav tab={tab} setTab={setTab} goDashboard={goDashboard} />
      {barcodeOpen ? <BarcodeModal onClose={() => setBarcodeOpen(false)} /> : null}
      {settingsOpen ? <SettingsSheet onClose={() => setSettingsOpen(false)} /> : null}
      {currentService ? <ServiceSheet service={currentService} onClose={() => setServiceOpen(null)} /> : null}
    </div>
  );
}

function HomeTab({
  activeCard,
  setActiveCard,
  showCards,
  setShowCards,
  transaction,
  onApproval,
  onLogin,
  onBarcode,
  onSettings,
  onService,
}) {
  return (
    <main className="singpass-scroll singpass-home">
      <SingpassStatusBar />
      <header className="singpass-brand-row">
        <span />
        <strong>Singpass</strong>
        <button type="button" className="singpass-round-btn" onClick={onSettings} aria-label="Settings">
          <span>...</span>
        </button>
      </header>
      <section className="singpass-welcome">
        <div>
          <p>Welcome back,</p>
          <h1>{PROFILE_NAME}</h1>
        </div>
      </section>

      {transaction?.status === "pending" ? (
        <button type="button" className="singpass-pending-banner" data-learn-target="singpass-pending-request" onClick={onApproval}>
          <span>Pending approval</span>
          <strong>{transaction.source === "bank-login" ? transaction.service : transaction.payee}</strong>
          <em>{transaction.source === "bank-login" ? "Login" : maskAmount(transaction.amount)}</em>
        </button>
      ) : null}

      <section className="singpass-section-block">
        <div className="singpass-section-title">
          <strong>My Cards</strong>
          <div className="singpass-title-actions">
            <button type="button" aria-label="More card options">...</button>
            <button type="button" aria-label={showCards ? "Hide cards" : "Show cards"} onClick={() => setShowCards((value) => !value)}>
              {showCards ? "Hide" : "Show"}
            </button>
          </div>
        </div>
        <section className="singpass-card-tabs" data-learn-target="singpass-dashboard">
          <button type="button" className={activeCard === "nric" ? "active" : ""} onClick={() => setActiveCard("nric")}>NRIC</button>
          <button type="button" className={activeCard === "licence" ? "active" : ""} onClick={() => setActiveCard("licence")}>Driving Licence</button>
          <button type="button" className={activeCard === "chas" ? "active" : ""} onClick={() => setActiveCard("chas")}>CHAS card</button>
          <button type="button">What is this?</button>
        </section>

        {showCards ? (
          <section data-learn-target="singpass-digital-id">
            {activeCard === "nric" ? <NricCard /> : null}
            {activeCard === "licence" ? <LicenceCard /> : null}
            {activeCard === "chas" ? <ChasCard /> : null}
          </section>
        ) : (
          <section className="singpass-hidden-card">
            <strong>Cards hidden</strong>
            <span>Tap Show to display your cards again.</span>
          </section>
        )}
      </section>

      <button type="button" className="singpass-barcode-btn" onClick={onBarcode}>
        <span className="barcode-lines" aria-hidden="true" />
        <strong>Show barcode</strong>
      </button>

      <section className="singpass-section-block">
        <div className="singpass-section-title">
          <strong>My Profile</strong>
          <button type="button">View all</button>
        </div>
        <div className="singpass-profile-strip">
          {PROFILE_CATEGORIES.map((item) => (
            <button type="button" key={item.id}>
              <span>{item.icon}</span>
              <strong>{item.label}</strong>
            </button>
          ))}
        </div>
      </section>

      <section className="singpass-favourites singpass-section-block">
        <div className="singpass-section-title">
          <strong>Last used shortcuts</strong>
        </div>
        <div className="singpass-service-grid">
          {SERVICES.map((service) => (
            <button type="button" key={service.id} onClick={() => onService(service.id)}>
              <span style={{ background: service.bg, color: service.color }}>{service.abbr}</span>
              <strong>{service.label}</strong>
            </button>
          ))}
        </div>
        <button type="button" className="singpass-view-all-shortcuts">View all shortcuts</button>
      </section>

      <button type="button" className="singpass-login-shortcut" data-learn-target="singpass-login-shortcut" onClick={onLogin}>
        <span>Sign in to a service</span>
        <strong>Use Singpass login</strong>
      </button>
    </main>
  );
}

function ScanTab({ onSettings }) {
  const [scanState, setScanState] = useState("idle");
  function simulateScan(next) {
    setScanState("scanning");
    window.setTimeout(() => setScanState(next), 900);
  }

  return (
    <main className={`singpass-scan ${scanState}`}>
      <SingpassStatusBar />
      <section className="singpass-scan-head">
        <strong>{PROFILE_NAME}</strong>
        <button type="button" className="singpass-round-btn" onClick={onSettings}>...</button>
      </section>
      <section className="singpass-scan-frame" data-learn-target="singpass-scan-tile">
        <span className="corner tl" />
        <span className="corner tr" />
        <span className="corner bl" />
        <span className="corner br" />
        {scanState === "scanning" ? <span className="scan-line" /> : null}
        {scanState === "success" ? <strong>Verified</strong> : null}
        {scanState === "invalid" ? <strong>Try again</strong> : null}
      </section>
      <section className="singpass-scan-card">
        <h2>Scan QR code</h2>
        <p>Place the QR code inside the frame.</p>
        <div>
          <button type="button" className="singpass-primary-btn" onClick={() => simulateScan("success")}>Simulate scan</button>
          <button type="button" className="singpass-secondary-btn" onClick={() => simulateScan("invalid")}>Invalid QR</button>
        </div>
      </section>
    </main>
  );
}

function InboxTab({ expandedMessage, setExpandedMessage, onSettings }) {
  return (
    <main className="singpass-scroll singpass-inbox">
      <SingpassStatusBar />
      <section className="singpass-page-head">
        <h1>Inbox</h1>
        <button type="button" className="singpass-round-btn" onClick={onSettings}>...</button>
      </section>
      <label className="singpass-search">
        <span>Search</span>
        <input placeholder="Search" />
      </label>
      <section className="singpass-inbox-tabs">
        <button type="button" className="active">All</button>
        <button type="button">Pinned</button>
        <button type="button">For Action</button>
      </section>
      <section className="singpass-message-list">
        {INBOX_MESSAGES.map((message) => {
          const open = expandedMessage === message.id;
          return (
            <button
              type="button"
              key={message.id}
              className={`singpass-message-row ${message.unread ? "unread" : ""}`}
              data-learn-target={message.id === "myinfo" ? "singpass-inbox-message" : undefined}
              onClick={() => setExpandedMessage(open ? null : message.id)}
            >
              <span className="agency-dot">{message.agency.slice(0, 2)}</span>
              <div>
                <strong>{message.title}</strong>
                <p>{open ? message.preview : `${message.preview.slice(0, 58)}...`}</p>
                <em>{message.agency}</em>
              </div>
              <time>{message.date}</time>
            </button>
          );
        })}
      </section>
    </main>
  );
}

function NricCard() {
  return (
    <article className="singpass-identity-card nric">
      <div className="sg-header">
        <span className="sg-crest" aria-hidden="true">SG</span>
        <div>
          <strong>Republic of Singapore</strong>
          <span>National Digital Identity Card</span>
        </div>
      </div>
      <div className="id-body">
        <div className="photo-placeholder">
          <span>AH</span>
        </div>
        <div>
          <h2>{PROFILE_NAME}</h2>
          <dl>
            <div><dt>NRIC</dt><dd>S******7A</dd></div>
            <div><dt>Date of birth</dt><dd>12 Jun 1989</dd></div>
            <div><dt>Sex</dt><dd>Male</dd></div>
            <div><dt>Race</dt><dd>Malay</dd></div>
          </dl>
        </div>
      </div>
      <footer>Digital IC for practice only</footer>
    </article>
  );
}

function LicenceCard() {
  return (
    <article className="singpass-identity-card licence">
      <div className="sg-header">
        <div>
          <strong>Driving licence</strong>
          <span>Simulation only</span>
        </div>
        <span className="licence-badge">VALID</span>
      </div>
      <div className="id-body single">
        <div>
          <h2>{PROFILE_NAME}</h2>
          <dl>
            <div><dt>NRIC</dt><dd>S******7A</dd></div>
            <div><dt>Class</dt><dd>3 / 3A</dd></div>
            <div><dt>Valid from</dt><dd>12 Jun 2020</dd></div>
            <div><dt>Valid until</dt><dd>11 Jun 2030</dd></div>
          </dl>
        </div>
      </div>
      <footer>Simulation - not valid for official use</footer>
    </article>
  );
}

function ChasCard() {
  return (
    <article className="singpass-identity-card chas">
      <div className="sg-header">
        <div>
          <strong>Community Health Assist Scheme</strong>
          <span>Simulation only</span>
        </div>
        <span className="licence-badge">BLUE</span>
      </div>
      <div className="id-body single">
        <div>
          <h2>{PROFILE_NAME}</h2>
          <dl>
            <div><dt>Card tier</dt><dd>CHAS Blue</dd></div>
            <div><dt>Valid until</dt><dd>31 Dec 2026</dd></div>
            <div><dt>Card no.</dt><dd>CB******2</dd></div>
          </dl>
        </div>
      </div>
      <footer>Use at CHAS-approved clinics</footer>
    </article>
  );
}

function BarcodeModal({ onClose }) {
  return (
    <div className="singpass-modal-backdrop">
      <section className="singpass-barcode-modal">
        <button type="button" onClick={onClose}>Close</button>
        <h2>{PROFILE_NAME}</h2>
        <p>NRIC S******7A</p>
        <div className="barcode-large" aria-hidden="true" />
        <span>Last updated on 12 May 2026</span>
      </section>
    </div>
  );
}

function SettingsSheet({ onClose }) {
  return (
    <div className="singpass-sheet-backdrop" onClick={onClose}>
      <section className="singpass-sheet" onClick={(event) => event.stopPropagation()}>
        <div className="sheet-handle" />
        <h2>Settings</h2>
        <button type="button">Manage cards</button>
        <button type="button">Notification settings</button>
        <button type="button">Help and support</button>
        <button type="button" className="danger">Log out</button>
      </section>
    </div>
  );
}

function ServiceSheet({ service, onClose }) {
  return (
    <div className="singpass-sheet-backdrop" onClick={onClose}>
      <section className="singpass-sheet service" onClick={(event) => event.stopPropagation()}>
        <div className="sheet-handle" />
        <span className="service-icon-lg" style={{ background: service.bg, color: service.color }}>{service.abbr}</span>
        <h2>{service.label}</h2>
        <p>This government e-service can be accessed with Singpass login.</p>
        <button type="button" className="singpass-primary-btn" onClick={onClose}>Continue</button>
      </section>
    </div>
  );
}

function SingpassTopBar({ title, onBack, onSettings }) {
  return (
    <header className="singpass-topbar">
      <button type="button" onClick={onBack} aria-label="Back">&lt;</button>
      <strong>{title}</strong>
      <button type="button" onClick={onSettings} aria-label="Settings">...</button>
    </header>
  );
}

function SingpassStatusBar() {
  return (
    <div className="singpass-status">
      <span>09:41</span>
      <div>
        <span className="signal-bars" />
        <span>5G</span>
        <span className="battery">61</span>
      </div>
    </div>
  );
}

function SingpassBottomNav({ tab, setTab, goDashboard }) {
  const items = [
    ["home", "Home", "H"],
    ["scan", "Scan", "S"],
    ["inbox", "Inbox", "I"],
  ];
  return (
    <nav className="singpass-bottom-nav">
      {items.map(([id, label, icon]) => (
        <button
          type="button"
          key={id}
          className={tab === id ? "active" : ""}
          data-learn-target={id === "inbox" ? "singpass-inbox-tile" : id === "scan" ? "singpass-scan-tile" : undefined}
          onClick={() => {
            setTab(id);
            goDashboard(id);
          }}
        >
          <span>{icon}</span>
          <strong>{label}</strong>
        </button>
      ))}
    </nav>
  );
}

function DetailRow({ label, value }) {
  return (
    <div className="singpass-detail-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
