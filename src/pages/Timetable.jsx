// src/pages/Timetable.jsx
import { useMemo, useState } from "react";
import { Plus, Trash2, CalendarClock } from "lucide-react";
import { useAuth } from "../lib/auth";
import { audit, newKey, patch, useList, useLookup } from "../lib/db";
import { DAYS } from "../lib/utils";
import { Button, Card, Empty, Field, Modal, PageHeader, Tabs, useToast } from "../components/ui";

const blank = { day: "Monday", start: "09:00", end: "10:00", subject: "", teacherId: "", room: "" };

export default function Timetable() {
  const { profile } = useAuth();
  const toast = useToast();
  const isAdmin = profile.role === "admin";
  const classes = useLookup("classes");
  const staff = useLookup("users", "name", { orderBy: "role", equal: "teacher", enabled: isAdmin });
  const [classId, setClassId] = useState(profile.role === "student" ? profile.classId || "" : "");
  const [tab, setTab] = useState(profile.role === "teacher" ? "mine" : "class");
  const [form, setForm] = useState(null);

  const classSlots = useList(classId ? `timetable/${classId}` : null);
  const mine = useList(profile.role === "teacher" ? `timetableByTeacher/${profile.uid}` : null);
  const slots = tab === "mine" ? mine.items : classSlots.items;
  const loading = tab === "mine" ? mine.loading : classSlots.loading;

  const byDay = useMemo(() => Object.fromEntries(DAYS.map((d) => [d, slots.filter((s) => s.day === d).sort((a, b) => a.start.localeCompare(b.start))])), [slots]);

  const save = async (e) => {
    e.preventDefault();
    if (form.end <= form.start) return toast.error("End time must be after start time.");
    const id = newKey(`timetable/${classId}`);
    const slot = { ...form, classId, className: classes.label(classId), teacherName: staff.label(form.teacherId) };
    const u = { [`timetable/${classId}/${id}`]: slot };
    if (form.teacherId) u[`timetableByTeacher/${form.teacherId}/${id}`] = slot;
    try { await patch(u); audit(profile, "add_timetable_slot", `${slot.className} ${form.day} ${form.start}`); setForm(null); toast.success("Slot added"); } catch (err) { toast.error(err); }
  };
  const remove = async (s) => {
    const u = { [`timetable/${s.classId || classId}/${s.id}`]: null };
    if (s.teacherId) u[`timetableByTeacher/${s.teacherId}/${s.id}`] = null;
    await patch(u);
  };

  const showGrid = tab === "mine" || classId;
  return (
    <>
      <PageHeader title="Timetable" subtitle="Weekly schedule by class." actions={isAdmin && tab === "class" && classId && <Button icon={Plus} onClick={() => setForm({ ...blank })}>Add slot</Button>} />
      {profile.role === "teacher" && <Tabs value={tab} onChange={setTab} tabs={[{ value: "mine", label: "My schedule" }, { value: "class", label: "By class" }]} />}
      {tab === "class" && profile.role !== "student" && (
        <div className="filters"><Field label="Class" type="select" options={classes.options} value={classId} onChange={setClassId} /></div>
      )}
      <Card>
        {!showGrid ? <Empty icon={CalendarClock} title="Select a class" />
          : loading ? <Empty title="Loading…" />
          : !slots.length ? <Empty icon={CalendarClock} title="No periods scheduled" hint={isAdmin ? "Use “Add slot” to build the timetable." : undefined} />
          : (
            <div className="tt">
              {DAYS.map((d) => (
                <div key={d} className="tt-col">
                  <h4>{d}</h4>
                  {byDay[d].length === 0 && <small className="muted">—</small>}
                  {byDay[d].map((s) => (
                    <div key={s.id} className="slot">
                      <strong>{s.subject}</strong>
                      <small>{s.start}–{s.end}{s.room ? ` · ${s.room}` : ""}</small>
                      <small>{tab === "mine" ? s.className : s.teacherName}</small>
                      {isAdmin && <button className="icon-btn danger" aria-label="Delete slot" onClick={() => remove(s)}><Trash2 size={14} /></button>}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
      </Card>
      <Modal open={Boolean(form)} onClose={() => setForm(null)} title="Add period"
        footer={<><Button variant="ghost" onClick={() => setForm(null)}>Cancel</Button><Button type="submit" form="slot-form">Add</Button></>}>
        {form && (
          <form id="slot-form" className="form-grid" onSubmit={save}>
            <Field label="Day" type="select" required options={DAYS.map((d) => ({ value: d, label: d }))} value={form.day} onChange={(v) => setForm({ ...form, day: v })} />
            <Field label="Subject" required value={form.subject} onChange={(v) => setForm({ ...form, subject: v })} />
            <Field label="Start" type="time" required value={form.start} onChange={(v) => setForm({ ...form, start: v })} />
            <Field label="End" type="time" required value={form.end} onChange={(v) => setForm({ ...form, end: v })} />
            <Field label="Teacher" type="select" options={staff.options} value={form.teacherId} onChange={(v) => setForm({ ...form, teacherId: v })} />
            <Field label="Room" value={form.room} onChange={(v) => setForm({ ...form, room: v })} />
          </form>
        )}
      </Modal>
    </>
  );
}
