// src/pages/Settings.jsx
import { useEffect, useState } from "react";
import { ref, update } from "firebase/database";
import { Plus, Trash2 } from "lucide-react";
import { db } from "../lib/firebase";
import { useAuth } from "../lib/auth";
import { audit, useValue } from "../lib/db";
import { DEFAULT_SCALE } from "../lib/utils";
import { Button, Card, Field, PageHeader, useToast } from "../components/ui";

export default function Settings() {
  const { profile, changePassword } = useAuth();
  const toast = useToast();
  const [me, setMe] = useState({ name: profile.name || "", phone: profile.phone || "" });
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [busy, setBusy] = useState("");

  const saveMe = async (e) => {
    e.preventDefault(); setBusy("me");
    try { await update(ref(db, `users/${profile.uid}`), me); toast.success("Profile updated"); } catch (err) { toast.error(err); } finally { setBusy(""); }
  };
  const savePw = async (e) => {
    e.preventDefault();
    if (pw.next !== pw.confirm) return toast.error("New passwords do not match.");
    setBusy("pw");
    try { await changePassword(pw.current, pw.next); setPw({ current: "", next: "", confirm: "" }); toast.success("Password changed"); }
    catch (err) { toast.error(err.code?.includes("invalid-credential") || err.code?.includes("wrong-password") ? "Current password is incorrect." : err.message); } finally { setBusy(""); }
  };

  return (
    <>
      <PageHeader title="Settings" subtitle={profile.email} />
      <div className="grid two">
        <Card title="Profile">
          <form className="grid" onSubmit={saveMe}>
            <Field label="Full name" required value={me.name} onChange={(v) => setMe({ ...me, name: v })} />
            <Field label="Phone" type="tel" value={me.phone} onChange={(v) => setMe({ ...me, phone: v })} />
            <div><Button type="submit" loading={busy === "me"}>Save profile</Button></div>
          </form>
        </Card>
        <Card title="Change password">
          <form className="grid" onSubmit={savePw}>
            <Field label="Current password" type="password" required autoComplete="current-password" value={pw.current} onChange={(v) => setPw({ ...pw, current: v })} />
            <Field label="New password" type="password" required minLength={6} autoComplete="new-password" value={pw.next} onChange={(v) => setPw({ ...pw, next: v })} />
            <Field label="Confirm new password" type="password" required autoComplete="new-password" value={pw.confirm} onChange={(v) => setPw({ ...pw, confirm: v })} />
            <div><Button type="submit" loading={busy === "pw"}>Update password</Button></div>
          </form>
        </Card>
      </div>
      {profile.role === "admin" && <InstituteForm />}
    </>
  );
}

function InstituteForm() {
  const { profile } = useAuth();
  const toast = useToast();
  const { data, loading } = useValue("institute");
  const [f, setF] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!loading && !f) setF({ name: "", type: "college", address: "", phone: "", email: "", academicYear: "", currency: "₹", attendanceThreshold: 75, ...(data || {}), gradingScale: data?.gradingScale || DEFAULT_SCALE });
  }, [loading, data, f]);
  if (!f) return null;
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const setRow = (i, k, v) => setF((s) => ({ ...s, gradingScale: s.gradingScale.map((r, j) => (j === i ? { ...r, [k]: v } : r)) }));

  const save = async (e) => {
    e.preventDefault(); setSaving(true);
    try { await update(ref(db, "institute"), { ...f, gradingScale: [...f.gradingScale].sort((a, b) => b.min - a.min) }); audit(profile, "update_institute", f.name); toast.success("Institute settings saved"); }
    catch (err) { toast.error(err); } finally { setSaving(false); }
  };

  return (
    <form onSubmit={save}>
      <Card title="Institute profile" subtitle="Appears on report cards, receipts and the sidebar.">
        <div className="form-grid">
          <Field label="Institute name" required value={f.name} onChange={set("name")} />
          <Field label="Type" type="select" options={[{ value: "school", label: "School" }, { value: "college", label: "College" }, { value: "university", label: "University" }]} value={f.type} onChange={set("type")} />
          <Field span={2} label="Address" value={f.address} onChange={set("address")} />
          <Field label="Phone" value={f.phone} onChange={set("phone")} />
          <Field label="Email" type="email" value={f.email} onChange={set("email")} />
          <Field label="Academic year" placeholder="2026-27" value={f.academicYear} onChange={set("academicYear")} />
          <Field label="Currency symbol" value={f.currency} onChange={set("currency")} />
          <Field label="Minimum attendance %" type="number" min={0} max={100} value={f.attendanceThreshold} onChange={set("attendanceThreshold")} />
        </div>
      </Card>
      <Card title="Grading scale" subtitle="Used for results and report cards."
        actions={<Button type="button" size="sm" variant="secondary" icon={Plus} onClick={() => setF((s) => ({ ...s, gradingScale: [...s.gradingScale, { min: 0, grade: "", points: 0 }] }))}>Add band</Button>}>
        <div className="grid">
          {f.gradingScale.map((r, i) => (
            <div key={i} className="row gap-sm">
              <Field label={i === 0 ? "Min %" : undefined} type="number" min={0} max={100} value={r.min} onChange={(v) => setRow(i, "min", v)} />
              <Field label={i === 0 ? "Grade" : undefined} value={r.grade} onChange={(v) => setRow(i, "grade", v)} />
              <Field label={i === 0 ? "Points" : undefined} type="number" min={0} value={r.points} onChange={(v) => setRow(i, "points", v)} />
              <button type="button" className="icon-btn danger" aria-label="Remove band" style={{ marginTop: i === 0 ? 22 : 0 }} onClick={() => setF((s) => ({ ...s, gradingScale: s.gradingScale.filter((_, j) => j !== i) }))}><Trash2 size={16} /></button>
            </div>
          ))}
        </div>
      </Card>
      <Button type="submit" loading={saving}>Save institute settings</Button>
    </form>
  );
}
