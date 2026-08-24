import { useEffect, useState } from "react";
import { useVirtualOS } from "../../state/VirtualOSContext";

const FICTIONAL_DOMAIN = "@dailymail.test";

export function MailApp() {
  const { state, createMailAccount, signInMail, signOutMail, markMailRead, sendMail, receiveMail } = useVirtualOS();
  const [screen, setScreen] = useState(state.mailAccount.created ? "signin" : "welcome");
  const [setupStep, setSetupStep] = useState(1);
  const [form, setForm] = useState({ name: "", username: "", password: "", recovery: "" });
  const [credentials, setCredentials] = useState({ email: state.mailAccount.profile?.email || "", password: "" });
  const [compose, setCompose] = useState({ to: "", subject: "", body: "" });
  const [activeMail, setActiveMail] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (state.mailAccount.signedIn && ["welcome", "signin"].includes(screen)) setScreen("inbox");
  }, [state.mailAccount.signedIn, screen]);

  function createAccount(event) {
    event.preventDefault();
    if (!form.name.trim() || !form.username.trim() || form.password.length < 8) {
      setError("Enter a fictional name, username, and a password of at least 8 characters.");
      return;
    }
    createMailAccount({ name: form.name.trim(), email: `${form.username.trim().toLowerCase().replace(/[^a-z0-9.]/g, "")}${FICTIONAL_DOMAIN}`, password: form.password, recovery: form.recovery });
    setError("");
    setScreen("inbox");
  }

  function signIn(event) {
    event.preventDefault();
    if (credentials.email !== state.mailAccount.profile?.email || credentials.password !== state.mailAccount.password) {
      setError("Couldn’t sign you in. Check the fictional email and password.");
      signInMail(credentials.email, credentials.password);
      return;
    }
    signInMail(credentials.email, credentials.password);
    setError("");
    setScreen("inbox");
  }

  function submitMail(event) {
    event.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(compose.to) || !compose.subject.trim() || !compose.body.trim()) {
      setError("Add a valid fictional recipient, subject, and message before sending.");
      return;
    }
    sendMail({ ...compose, from: state.mailAccount.profile.email });
    const recipient = compose.to;
    setCompose({ to: "", subject: "", body: "" });
    setError("");
    setNotice("Message sent");
    setScreen("inbox");
    window.setTimeout(() => {
      receiveMail({ from: recipient, subject: "Re: Your message", preview: "Thanks for your email. I have received it.", body: "Thanks for your email. I have received it and will respond if anything else is needed." });
    }, 1800);
  }

  if (!state.mailAccount.created && screen === "welcome") return <div className="mail-app mail-welcome"><div className="mail-logo">M</div><h2>Daily Mail</h2><p>A fictional email service for practising everyday digital skills.</p><aside>Training simulation only. Do not enter real personal information or passwords.</aside><button type="button" onClick={() => setScreen("create")}>Create account</button></div>;

  if (!state.mailAccount.created || screen === "create") return <div className="mail-app mail-setup"><header><button type="button" onClick={() => setupStep === 1 ? setScreen("welcome") : setSetupStep(setupStep - 1)}>‹</button><span>Daily Account</span><em>{setupStep}/3</em></header><form onSubmit={createAccount}><h2>{setupStep === 1 ? "Create your account" : setupStep === 2 ? "Choose an address" : "Secure your account"}</h2>{setupStep === 1 ? <label>Fictional name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Alex Tan" /></label> : null}{setupStep === 2 ? <label>Email username<div className="mail-address-input"><input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="alex.tan26" /><span>{FICTIONAL_DOMAIN}</span></div></label> : null}{setupStep === 3 ? <><label>Create password<input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="At least 8 characters" /></label><label>Fictional recovery number (optional)<input value={form.recovery} onChange={(e) => setForm({ ...form, recovery: e.target.value })} placeholder="e.g. 8000 2041" /></label><p className="mail-privacy-note">This training account is local to the simulation and is cleared on reset.</p></> : null}{error ? <p className="mail-error" role="alert">{error}</p> : null}<button type={setupStep === 3 ? "submit" : "button"} onClick={setupStep < 3 ? () => setSetupStep(setupStep + 1) : undefined}>{setupStep === 3 ? "Create account" : "Next"}</button></form></div>;

  if (!state.mailAccount.signedIn) return <div className="mail-app mail-signin"><div className="mail-logo">M</div><h2>Sign in</h2><p>Use the fictional account created in this simulation.</p><form onSubmit={signIn}><label>Email<input value={credentials.email} onChange={(e) => setCredentials({ ...credentials, email: e.target.value })} /></label><label>Password<input type="password" value={credentials.password} onChange={(e) => setCredentials({ ...credentials, password: e.target.value })} /></label>{error ? <p className="mail-error">{error}</p> : null}<button type="submit">Sign in</button></form></div>;

  if (screen === "compose") return <div className="mail-app"><header className="mail-toolbar"><button type="button" onClick={() => setScreen("inbox")}>×</button><strong>New message</strong><button type="button" onClick={submitMail}>Send</button></header><form className="mail-compose" onSubmit={submitMail}><label>To<input value={compose.to} onChange={(e) => setCompose({ ...compose, to: e.target.value })} placeholder="person@example.test" /></label><label>Subject<input value={compose.subject} onChange={(e) => setCompose({ ...compose, subject: e.target.value })} /></label><textarea value={compose.body} onChange={(e) => setCompose({ ...compose, body: e.target.value })} placeholder="Write email" />{error ? <p className="mail-error">{error}</p> : null}</form></div>;

  if (activeMail) return <div className="mail-app"><header className="mail-toolbar"><button type="button" onClick={() => setActiveMail(null)}>‹</button><strong>Daily Mail</strong><button type="button" onClick={() => setScreen("compose")}>Reply</button></header><article className="mail-message"><h2>{activeMail.subject}</h2><div><span>{activeMail.from}</span><small>to me</small></div><p>{activeMail.body}</p></article></div>;

  return <div className="mail-app"><header className="mail-inbox-head"><div className="mail-logo small">M</div><div><h2>Inbox</h2><p>{state.mailAccount.profile.email}</p></div><button type="button" onClick={() => { signOutMail(); setScreen("signin"); }}>Sign out</button></header>{notice ? <div className="mail-notice">{notice}</div> : null}<div className="mail-list">{(state.mail.inbox || []).map((mail) => <button key={mail.id} type="button" className={mail.unread ? "unread" : ""} onClick={() => { markMailRead(mail.id); setActiveMail(mail); }}><span>{String(mail.from).slice(0,1)}</span><div><strong>{mail.from}</strong><b>{mail.subject}</b><p>{mail.preview}</p></div><em>{mail.unread ? "●" : ""}</em></button>)}</div><button type="button" className="mail-fab" onClick={() => setScreen("compose")}>✎ <span>Compose</span></button></div>;
}
