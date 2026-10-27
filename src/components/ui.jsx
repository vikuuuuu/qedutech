// src/components/ui.jsx
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, CheckCircle2, AlertCircle, Info, Loader2, Inbox } from "lucide-react";
import { cx, initials } from "../lib/utils";

export function Button({ variant = "primary", size = "md", icon: Icon, loading, className, children, ...p }) {
  return (
    <button className={cx("btn", `btn-${variant}`, size === "sm" && "btn-sm", className)} disabled={loading || p.disabled} {...p}>
      {loading ? <Loader2 size={16} className="spin" /> : Icon ? <Icon size={16} /> : null}
      {children}
    </button>
  );
}

export const Card = ({ title, subtitle, actions, children, className, flush }) => (
  <section className={cx("card", className)}>
    {(title || actions) && (
      <header className="card-head">
        <div>
          {title && <h3>{title}</h3>}
          {subtitle && <p className="muted small">{subtitle}</p>}
        </div>
        {actions && <div className="row gap-sm">{actions}</div>}
      </header>
    )}
    <div className={cx("card-body", flush && "flush")}>{children}</div>
  </section>
);

export const Badge = ({ tone = "neutral", children }) => <span className={cx("badge", `badge-${tone}`)}>{children}</span>;

export const Stat = ({ label, value, icon: Icon, tone = "indigo", hint }) => (
  <div className="stat">
    {Icon && <div className={cx("stat-icon", `tone-${tone}`)}><Icon size={20} /></div>}
    <div>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  </div>
);

export const Avatar = ({ name, size = 36 }) => (
  <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.38 }}>{initials(name)}</span>
);

export const Progress = ({ value, tone }) => (
  <div className="progress"><span className={tone && `tone-bg-${tone}`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></div>
);

export const Spinner = ({ size = 18 }) => <Loader2 size={size} className="spin" />;
export const PageLoader = () => <div className="center-screen"><Spinner size={28} /></div>;

export const Empty = ({ title = "Nothing here yet", hint, action, icon: Icon = Inbox }) => (
  <div className="empty">
    <Icon size={34} />
    <strong>{title}</strong>
    {hint && <p className="muted">{hint}</p>}
    {action}
  </div>
);

export const PageHeader = ({ title, subtitle, actions }) => (
  <div className="page-head">
    <div>
      <h1>{title}</h1>
      {subtitle && <p className="muted">{subtitle}</p>}
    </div>
    {actions && <div className="row gap-sm wrap">{actions}</div>}
  </div>
);

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.value} role="tab" aria-selected={value === t.value} className={cx("tab", value === t.value && "on")} onClick={() => onChange(t.value)}>
          {t.label}{t.count != null && <span className="tab-count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, size = "md" }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    ref.current?.querySelector("input,select,textarea,button.btn")?.focus();
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={cx("modal", `modal-${size}`)} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <header className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>,
    document.body
  );
}

/** Form field with label. `type` select needs `options:[{value,label}]`. */
export function Field({ label, hint, error, type = "text", options, value, onChange, span, children, ...rest }) {
  const id = useId();
  const common = { id, className: cx("input", error && "has-error"), value: value ?? "", ...rest };
  let control = children;
  if (!control) {
    if (type === "select") {
      control = (
        <select {...common} onChange={(e) => onChange?.(e.target.value)}>
          <option value="">Select…</option>
          {options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
    } else if (type === "textarea") {
      control = <textarea rows={3} {...common} onChange={(e) => onChange?.(e.target.value)} />;
    } else {
      control = (
        <input
          type={type}
          {...common}
          onChange={(e) => onChange?.(type === "number" && e.target.value !== "" ? Number(e.target.value) : e.target.value)}
        />
      );
    }
  }
  return (
    <div className={cx("field", span === 2 && "span-2")}>
      {label && <label htmlFor={id}>{label}{rest.required && <span className="req"> *</span>}</label>}
      {control}
      {hint && !error && <small className="muted">{hint}</small>}
      {error && <small className="err">{error}</small>}
    </div>
  );
}

export const SearchBox = ({ value, onChange, placeholder = "Search…" }) => (
  <input className="input search" type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
);

/* ---------- Toasts ---------- */
const ToastCtx = createContext(null);
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((tone, msg) => {
    const id = Math.random().toString(36).slice(2);
    setItems((l) => [...l, { id, tone, msg }]);
    setTimeout(() => setItems((l) => l.filter((x) => x.id !== id)), 4200);
  }, []);
  const api = useMemo(() => ({
    success: (m) => push("success", m),
    error: (m) => push("error", m?.message || m),
    info: (m) => push("info", m),
  }), [push]);
  const Icon = { success: CheckCircle2, error: AlertCircle, info: Info };
  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="toasts" aria-live="polite">
        {items.map((t) => {
          const I = Icon[t.tone];
          return <div key={t.id} className={cx("toast", `toast-${t.tone}`)}><I size={18} />{t.msg}</div>;
        })}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------- Confirm dialog ---------- */
const ConfirmCtx = createContext(null);
export const useConfirm = () => useContext(ConfirmCtx);

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  const confirm = useCallback((opts) => new Promise((resolve) => setState({ ...opts, resolve })), []);
  const close = (v) => { state?.resolve(v); setState(null); };
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <Modal
        open={Boolean(state)}
        onClose={() => close(false)}
        title={state?.title || "Are you sure?"}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => close(false)}>Cancel</Button>
            <Button variant={state?.danger === false ? "primary" : "danger"} onClick={() => close(true)}>{state?.confirmLabel || "Confirm"}</Button>
          </>
        }
      >
        <p>{state?.message}</p>
      </Modal>
    </ConfirmCtx.Provider>
  );
}
