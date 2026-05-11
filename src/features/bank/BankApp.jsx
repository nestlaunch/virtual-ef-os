import { useMemo, useState } from "react";

const ACCOUNTS = [
  { id: "posb-savings", name: "POSB eSavings", number: "034-1-22-908", balance: 1842.5 },
  { id: "posb-current", name: "POSB Current", number: "034-8-18-440", balance: 420.1 },
];

const PAYEES = [
  { id: "hougang-polyclinic", name: "Hougang Polyclinic", bank: "Bill payment", trusted: true },
  { id: "imh", name: "IMH Clinic B", bank: "Bill payment", trusted: true },
  { id: "mother", name: "Mother", bank: "PayNow mobile", trusted: true },
  { id: "dbs-security", name: "DBS Security Officer Alan", bank: "New payee from SMS", trusted: false, scam: true },
];

const FLOW_STEPS = [
  "Log in only through the official app.",
  "Choose account and payee.",
  "Check amount and recipient carefully.",
  "Approve only if the request is expected and safe.",
];

const SCAM_RED_FLAGS = [
  "The message asks you to tap a link or act urgently.",
  "The sender asks for PIN, OTP, Digital Token approval, or account details.",
  "The payee name is a person claiming to be bank staff.",
  "The transfer reason is to unlock or verify an account.",
];

function formatMoney(value) {
  return `S$${value.toFixed(2)}`;
}

function maskAccount(number) {
  return `***-${number.slice(-3)}`;
}

function getPayee(id) {
  return PAYEES.find((payee) => payee.id === id);
}

export function BankApp() {
  const [screen, setScreen] = useState("login");
  const [transfer, setTransfer] = useState({
    from: ACCOUNTS[0].id,
    payee: "",
    amount: "",
    note: "",
  });
  const [tokenApproved, setTokenApproved] = useState(false);
  const [scamDecision, setScamDecision] = useState("");

  const selectedAccount = ACCOUNTS.find((account) => account.id === transfer.from) ?? ACCOUNTS[0];
  const selectedPayee = getPayee(transfer.payee);
  const numericAmount = Number(transfer.amount);
  const isScamTransfer = Boolean(selectedPayee?.scam);
  const canReview = Boolean(selectedPayee && numericAmount > 0 && numericAmount <= selectedAccount.balance);

  const flowProgress = useMemo(() => {
    return [
      screen !== "login",
      Boolean(transfer.from && transfer.payee),
      Boolean(canReview),
      tokenApproved || scamDecision === "report",
    ];
  }, [canReview, scamDecision, screen, tokenApproved, transfer.from, transfer.payee]);

  function updateTransfer(patch) {
    setTransfer((current) => ({ ...current, ...patch }));
  }

  function startNormalTransfer() {
    setScamDecision("");
    setTokenApproved(false);
    setTransfer({
      from: ACCOUNTS[0].id,
      payee: "hougang-polyclinic",
      amount: "12.40",
      note: "Clinic payment",
    });
    setScreen("transfer");
  }

  function startScamScenario() {
    setScamDecision("");
    setTokenApproved(false);
    setTransfer({
      from: ACCOUNTS[0].id,
      payee: "dbs-security",
      amount: "500.00",
      note: "Account unlock verification",
    });
    setScreen("scam");
  }

  function submitTransfer(event) {
    event.preventDefault();
    if (!canReview) {
      return;
    }
    setScreen(isScamTransfer ? "scam-warning" : "review");
  }

  if (screen === "login") {
    return (
      <div className="bank-app bank-login">
        <div className="bank-login-card">
          <div className="bank-brand">
            <span>POSB</span>
            <strong>Practice Bank</strong>
          </div>
          <h2>Welcome back</h2>
          <p>This is a simulated banking app for learning. It does not connect to a real bank or move real money.</p>
          <button type="button" className="bank-primary-btn" onClick={() => setScreen("home")}>
            Log in with Digital Token
          </button>
          <button type="button" className="bank-ghost-btn" onClick={startScamScenario}>
            Try scam practice first
          </button>
        </div>
        <div className="bank-safety-strip">
          Never share your PIN, OTP, or Digital Token approval with anyone.
        </div>
      </div>
    );
  }

  if (screen === "scam") {
    return (
      <div className="bank-app">
        <BankHeader onHome={() => setScreen("home")} />
        <main className="bank-content">
          <section className="bank-scam-card">
            <span className="bank-alert-label">Potential scam message</span>
            <p className="bank-fake-message">
              POSB: Your account has been locked. Transfer S$500 to security officer Alan now to verify your account.
              Do not tell anyone. Approval required in 10 minutes.
            </p>
          </section>
          <section className="bank-panel">
            <h3>What should you do?</h3>
            <div className="bank-choice-grid">
              <button
                type="button"
                className={scamDecision === "report" ? "safe" : ""}
                onClick={() => setScamDecision("report")}
              >
                Report and do not transfer
              </button>
              <button
                type="button"
                className={scamDecision === "call" ? "risky" : ""}
                onClick={() => setScamDecision("call")}
              >
                Call the number in the SMS
              </button>
              <button
                type="button"
                className={scamDecision === "transfer" ? "risky" : ""}
                onClick={() => setScamDecision("transfer")}
              >
                Continue with transfer
              </button>
            </div>
            {scamDecision ? (
              <div className={`bank-feedback ${scamDecision === "report" ? "safe" : "risky"}`}>
                {scamDecision === "report"
                  ? "Good choice. Use the official app, website, or hotline instead of links or phone numbers in messages."
                  : "Risky choice. A bank will not ask you to transfer money, reveal OTPs, or approve a token request to unlock your account."}
              </div>
            ) : null}
          </section>
          <section className="bank-panel">
            <h3>Red flags</h3>
            <ul className="bank-safety-list">
              {SCAM_RED_FLAGS.map((flag) => (
                <li key={flag}>{flag}</li>
              ))}
            </ul>
          </section>
          <div className="bank-action-row">
            <button type="button" className="bank-ghost-btn" onClick={() => setScreen("home")}>Back</button>
            <button type="button" className="bank-primary-btn" onClick={() => setScreen("transfer")}>View transfer screen</button>
          </div>
        </main>
      </div>
    );
  }

  if (screen === "transfer") {
    return (
      <div className="bank-app">
        <BankHeader onHome={() => setScreen("home")} />
        <main className="bank-content">
          <h2>Transfer money</h2>
          <form className="bank-form" onSubmit={submitTransfer}>
            <label>
              <span>From</span>
              <select value={transfer.from} onChange={(event) => updateTransfer({ from: event.target.value })}>
                {ACCOUNTS.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} {maskAccount(account.number)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>To</span>
              <select value={transfer.payee} onChange={(event) => updateTransfer({ payee: event.target.value })}>
                <option value="">Choose payee</option>
                {PAYEES.map((payee) => (
                  <option key={payee.id} value={payee.id}>
                    {payee.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Amount</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={transfer.amount}
                onChange={(event) => updateTransfer({ amount: event.target.value })}
                placeholder="0.00"
              />
            </label>
            <label>
              <span>Purpose</span>
              <input
                value={transfer.note}
                onChange={(event) => updateTransfer({ note: event.target.value })}
                placeholder="What is this payment for?"
              />
            </label>
            {isScamTransfer ? (
              <div className="bank-warning">
                Warning: This looks like a scam request. Bank staff should not ask you to transfer money to verify your account.
              </div>
            ) : null}
            {numericAmount > selectedAccount.balance ? (
              <div className="bank-warning">Insufficient simulated balance for this transfer.</div>
            ) : null}
            <button type="submit" className="bank-primary-btn" disabled={!canReview}>
              Review transfer
            </button>
          </form>
        </main>
      </div>
    );
  }

  if (screen === "scam-warning") {
    return (
      <div className="bank-app">
        <BankHeader onHome={() => setScreen("home")} />
        <main className="bank-content">
          <section className="bank-block-card">
            <span>Transfer paused</span>
            <h2>This may be a scam</h2>
            <p>
              The payee and reason match common impersonation scam patterns. Do not approve this transfer if someone
              contacted you unexpectedly.
            </p>
            <ul className="bank-safety-list">
              <li>Do not share OTPs, PINs, or Digital Token approvals.</li>
              <li>Do not use phone numbers or links from unsolicited messages.</li>
              <li>Verify through the official app, official website, or official hotline.</li>
            </ul>
          </section>
          <div className="bank-action-row vertical">
            <button
              type="button"
              className="bank-primary-btn safe"
              onClick={() => {
                setScamDecision("report");
                setScreen("safe-result");
              }}
            >
              Cancel and report scam
            </button>
            <button type="button" className="bank-ghost-btn" onClick={() => setScreen("transfer")}>
              Go back and edit
            </button>
            <button type="button" className="bank-danger-btn" onClick={() => setScreen("review")}>
              Continue anyway (practice only)
            </button>
          </div>
        </main>
      </div>
    );
  }

  if (screen === "review" || screen === "token" || screen === "success" || screen === "safe-result") {
    return (
      <div className="bank-app">
        <BankHeader onHome={() => setScreen("home")} />
        <main className="bank-content">
          {screen === "review" ? (
            <ReviewScreen
              account={selectedAccount}
              payee={selectedPayee}
              transfer={transfer}
              isScamTransfer={isScamTransfer}
              onBack={() => setScreen("transfer")}
              onConfirm={() => setScreen("token")}
            />
          ) : null}
          {screen === "token" ? (
            <TokenScreen
              isScamTransfer={isScamTransfer}
              onCancel={() => setScreen(isScamTransfer ? "scam-warning" : "review")}
              onApprove={() => {
                setTokenApproved(true);
                setScreen("success");
              }}
            />
          ) : null}
          {screen === "success" ? (
            <ResultScreen
              title={isScamTransfer ? "Practice transfer completed" : "Transfer submitted"}
              message={
                isScamTransfer
                  ? "In real life, this would be unsafe. The safer action is to cancel, report, and verify through official channels."
                  : "You checked the payee, amount, and purpose before approving the simulated transfer."
              }
              onDone={() => setScreen("home")}
            />
          ) : null}
          {screen === "safe-result" ? (
            <ResultScreen
              title="Scam avoided"
              message="You stopped the transfer and chose to report the suspicious request. That is the safest action in this scenario."
              onDone={() => setScreen("home")}
            />
          ) : null}
        </main>
      </div>
    );
  }

  return (
    <div className="bank-app">
      <BankHeader onHome={() => setScreen("home")} />
      <main className="bank-content">
        <section className="bank-balance-card">
          <span>Total balance</span>
          <strong>{formatMoney(ACCOUNTS.reduce((sum, account) => sum + account.balance, 0))}</strong>
          <p>POSB Practice Bank</p>
        </section>

        <section className="bank-quick-actions">
          <button type="button" onClick={startNormalTransfer}>Transfer</button>
          <button type="button" onClick={startNormalTransfer}>PayNow</button>
          <button type="button" onClick={startScamScenario}>Scam check</button>
        </section>

        <section className="bank-panel">
          <h3>Accounts</h3>
          {ACCOUNTS.map((account) => (
            <div key={account.id} className="bank-account-row">
              <div>
                <strong>{account.name}</strong>
                <span>{maskAccount(account.number)}</span>
              </div>
              <b>{formatMoney(account.balance)}</b>
            </div>
          ))}
        </section>

        <section className="bank-panel bank-scam-teaser">
          <span>Security alert practice</span>
          <p>Learn what to do when someone claims to be from POSB and asks for an urgent transfer.</p>
          <button type="button" onClick={startScamScenario}>Start scam scenario</button>
        </section>

        <section className="bank-panel">
          <h3>Learning flow</h3>
          <div className="bank-flow-list">
            {FLOW_STEPS.map((step, index) => (
              <span key={step} className={flowProgress[index] ? "complete" : ""}>
                {flowProgress[index] ? "Done" : index + 1}. {step}
              </span>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

function BankHeader({ onHome }) {
  return (
    <header className="bank-header">
      <button type="button" onClick={onHome} aria-label="Bank home">POSB</button>
      <div>
        <strong>digibank practice</strong>
        <span>Simulated banking</span>
      </div>
    </header>
  );
}

function ReviewScreen({ account, payee, transfer, isScamTransfer, onBack, onConfirm }) {
  return (
    <>
      <h2>Review transfer</h2>
      <section className="bank-panel bank-review">
        <div>
          <span>From</span>
          <strong>{account.name} {maskAccount(account.number)}</strong>
        </div>
        <div>
          <span>To</span>
          <strong>{payee?.name}</strong>
        </div>
        <div>
          <span>Amount</span>
          <strong>{formatMoney(Number(transfer.amount))}</strong>
        </div>
        <div>
          <span>Purpose</span>
          <strong>{transfer.note || "Not stated"}</strong>
        </div>
      </section>
      {isScamTransfer ? (
        <div className="bank-warning">
          This is intentionally unsafe for practice. The correct real-life action is to cancel and report.
        </div>
      ) : null}
      <div className="bank-action-row">
        <button type="button" className="bank-ghost-btn" onClick={onBack}>Back</button>
        <button type="button" className="bank-primary-btn" onClick={onConfirm}>Confirm</button>
      </div>
    </>
  );
}

function TokenScreen({ isScamTransfer, onCancel, onApprove }) {
  return (
    <>
      <section className={`bank-token-card ${isScamTransfer ? "risky" : ""}`}>
        <span>Digital Token</span>
        <h2>Approve transfer?</h2>
        <p>
          {isScamTransfer
            ? "Scam practice: do not approve token requests you did not initiate or do not understand."
            : "Check that the amount and recipient are correct before approving."}
        </p>
      </section>
      <div className="bank-action-row">
        <button type="button" className="bank-ghost-btn" onClick={onCancel}>Cancel</button>
        <button type="button" className={isScamTransfer ? "bank-danger-btn" : "bank-primary-btn"} onClick={onApprove}>
          Approve
        </button>
      </div>
    </>
  );
}

function ResultScreen({ title, message, onDone }) {
  return (
    <section className="bank-result-card">
      <span>Result</span>
      <h2>{title}</h2>
      <p>{message}</p>
      <button type="button" className="bank-primary-btn" onClick={onDone}>Done</button>
    </section>
  );
}
