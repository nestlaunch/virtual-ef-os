import { useEffect, useMemo, useState } from "react";
import { useVirtualOS } from "../../state/VirtualOSContext";

const ACCOUNTS = [
  { id: "sunrise-savings", name: "Sunrise Savings", number: "034-1-22-908", balance: 1842.5 },
  { id: "sunrise-current", name: "Sunrise Current", number: "034-8-18-440", balance: 420.1 },
];

const PAYEES = [
  { id: "hougang-polyclinic", name: "Hougang Polyclinic", bank: "Bill payment", trusted: true },
  { id: "imh", name: "IMH Clinic B", bank: "Bill payment", trusted: true },
  { id: "mother", name: "Mother", bank: "PayNow mobile", trusted: true },
  { id: "sunrise-security", name: "Sunrise Security Officer Alan", bank: "New payee from SMS", trusted: false, scam: true },
];

const FLOW_STEPS = [
  "Log in only through the official app.",
  "Choose account and payee.",
  "Check amount and recipient carefully.",
  "Submit only after reviewing the payment details.",
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
  const { state, openApp, requestBankLogin, clearSingpassTransaction, signOutBank } = useVirtualOS();
  const effectiveMode = state.session.currentUserId
    ? state.session.userModes[state.session.currentUserId] || state.session.mode
    : state.session.mode;
  const [screen, setScreen] = useState(state.bankAuth?.status === "authenticated" ? "home" : "login");
  const [transfer, setTransfer] = useState({
    from: ACCOUNTS[0].id,
    payee: "",
    amount: "",
    note: "",
  });
  const [paymentType, setPaymentType] = useState("transfer");
  const [tokenApproved, setTokenApproved] = useState(false);
  const [scamDecision, setScamDecision] = useState("");

  const selectedAccount = ACCOUNTS.find((account) => account.id === transfer.from) ?? ACCOUNTS[0];
  const selectedPayee = getPayee(transfer.payee);
  const numericAmount = Number(transfer.amount);
  const isScamTransfer = Boolean(selectedPayee?.scam);
  const isLearnMode = effectiveMode === "learn";
  const isPracticeMode = effectiveMode === "practice";
  const learnPaymentReady = transfer.payee === "hougang-polyclinic"
    && transfer.amount === "25.00"
    && transfer.note.trim().toLowerCase() === "clinic bill";
  const canReview = Boolean(
    selectedPayee
    && numericAmount > 0
    && numericAmount <= selectedAccount.balance
    && (!isLearnMode || learnPaymentReady)
  );
  const availablePayees = isLearnMode ? PAYEES.filter((payee) => !payee.scam) : PAYEES;

  useEffect(() => {
    if (state.bankAuth?.status === "authenticated") {
      setScreen("home");
      if (state.singpass?.transaction?.source === "bank-login") clearSingpassTransaction();
    }
  }, [state.bankAuth?.status, state.singpass?.transaction?.source, clearSingpassTransaction]);

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

  function startNormalTransfer(type = "transfer") {
    setScamDecision("");
    setTokenApproved(false);
    setPaymentType(type);
    setTransfer({
      from: ACCOUNTS[0].id,
      payee: "",
      amount: "",
      note: type === "paynow" ? "PayNow practice" : "Payment practice",
    });
    setScreen("payee");
  }

  function startScamScenario() {
    setScamDecision("");
    setTokenApproved(false);
    setTransfer({
      from: ACCOUNTS[0].id,
      payee: "sunrise-security",
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

  function choosePayee(payeeId) {
    updateTransfer({ payee: payeeId });
    setScreen("amount");
  }

  function completePayment() {
    setTokenApproved(true);
    window.dispatchEvent(new CustomEvent("virtual-os-learn-bank-confirmed", {
      detail: { payee: selectedPayee?.name, amount: transfer.amount },
    }));
    window.dispatchEvent(new CustomEvent("virtual-os-learn-bank-payment", { detail: { payee: selectedPayee?.name, amount: transfer.amount } }));
    setScreen("success");
  }

  if (screen === "login") {
    return (
      <div className="bank-app bank-login">
        <div className="bank-login-card">
          <div className="bank-brand">
            <span>Sunrise</span>
            <strong>Practice Bank</strong>
          </div>
          <h2>Welcome back</h2>
          <p>This is a simulated banking app for learning. It does not connect to a real bank or move real money.</p>
          <button type="button" className="bank-primary-btn" onClick={() => { requestBankLogin(); openApp("singpass"); }}>
            Log in with Singpass
          </button>
          {!isLearnMode ? (
            <button type="button" className="bank-ghost-btn" onClick={startScamScenario}>
              Try scam practice first
            </button>
          ) : null}
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
              Sunrise Bank: Your account has been locked. Transfer S$500 to security officer Alan now to verify your account.
              Do not tell anyone. Approval required in 10 minutes.
            </p>
          </section>
          <section className="bank-panel">
            <h3>What should you do?</h3>
            {isPracticeMode ? (
              <p className="bank-mode-rule">Practice mode: the task only continues after the safe option is selected.</p>
            ) : null}
            <div className="bank-choice-grid">
              <button
                type="button"
                className={`${scamDecision === "report" ? "safe" : ""} ${isLearnMode ? "guided-correct" : ""}`}
                onClick={() => setScamDecision("report")}
              >
                Report and do not transfer
              </button>
              <button
                type="button"
                className={scamDecision === "call" ? "risky" : ""}
                disabled={isPracticeMode}
                onClick={() => setScamDecision("call")}
              >
                Call the number in the SMS
              </button>
              <button
                type="button"
                className={scamDecision === "transfer" ? "risky" : ""}
                disabled={isPracticeMode}
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
                {availablePayees.map((payee) => (
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

  if (screen === "payee") {
    return (
      <div className="bank-app">
        <BankHeader onHome={() => setScreen("home")} />
        <main className="bank-content">
          <h2>{paymentType === "paynow" ? "PayNow" : "Transfer"}</h2>
          <section className="bank-panel">
            <h3>From account</h3>
            <label className="bank-account-select">
              <span>Pay from</span>
              <select value={transfer.from} onChange={(event) => updateTransfer({ from: event.target.value })}>
                {ACCOUNTS.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} {maskAccount(account.number)}
                  </option>
                ))}
              </select>
            </label>
          </section>
          <section className="bank-panel">
            <h3>Choose recipient</h3>
            <div className="bank-payee-list">
              {availablePayees.map((payee) => (
                <button
                  key={payee.id}
                  type="button"
                  className={`bank-payee-card ${transfer.payee === payee.id ? "selected" : ""}`}
                  onClick={() => choosePayee(payee.id)}
                >
                  <span>{payee.name.slice(0, 1)}</span>
                  <strong>{payee.name}</strong>
                  <em>{payee.bank}</em>
                </button>
              ))}
            </div>
          </section>
        </main>
      </div>
    );
  }

  if (screen === "amount") {
    return (
      <div className="bank-app">
        <BankHeader onHome={() => setScreen("home")} />
        <main className="bank-content">
          <h2>Enter amount</h2>
          <section className="bank-panel bank-payment-summary">
            <span>To</span>
            <strong>{selectedPayee?.name}</strong>
            <em>{selectedPayee?.bank}</em>
          </section>
          <form className="bank-amount-form" onSubmit={submitTransfer}>
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
            <div className="bank-payment-summary compact">
              <span>Available balance</span>
              <strong>{formatMoney(selectedAccount.balance)}</strong>
            </div>
            {numericAmount > selectedAccount.balance ? (
              <div className="bank-warning">Insufficient simulated balance for this payment.</div>
            ) : null}
            <div className="bank-action-row">
              <button type="button" className="bank-ghost-btn" onClick={() => setScreen("payee")}>Back</button>
              <button type="submit" className="bank-primary-btn" disabled={!canReview}>Review payment</button>
            </div>
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
            <button type="button" className="bank-danger-btn" disabled={isPracticeMode} onClick={() => setScreen("review")}>
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
              onBack={() => setScreen("amount")}
              onConfirm={completePayment}
            />
          ) : null}
          {screen === "token" ? (
            <TokenScreen
              isScamTransfer={isScamTransfer}
              isPracticeMode={isPracticeMode}
              onCancel={() => setScreen(isScamTransfer ? "scam-warning" : "review")}
              onApprove={() => {
                setTokenApproved(true);
                window.dispatchEvent(new CustomEvent("virtual-os-learn-bank-payment", {
                  detail: { payee: selectedPayee?.name, amount: transfer.amount },
                }));
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
                  : "Payment completed. You checked the payee, amount, and purpose before submitting the simulated transfer."
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
        <button type="button" className="bank-signout-btn" onClick={() => { signOutBank(); setScreen("login"); }}>Sign out</button>
        <section className="bank-balance-card">
          <span>Total balance</span>
          <strong>{formatMoney(ACCOUNTS.reduce((sum, account) => sum + account.balance, 0))}</strong>
          <p>Sunrise Practice Bank</p>
        </section>

        <section className="bank-quick-actions">
          <button type="button" onClick={() => startNormalTransfer("transfer")}>Transfer</button>
          <button type="button" onClick={() => startNormalTransfer("paynow")}>PayNow</button>
          {!isLearnMode ? <button type="button" onClick={startScamScenario}>Scam check</button> : null}
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

        {!isLearnMode ? (
          <section className="bank-panel bank-scam-teaser">
            <span>Security alert practice</span>
            <p>Learn what to do when someone claims to be from Sunrise Bank and asks for an urgent transfer.</p>
            <button type="button" onClick={startScamScenario}>Start scam scenario</button>
          </section>
        ) : null}

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
      <button type="button" onClick={onHome} aria-label="Bank home">Sunrise</button>
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

function TokenScreen({ isScamTransfer, isPracticeMode, onCancel, onApprove }) {
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
        <button
          type="button"
          className={isScamTransfer ? "bank-danger-btn" : "bank-primary-btn"}
          disabled={isScamTransfer && isPracticeMode}
          onClick={onApprove}
        >
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
