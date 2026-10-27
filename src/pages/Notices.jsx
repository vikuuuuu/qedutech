// src/pages/Notices.jsx
import { useMemo, useState } from "react";
import { Megaphone, Pin, Plus, Trash2 } from "lucide-react";
import { ref, remove, set, update } from "firebase/database";
import { db } from "../lib/firebase";
import { useAuth } from "../lib/auth";
import { audit, newKey, useList, useLookup } from "../lib/db";
import { fmtDateTime } from "../lib/utils";
import { Badge, Button, Card, Empty, Field, Modal, PageHeader, useConfirm, useToast } from "../components/ui";

const AUDIENCE = [{ value: "all", label: "Everyone" }, { value: "students", label: "Students" }, { value: "teachers", label: "Teachers" }, { value: "class", label: "A specific class" }];

export default function Notices() {
  const { profile } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const canPost = profile.role !== "student";
  const { items, loading } = useList("notices", { limit: 100 });
  const classes = useLookup("classes");
  const [form, setForm] = useState(null);

  const visible = useMemo(() => items.filter((n) => {
    if (profile.role === "admin") return true;
    if (n.audience === "all") return true;
    if (n.audience === "students") return profile.role === "student";
    if (n.audience === "teachers") return profile.role === "teacher";
    if (n.audience === "class") return profile.role === "teacher" || n.classId === profile.classId;
    return true;
  }).sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.createdAt || 0) - (a.createdAt || 0)), [items, profile]);

  const save = async (e) => {
    e.preventDefault();
    const id = newKey("notices");
    try {
      await set(ref(db, `notices/${id}`), { ...form, classId: form.audience === "class" ? form.classId : "", authorId: profile.uid, authorName: profile.name, createdAt: Date.now() });
      audit(profile, "post_notice", form.title);
      setForm(null); toast.success("Notice published");
    } catch (err) { toast.error(err); }
  };
  const del = async (n) => { if (await confirm({ title: "Delete notice?", message: n.title })) remove(ref(db, `notices/${n.id}`)); };

  return (
    <>
      <PageHeader title="Notice board" subtitle="Announcements, circulars and reminders." actions={canPost && <Button icon={Plus} onClick={() => setForm({ title: "", body: "", audience: "all", classId: "", pinned: false })}>New notice</Button>} />
      <Card flush>
        {loading ? <Empty title="Loading…" /> : !visible.length ? <Empty icon={Megaphone} title="No notices" hint="You're all caught up." /> : visible.map((n) => (
          <article key={n.id} className={`notice ${n.pinned ? "pinned" : ""}`}>
            <div className="row between gap-sm">
              <h4>{n.pinned && <Pin size={15} />}{n.title}<Badge tone="indigo">{n.audience === "class" ? classes.label(n.classId) : AUDIENCE.find((a) => a.value === n.audience)?.label}</Badge></h4>
              {canPost && (profile.role === "admin" || n.authorId === profile.uid) && (
                <div className="row gap-xs">
                  <button className="icon-btn" title={n.pinned ? "Unpin" : "Pin"} onClick={() => update(ref(db, `notices/${n.id}`), { pinned: !n.pinned })}><Pin size={16} /></button>
                  <button className="icon-btn danger" title="Delete" onClick={() => del(n)}><Trash2 size={16} /></button>
                </div>
              )}
            </div>
            <p>{n.body}</p>
            <small className="muted">{n.authorName} · {fmtDateTime(n.createdAt)}</small>
          </article>
        ))}
      </Card>
      <Modal open={Boolean(form)} onClose={() => setForm(null)} title="New notice"
        footer={<><Button variant="ghost" onClick={() => setForm(null)}>Cancel</Button><Button type="submit" form="notice-form">Publish</Button></>}>
        {form && (
          <form id="notice-form" className="form-grid" onSubmit={save}>
            <Field span={2} label="Title" required value={form.title} onChange={(v) => setForm({ ...form, title: v })} />
            <Field span={2} label="Message" type="textarea" rows={5} required value={form.body} onChange={(v) => setForm({ ...form, body: v })} />
            <Field label="Audience" type="select" options={AUDIENCE} value={form.audience} onChange={(v) => setForm({ ...form, audience: v })} />
            {form.audience === "class" && <Field label="Class" type="select" required options={classes.options} value={form.classId} onChange={(v) => setForm({ ...form, classId: v })} />}
            <label className="row gap-sm span-2"><input type="checkbox" checked={form.pinned} onChange={(e) => setForm({ ...form, pinned: e.target.checked })} /> Pin to top</label>
          </form>
        )}
      </Modal>
    </>
  );
}
