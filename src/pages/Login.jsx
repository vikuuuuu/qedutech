// src/pages/Login.jsx
import { useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { CalendarCheck, ShieldCheck, Wallet, GraduationCap } from "lucide-react";
import { useAuth } from "../lib/auth";
import { useValue } from "../lib/db";
import { Button, Field, PageLoader, useToast } from "../components/ui";

const friendly = (e) => {
  const c = e?.code || "";
  if (c.includes("invalid-credential") || c.includes("wrong-password") || c.includes("user-not-found")) return "Incorrect email or password.";
  if (c.includes("too-many-requests")) return "Too many attempts. Please wait a few minutes and try again.";
  if (c.includes("email-already-in-use")) return "That email is already registered.";
  if (c.includes("weak-password")) return "Password must be at least 6 characters.";
  if (c.includes("network")) return "Network error. Check your connection.";
  return e?.message || "Something went wrong.";
};

export default function Login() {
  const { user, profile, loading, login, resetPassword, bootstrapAdmin } = useAuth();
  const { data: initialized, loading: metaLoading } = useValue("meta/initialized");
  const toast = useToast();
  const loc = useLocation();
  const [mode, setMode] = useState("login"); // login | reset | setup
  const [f, setF] = useState({ name: "", email: "", password: "", confirm: "" });
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));

  if (loading || metaLoading) return <PageLoader />;
  if (user && profile) return <Navigate to={loc.state?.from || "/"} replace />;
  const needsSetup = !initialized;
  const view = needsSetup ? "setup" : mode;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (view === "login") await login(f.email, f.password);
      else if (view === "reset") { await resetPassword(f.email); toast.success("Password reset link sent. Check your inbox."); setMode("login"); }
      else {
        if (f.password !== f.confirm) throw new Error("Passwords do not match.");
        await bootstrapAdmin({ name: f.name, email: f.email, password: f.password });
      }
    } catch (err) { toast.error(friendly(err)); } finally { setBusy(false); }
  };

  const titles = { login: ["Welcome back", "Sign in to your institute portal."], reset: ["Reset password", "We'll email you a secure reset link."], setup: ["Set up your institute", "Create the first administrator account to get started."] };

  return (
    <div className="auth">
      <div className="auth-art">
        <div className="row gap-sm"><img src="/logo.png" width="40" height="40" alt="" style={{ borderRadius: 10 }} /><strong style={{ fontSize: "1.1rem" }}>QuizMaster Institute</strong></div>
        <div>
          <h1>One platform for your whole campus.</h1>
          <p>Admissions to exams, attendance to fees — built for schools, colleges and universities.</p>
          <ul>
            <li><GraduationCap size={18} /> Students, staff, classes &amp; departments</li>
            <li><CalendarCheck size={18} /> Attendance, timetables &amp; online exams</li>
            <li><Wallet size={18} /> Fee invoicing, receipts &amp; report cards</li>
            <li><ShieldCheck size={18} /> Role-based access with a full audit trail</li>
          </ul>
        </div>
        <small style={{ opacity: .6 }}>© {new Date().getFullYear()} QuizMaster</small>
      </div>
      <div className="auth-form">
        <form onSubmit={submit}>
          <div><h2>{titles[view][0]}</h2><p className="muted">{titles[view][1]}</p></div>
          {view === "setup" && <Field label="Full name" required value={f.name} onChange={set("name")} autoComplete="name" />}
          <Field label="Email" type="email" required value={f.email} onChange={set("email")} autoComplete="username" />
          {view !== "reset" && <Field label="Password" type="password" required minLength={6} value={f.password} onChange={set("password")} autoComplete={view === "setup" ? "new-password" : "current-password"} />}
          {view === "setup" && <Field label="Confirm password" type="password" required value={f.confirm} onChange={set("confirm")} autoComplete="new-password" />}
          <Button type="submit" loading={busy}>{view === "login" ? "Sign in" : view === "reset" ? "Send reset link" : "Create administrator"}</Button>
          {!needsSetup && (
            <div className="center small">
              {view === "login" ? <button type="button" className="link-btn" onClick={() => setMode("reset")}>Forgot password?</button>
                : <button type="button" className="link-btn" onClick={() => setMode("login")}>Back to sign in</button>}
            </div>
          )}
          <p className="muted small center">Accounts are issued by your institute office. No public sign-up.</p>
        </form>
      </div>
    </div>
  );
}
