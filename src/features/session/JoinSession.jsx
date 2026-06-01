import { useState } from "react";
import { ALIAS_POOL, formatAlias } from "../../state/v2Assessment";
import { useVirtualOS } from "../../state/VirtualOSContext";

export function JoinSession() {
  const { state, joinSession, setPendingUserIdentity, addUserAccount } = useVirtualOS();
  const [step, setStep] = useState(state.session.pendingAlias && state.session.pendingUserPin ? 2 : 1);
  const [accountMode, setAccountMode] = useState("login");
  const [alias, setAlias] = useState(state.session.pendingAlias || state.session.userAccounts[0]?.alias || "");
  const [pin, setPin] = useState("");
  const [userPin, setUserPin] = useState(state.session.pendingUserPin || "");
  const [identityError, setIdentityError] = useState("");

  function handleIdentitySubmit(event) {
    event.preventDefault();
    const cleanAlias = alias.trim();
    if (accountMode === "create") {
      const duplicateAlias = state.session.userAccounts.some((account) => account.alias.toLowerCase() === cleanAlias.toLowerCase());
      const duplicatePin = state.session.userAccounts.some((account) => account.pin === userPin);
      if (duplicateAlias || duplicatePin) {
        setIdentityError(duplicateAlias ? "This alias has already been created." : "This 4-digit PIN is already assigned.");
        return;
      }
      addUserAccount({ alias: cleanAlias, pin: userPin });
    }
    setIdentityError("");
    setPendingUserIdentity(cleanAlias, userPin);
    setStep(2);
  }

  function handleJoinSubmit(event) {
    event.preventDefault();
    joinSession(pin, userPin);
  }

  return (
    <main className="join-screen">
      <section className="join-card">
        <span className="join-kicker">Secure practice login</span>
        <div className="join-steps" aria-label="Join steps">
          <span className={step === 1 ? "active" : ""}>1</span>
          <span className={step === 2 ? "active" : ""}>2</span>
        </div>
        {step === 1 ? (
          <>
            <h1>Sign In</h1>
            <p>Use your assigned alias and 4-digit user PIN.</p>
            <form className="identity-form" onSubmit={handleIdentitySubmit}>
              <h2>Login details</h2>
              <select
                value={alias}
                onChange={(event) => setAlias(event.target.value)}
                aria-label="Assigned alias"
                disabled={accountMode === "login" && state.session.userAccounts.length === 0}
              >
                {accountMode === "login" && state.session.userAccounts.length === 0 ? (
                  <option value="">No accounts created yet</option>
                ) : null}
                {(accountMode === "login" ? state.session.userAccounts : ALIAS_POOL).map((item) => {
                  const value = typeof item === "string" ? item : item.alias;
                  const key = typeof item === "string" ? item : item.id;
                  return <option key={key} value={value}>{formatAlias(value)}</option>;
                })}
              </select>
              <input
                value={userPin}
                onChange={(event) => setUserPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="1234"
                maxLength={4}
                inputMode="numeric"
                aria-label="User PIN"
              />
              <button type="submit" disabled={!alias.trim() || userPin.length !== 4}>
                {accountMode === "login" ? "Continue" : "Create"}
              </button>
            </form>
            {identityError ? <strong className="join-error">{identityError}</strong> : null}
            <button
              type="button"
              className="create-account-link"
              onClick={() => {
                const nextMode = accountMode === "login" ? "create" : "login";
                setAccountMode(nextMode);
                const source = nextMode === "login"
                  ? state.session.userAccounts[0]?.alias
                  : ALIAS_POOL.find((item) => !state.session.userAccounts.some((account) => account.alias === item)) || ALIAS_POOL[0];
                setAlias(source || "");
                setUserPin("");
              }}
            >
              {accountMode === "login" ? "Create new account" : "Use existing created account"}
            </button>
          </>
        ) : (
          <>
            <h1>Join Session</h1>
            <p>Signed in as <strong>{formatAlias(alias)}</strong>. Enter the 6-letter session PIN shown by the admin.</p>
            <form className="session-pin-form" onSubmit={handleJoinSubmit}>
              <input
                value={pin}
                onChange={(event) => setPin(event.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 6))}
                placeholder="ABCDEF"
                maxLength={6}
                aria-label="Session PIN"
              />
              <button type="submit" disabled={pin.length !== 6}>Join</button>
              <button type="button" className="join-back-btn" onClick={() => setStep(1)}>Back</button>
            </form>
          </>
        )}
        {state.session.joinError ? <strong className="join-error">{state.session.joinError}</strong> : null}
        <p className="join-note">
          Prototype note: cross-device joining will use Cloudflare session storage. This browser build enforces the PIN and 6-device model locally.
        </p>
      </section>
    </main>
  );
}
