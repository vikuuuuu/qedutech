// src/pages/Attendance.jsx
import { useEffect, useMemo, useState } from "react";
import { endAt, get, orderByKey, query, ref, startAt } from "firebase/database";
import { Check, Download, Save } from "lucide-react";
import { db } from "../lib/firebase";
import { audit, patch, useList, useLookup, useValue } from "../lib/db";
import { useAuth } from "../lib/auth";
import { download, pct, toCSV, todayKey } from "../lib/utils";
import { Avatar, Badge, Button, Card, Empty, Field, PageHeader, Progress, Spinner, Stat, Tabs, useToast } from "../components/ui";
import DataTable from "../components/DataTable";
import { CalendarCheck, CalendarX, Clock } from "lucide-react";

export default function Attendance() {
  const { profile } = useAuth();
  return profile.role === "student" ? <StudentView uid={profile.uid} /> : <StaffView />;
}

function StaffView() {
  const { profile } = useAuth();
  const toast = useToast();
  const classes = useLookup("classes");
  const { data: inst } = useValue("institute");
  const [tab, setTab] = useState("mark");
  const [classId, setClassId] = useState("");
  const [date, setDate] = useState(todayKey());
  const { items: students, loading } = useList("users", { orderBy: "classId", equal: classId || undefined, enabled: Boolean(classId), live: false });
  const [marks, setMarks] = useState({});
  const [original, setOriginal] = useState(null);
  const [saving, setSaving] = useState(false);
  const roster = useMemo(() => students.filter((s) => s.role === "student" && s.status !== "inactive").sort((a, b) => (a.rollNo || "").localeCompare(b.rollNo || "", undefined, { numeric: true })), [students]);

  useEffect(() => {
    if (!classId) return;
    setOriginal(null);
    get(ref(db, `attendance/${classId}/${date}`)).then((s) => { const v = s.val() || {}; setMarks(v); setOriginal(v); });
  }, [classId, date]);

  const setAll = (s) => setMarks(Object.fromEntries(roster.map((r) => [r.id, s])));
  const counts = useMemo(() => roster.reduce((a, r) => { const m = marks[r.id]; if (m) a[m]++; return a; }, { P: 0, A: 0, L: 0 }), [roster, marks]);

  const save = async () => {
    if (roster.some((r) => !marks[r.id])) return toast.error("Mark every student before saving.");
    setSaving(true);
    try {
      const u = { [`attendanceDaily/${date}/${classId}`]: { ...counts, total: roster.length } };
      roster.forEach((r) => { u[`attendance/${classId}/${date}/${r.id}`] = marks[r.id]; u[`attendanceByStudent/${r.id}/${date}`] = marks[r.id]; });
      await patch(u);
      audit(profile, "mark_attendance", `${classes.label(classId)} ${date}`);
      setOriginal({ ...marks });
      toast.success("Attendance saved");
    } catch (e) { toast.error(e); } finally { setSaving(false); }
  };

  return (
    <>
      <PageHeader title="Attendance" subtitle="Mark daily attendance and review monthly reports." />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: "mark", label: "Mark attendance" }, { value: "report", label: "Monthly report" }]} />
      <div className="filters">
        <Field label="Class" type="select" options={classes.options} value={classId} onChange={setClassId} />
        {tab === "mark"
          ? <Field label="Date" type="date" max={todayKey()} value={date} onChange={setDate} />
          : <Field label="Month" type="month" value={date.slice(0, 7)} onChange={(v) => v && setDate(`${v}-01`)} />}
      </div>
      {!classId ? <Card><Empty title="Select a class to begin" icon={CalendarCheck} /></Card>
        : tab === "mark" ? (
          <Card flush title={`${roster.length} students`} subtitle={original && Object.keys(original).length ? "Attendance already recorded — saving will update it." : undefined}
            actions={<>
              <Button size="sm" variant="secondary" icon={Check} onClick={() => setAll("P")}>All present</Button>
              <Button size="sm" icon={Save} loading={saving} onClick={save}>Save</Button>
            </>}>
            <DataTable loading={loading || original === null} rows={roster} pageSize={60} columns={[
              { key: "rollNo", label: "Roll no.", width: 110 },
              { key: "name", label: "Student", render: (r) => <div className="cell-user"><Avatar name={r.name} size={30} />{r.name}</div> },
              { key: "mark", label: "Status", sortable: false, render: (r) => (
                <div className="seg">
                  {[["P", "Present", "p"], ["A", "Absent", "a"], ["L", "Late", "l"]].map(([k, t, c]) => (
                    <button key={k} className={`${c} ${marks[r.id] === k ? "on" : ""}`} onClick={() => setMarks((m) => ({ ...m, [r.id]: k }))} aria-pressed={marks[r.id] === k}>{t}</button>
                  ))}
                </div>) },
            ]} toolbar={<span className="small muted">P {counts.P} · A {counts.A} · L {counts.L}</span>} />
          </Card>
        ) : <Report classId={classId} month={date.slice(0, 7)} roster={roster} threshold={inst?.attendanceThreshold ?? 75} className={classes.label(classId)} />}
    </>
  );
}

function Report({ classId, month, roster, threshold, className }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    setData(null);
    get(query(ref(db, `attendance/${classId}`), orderByKey(), startAt(`${month}-01`), endAt(`${month}-31`))).then((s) => setData(s.val() || {}));
  }, [classId, month]);
  const days = data ? Object.keys(data).length : 0;
  const rows = useMemo(() => roster.map((r) => {
    let p = 0, a = 0, l = 0;
    Object.values(data || {}).forEach((d) => { const m = d[r.id]; if (m === "P") p++; else if (m === "A") a++; else if (m === "L") l++; });
    return { id: r.id, rollNo: r.rollNo, name: r.name, p, a, l, percent: pct(p + l, days) };
  }), [roster, data, days]);
  const exportCsv = () => download(`attendance-${className}-${month}.csv`, toCSV(rows, [
    { label: "Roll no", key: "rollNo" }, { label: "Name", key: "name" }, { label: "Present", key: "p" }, { label: "Absent", key: "a" }, { label: "Late", key: "l" }, { label: "Attendance %", key: "percent" },
  ]));
  return (
    <Card flush title={`${days} working day(s) recorded`} actions={<Button size="sm" variant="secondary" icon={Download} onClick={exportCsv}>Export</Button>}>
      <DataTable loading={data === null} rows={rows} pageSize={60} columns={[
        { key: "rollNo", label: "Roll no." }, { key: "name", label: "Student" },
        { key: "p", label: "Present" }, { key: "a", label: "Absent" }, { key: "l", label: "Late" },
        { key: "percent", label: "Attendance", render: (r) => (
          <div className="row gap-sm"><Progress value={r.percent} tone={r.percent >= threshold ? "green" : "red"} /><span>{r.percent}%</span>{days > 0 && r.percent < threshold && <Badge tone="red">Low</Badge>}</div>) },
      ]} />
    </Card>
  );
}

function StudentView({ uid }) {
  const { data, loading } = useValue(`attendanceByStudent/${uid}`);
  const { data: inst } = useValue("institute");
  const entries = useMemo(() => Object.entries(data || {}).sort(([a], [b]) => a.localeCompare(b)), [data]);
  const c = entries.reduce((a, [, v]) => { a[v] = (a[v] || 0) + 1; return a; }, {});
  const percent = pct((c.P || 0) + (c.L || 0), entries.length);
  const threshold = inst?.attendanceThreshold ?? 75;
  if (loading) return <Spinner />;
  return (
    <>
      <PageHeader title="My attendance" subtitle={`Minimum required: ${threshold}%`} />
      <div className="grid stats">
        <Stat label="Overall" value={`${percent}%`} icon={CalendarCheck} tone={percent >= threshold ? "green" : "red"} hint={`${entries.length} days recorded`} />
        <Stat label="Present" value={c.P || 0} icon={CalendarCheck} tone="green" />
        <Stat label="Absent" value={c.A || 0} icon={CalendarX} tone="red" />
        <Stat label="Late" value={c.L || 0} icon={Clock} tone="amber" />
      </div>
      <Card title="Last 90 days" subtitle="Green present · Red absent · Amber late">
        {entries.length ? <div className="heat">{entries.slice(-90).map(([d, v]) => <i key={d} className={v} title={`${d}: ${v}`} />)}</div> : <Empty title="No attendance recorded yet" />}
      </Card>
    </>
  );
}
