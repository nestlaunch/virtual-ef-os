import { useEffect, useMemo, useState } from "react";
import { ALIAS_POOL, formatAlias } from "../../state/v2Assessment";
import { useVirtualOS } from "../../state/VirtualOSContext";
import { createCloudAccount, listCloudAccounts, loginCloudAccount } from "../../state/cloudSync";

export function JoinSession({ onBack }) {
  const { state, joinSession, setPendingUserIdentity, addUserAccount } = useVirtualOS();
  const [step, setStep] = useState(1);
  const [accountMode, setAccountMode] = useState("login");
  const [alias, setAlias] = useState("");
  const [pin, setPin] = useState("");
  const [userPin, setUserPin] = useState("");
  const [identityError, setIdentityError] = useState("");
  const [authenticatedAccount, setAuthenticatedAccount] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [cloudAccounts, setCloudAccounts] = useState([]);
  const [accountsLoading, setAccountsLoading] = useState(true);

  const createdAccounts = useMemo(() => {
    const accountsByAlias = new Map();
    [...state.session.userAccounts, ...cloudAccounts].forEach((account) => {
      const cleanAlias = String(account?.alias || "").trim();
      if (cleanAlias) {
        accountsByAlias.set(cleanAlias.toLowerCase(), { ...account, alias: cleanAlias });
      }
    });
    return [...accountsByAlias.values()].sort((a, b) => a.alias.localeCompare(b.alias));
  }, [cloudAccounts, state.session.userAccounts]);

  const availableAliases = useMemo(() => {
    const taken = new Set([
      ...state.session.userAccounts.map((account) => account.alias?.toLowerCase()).filter(Boolean),
    ]);
    return ALIAS_POOL.filter((item) => !taken.has(item.toLowerCase()));
  }, [state.session.userAccounts]);

  useEffect(() => {
    if (accountMode === "create" && (!alias || !availableAliases.includes(alias))) {
      setAlias(availableAliases[0] || "");
    }
  }, [accountMode, alias, availableAliases]);

  useEffect(() => {
    let cancelled = false;
    listCloudAccounts()
      .then((accounts) => {
        if (!cancelled) {
          setCloudAccounts(accounts);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCloudAccounts([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setAccountsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleIdentitySubmit(event) {
    event.preventDefault();
    const cleanAlias = alias.trim();
    setSubmitting(true);
    setIdentityError("");
    let verifiedAccount = null;
    if (accountMode === "create") {
      const duplicateAlias = state.session.userAccounts.some((account) => account.alias.toLowerCase() === cleanAlias.toLowerCase());
      if (duplicateAlias) {
        setIdentityError("This alias has already been created.");
        setSubmitting(false);
        return;
      }
      const created = await createCloudAccount(cleanAlias, userPin);
      if (!created?.ok) {
        setIdentityError(created?.error || "Unable to create this account.");
        setSubmitting(false);
        return;
      }
      if (created?.existing) {
        setIdentityError("This alias has already been created.");
        setSubmitting(false);
        return;
      }
      addUserAccount({ id: created?.account?.id, alias: cleanAlias, pin: userPin, participantCode: created?.account?.participantCode });
      verifiedAccount = created.account;
    } else {
      const login = await loginCloudAccount(cleanAlias, userPin);
      if (!login.ok) {
        setIdentityError(login.error);
        setSubmitting(false);
        return;
      }
      verifiedAccount = login.account;
      if (!state.session.userAccounts.some((account) => account.id === verifiedAccount.id)) {
        addUserAccount({ id: verifiedAccount.id, alias: verifiedAccount.alias, pin: userPin, participantCode: verifiedAccount.participantCode });
      }
    }
    setAuthenticatedAccount(verifiedAccount);
    setIdentityError("");
    setPendingUserIdentity(verifiedAccount.alias, userPin);
    setAlias(verifiedAccount.alias);
    setSubmitting(false);
    setStep(2);
  }

  async function handleJoinSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    await joinSession(pin, userPin, authenticatedAccount.alias, authenticatedAccount);
    setSubmitting(false);
  }

  return (
    <main className="join-screen">
      <section className="join-card">
        <button type="button" className="join-main-back" onClick={onBack}>
          <span aria-hidden="true">←</span> Back to main page
        </button>
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
              {accountMode === "login" ? (
                <select
                  value={alias}
                  onChange={(event) => {
                    setAlias(event.target.value);
                    setUserPin("");
                    setAuthenticatedAccount(null);
                  }}
                  aria-label="Assigned alias"
                  autoComplete="username"
                  disabled={accountsLoading && createdAccounts.length === 0}
                >
                  <option value="">{accountsLoading ? "Loading assigned aliases…" : "Select assigned alias"}</option>
                  {createdAccounts.map((account) => (
                    <option key={account.id || account.alias} value={account.alias}>{formatAlias(account.alias)}</option>
                  ))}
                </select>
              ) : (
                <select value={alias} onChange={(event) => setAlias(event.target.value)} aria-label="Choose a fictional alias">
                  {availableAliases.map((item) => <option key={item} value={item}>{formatAlias(item)}</option>)}
                </select>
              )}
              <input
                value={userPin}
                onChange={(event) => setUserPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="1234"
                maxLength={4}
                inputMode="numeric"
                aria-label="User PIN"
                disabled={!alias}
              />
              {!alias ? <small className="identity-hint">Select the assigned alias before entering its PIN.</small> : null}
              <button type="submit" disabled={!alias.trim() || userPin.length !== 4 || submitting}>
                {submitting ? "Checking..." : accountMode === "login" ? "Access account" : "Create account"}
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
                  ? ""
                  : availableAliases[0] || "";
                setAlias(source || "");
                setUserPin("");
                setAuthenticatedAccount(null);
                setIdentityError("");
              }}
            >
              {accountMode === "login" ? "Create new account" : "Use existing created account"}
            </button>
          </>
        ) : (
          <>
            <h1>Join Session</h1>
            <p>Account verified as <strong>{formatAlias(authenticatedAccount?.alias || alias)}</strong>. Now enter the 6-letter session PIN shown by the admin.</p>
            <form className="session-pin-form" onSubmit={handleJoinSubmit}>
              <input
                value={pin}
                onChange={(event) => setPin(event.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 6))}
                placeholder="ABCDEF"
                maxLength={6}
                aria-label="Session PIN"
              />
              <button type="submit" disabled={pin.length !== 6 || !authenticatedAccount || submitting}>{submitting ? "Joining..." : "Join"}</button>
              <button type="button" className="join-back-btn" onClick={() => {
                setStep(1);
                setPin("");
                setUserPin("");
                setAuthenticatedAccount(null);
              }}>Back</button>
            </form>
          </>
        )}
        {state.session.joinError ? <strong className="join-error">{state.session.joinError}</strong> : null}
        <p className="join-note">
          Cross-device sessions require the deployed Worker URL so the admin and user laptops share the same session PIN.
        </p>
      </section>
    </main>
  );
}
