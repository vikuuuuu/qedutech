// src/lib/auth.jsx
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import {
  onAuthStateChanged, signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword,
  sendPasswordResetEmail, EmailAuthProvider, reauthenticateWithCredential, updatePassword,
} from "firebase/auth";
import { onValue, ref, update } from "firebase/database";
import { auth, db, getSecondaryAuth } from "./firebase";
import { audit } from "./db";
import { PageLoader } from "../components/ui";

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [state, setState] = useState({ user: null, profile: null, loading: true });

  useEffect(() => {
    let offProfile = () => {};
    const offAuth = onAuthStateChanged(auth, (user) => {
      offProfile();
      if (!user) { setState({ user: null, profile: null, loading: false }); return; }
      offProfile = onValue(
        ref(db, `users/${user.uid}`),
        (snap) => setState({ user, profile: snap.exists() ? { uid: user.uid, ...snap.val() } : null, loading: false }),
        () => setState({ user, profile: null, loading: false })
      );
    });
    return () => { offProfile(); offAuth(); };
  }, []);

  const login = useCallback(async (email, password) => {
    const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
    update(ref(db, `users/${cred.user.uid}`), { lastLogin: Date.now() }).catch(() => {});
    return cred;
  }, []);

  const logout = useCallback(() => signOut(auth), []);
  const resetPassword = useCallback((email) => sendPasswordResetEmail(auth, email.trim()), []);

  const changePassword = useCallback(async (current, next) => {
    const u = auth.currentUser;
    await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, current));
    await updatePassword(u, next);
  }, []);

  /** Create an account for another person without disturbing the admin's session. */
  const createAccount = useCallback(async ({ email, password, ...profile }) => {
    const secondary = getSecondaryAuth();
    const cred = await createUserWithEmailAndPassword(secondary, email.trim(), password);
    await signOut(secondary);
    const record = { ...profile, email: email.trim(), status: "active", createdAt: Date.now() };
    await update(ref(db), { [`users/${cred.user.uid}`]: record });
    audit(state.profile, "create_account", `${profile.role}:${profile.name}`);
    return { uid: cred.user.uid, ...record };
  }, [state.profile]);

  /** First-run: create the very first administrator and lock the setup door. */
  const bootstrapAdmin = useCallback(async ({ name, email, password }) => {
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
    await update(ref(db), {
      [`users/${cred.user.uid}`]: { name, email: email.trim(), role: "admin", status: "active", createdAt: Date.now() },
      "meta/initialized": true,
    });
  }, []);

  const value = useMemo(
    () => ({ ...state, login, logout, resetPassword, changePassword, createAccount, bootstrapAdmin }),
    [state, login, logout, resetPassword, changePassword, createAccount, bootstrapAdmin]
  );
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

/** Route guard: must be signed in, active, and (optionally) hold one of `roles`. */
export function Protected({ roles, children }) {
  const { user, profile, loading, logout } = useAuth();
  const loc = useLocation();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (!profile) {
    return (
      <div className="center-screen">
        <div className="card narrow">
          <h2>Account not provisioned</h2>
          <p className="muted">You are signed in, but no institute profile exists for this account. Ask an administrator to create one.</p>
          <button className="btn btn-primary" onClick={logout}>Sign out</button>
        </div>
      </div>
    );
  }
  if (profile.status === "inactive") {
    return (
      <div className="center-screen">
        <div className="card narrow">
          <h2>Account deactivated</h2>
          <p className="muted">Please contact the institute office to re-activate your access.</p>
          <button className="btn btn-primary" onClick={logout}>Sign out</button>
        </div>
      </div>
    );
  }
  if (roles && !roles.includes(profile.role)) return <Navigate to="/" replace />;
  return children;
}
