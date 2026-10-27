// src/components/Layout.jsx
import { Suspense, useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { LogOut, Menu, Moon, Sun, X } from "lucide-react";
import { useAuth } from "../lib/auth";
import { useValue } from "../lib/db";
import { NAV, ROLE_LABEL } from "../lib/nav";
import { Avatar, PageLoader } from "./ui";
import { cx } from "../lib/utils";

function useTheme() {
  const [theme, setTheme] = useState(() => document.documentElement.getAttribute("data-theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem("qm-theme", theme); } catch { /* storage may be blocked */ }
  }, [theme]);
  return [theme, () => setTheme((t) => (t === "dark" ? "light" : "dark"))];
}

export default function Layout() {
  const { profile, logout } = useAuth();
  const { data: inst } = useValue("institute");
  const [open, setOpen] = useState(false);
  const [theme, toggleTheme] = useTheme();
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);

  const groups = NAV[profile.role] || [];
  return (
    <div className="shell">
      <aside className={cx("sidebar", open && "open")}>
        <div className="brand">
          <img src="/logo.png" alt="" width="34" height="34" />
          <div>
            <strong>{inst?.name || "QuizMaster"}</strong>
            <small>{inst?.type ? `${inst.type[0].toUpperCase()}${inst.type.slice(1)}` : "Institute"} portal</small>
          </div>
          <button className="icon-btn only-mobile" onClick={() => setOpen(false)} aria-label="Close menu"><X size={18} /></button>
        </div>
        <nav>
          {groups.map((g) => (
            <div key={g.group} className="nav-group">
              <span className="nav-title">{g.group}</span>
              {g.items.map(({ to, label, icon: Icon, end }) => (
                <NavLink key={label} to={to} end={end} className={({ isActive }) => cx("nav-link", isActive && "active")}>
                  <Icon size={18} />{label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="side-foot">
          <Avatar name={profile.name} />
          <div className="grow">
            <strong className="ellipsis">{profile.name}</strong>
            <small className="muted">{ROLE_LABEL[profile.role]}</small>
          </div>
          <button className="icon-btn" onClick={logout} title="Sign out" aria-label="Sign out"><LogOut size={18} /></button>
        </div>
      </aside>
      {open && <div className="scrim" onClick={() => setOpen(false)} />}
      <div className="main">
        <header className="topbar">
          <button className="icon-btn only-mobile" onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={20} /></button>
          <span className="grow" />
          {inst?.academicYear && <span className="chip">AY {inst.academicYear}</span>}
          <button className="icon-btn" onClick={toggleTheme} title="Toggle theme" aria-label="Toggle theme">{theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}</button>
        </header>
        <main className="content">
          <Suspense fallback={<PageLoader />}><Outlet /></Suspense>
        </main>
      </div>
    </div>
  );
}
