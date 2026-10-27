// src/pages/Gradebook.jsx — results, manual marks and printable report cards
import { useEffect, useMemo, useState } from "react";
import { get, ref } from "firebase/database";
import { Award, FileText, Plus, Printer } from "lucide-react";
import { db } from "../lib/firebase";
import { useAuth } from "../lib/auth";
import { audit, newKey, patch, useList, useLookup, useValue } from "../lib/db";
import { fmtDate, gradeFor, pct } from "../lib/utils";
import { Badge, Button, Card, Empty, Field, Modal, PageHeader, Spinner, Stat, useToast } from "../components/ui";
import DataTable from "../components/DataTable";

export default function Gradebook() {
  const { profile } = useAuth();
  return profile.role === "student" ? <StudentResults /> : <StaffGradebook />;
}

function summarise(results, scale) {
  const byCourse = {};
  results.forEach((r) => { const k = r.courseName || r.title; (byCourse[k] ||= { score: 0, total: 0 }); byCourse[k].score += r.score; byCourse[k].total += r.total; });
  const courses = Object.entries(byCourse).map(([name, v]) => ({ name, ...v, percent: pct(v.score, v.total), grade: gradeFor(pct(v.score, v.total), scale) }));
  const score = courses.reduce((a, c) => a + c.score, 0), total = courses.reduce((a, c) => a + c.total, 0);
  const percent = pct(score, total);
  const gpa = courses.length ? Math.round((courses.reduce((a, c) => a + (c.grade.points ?? 0), 0) / courses.length) * 100) / 100 : 0;
  return { courses, score, total, percent, grade: gradeFor(percent, scale), gpa };
}

function ReportCard({ student, results, className, inst }) {
  const [att, setAtt] = useState(null);
  useEffect(() => {
    get(ref(db, `attendanceByStudent/${student.id}`)).then((s) => { const v = Object.values(s.val() || {}); setAtt(v.length ? pct(v.filter((x) => x !== "A").length, v.length) : null); }).catch(() => setAtt(null));
  }, [student.id]);
  const s = summarise(results, inst?.gradingScale);
  return (
    <div className="reportcard">
      <h2>{inst?.name || "Institute"}</h2>
      <p className="center small">{inst?.address}</p>
      <p className="center" style={{ fontWeight: 700, margin: "8px 0 16px" }}>PROGRESS REPORT {inst?.academicYear && `· ${inst.academicYear}`}</p>
      <dl className="kv" style={{ marginBottom: 16 }}>
        <dt>Student</dt><dd>{student.name}</dd><dt>Roll no.</dt><dd>{student.rollNo || "—"}</dd><dt>Class</dt><dd>{className}</dd>
        <dt>Attendance</dt><dd>{att == null ? "—" : `${att}%`}</dd>
      </dl>
      <table className="table">
        <thead><tr><th>Subject</th><th>Marks</th><th>%</th><th>Grade</th></tr></thead>
        <tbody>
          {s.courses.map((c) => <tr key={c.name}><td>{c.name}</td><td>{c.score}/{c.total}</td><td>{c.percent}</td><td>{c.grade.grade}</td></tr>)}
          <tr><td><strong>Overall</strong></td><td><strong>{s.score}/{s.total}</strong></td><td><strong>{s.percent}</strong></td><td><strong>{s.grade.grade}</strong></td></tr>
        </tbody>
      </table>
      <p style={{ marginTop: 12 }}>Grade point average: <strong>{s.gpa}</strong></p>
      <div className="row between" style={{ marginTop: 48 }}><span>Class teacher</span><span>Principal</span></div>
    </div>
  );
}

function StudentResults() {
  const { profile } = useAuth();
  const { items, loading } = useList(`results/${profile.uid}`);
  const { data: inst } = useValue("institute");
  const classes = useLookup("classes");
  const [card, setCard] = useState(false);
  const s = useMemo(() => summarise(items, inst?.gradingScale), [items, inst]);
  if (loading) return <Spinner />;
  return (
    <>
      <PageHeader title="My results" subtitle="Published exam and assessment results." actions={<Button icon={FileText} disabled={!items.length} onClick={() => setCard(true)}>Report card</Button>} />
      <div className="grid stats">
        <Stat label="Overall" value={`${s.percent}%`} icon={Award} tone="indigo" hint={`Grade ${s.grade.grade}`} />
        <Stat label="GPA" value={s.gpa} icon={Award} tone="green" />
        <Stat label="Assessments" value={items.length} icon={FileText} tone="blue" />
      </div>
      <Card flush><DataTable rows={items} pageSize={15} initialSort={{ key: "date", dir: "desc" }} columns={[
        { key: "title", label: "Assessment" }, { key: "courseName", label: "Subject" },
        { key: "score", label: "Score", render: (r) => `${r.score}/${r.total}` }, { key: "percent", label: "%" },
        { key: "grade", label: "Grade", render: (r) => <Badge tone={r.passed === false ? "red" : "green"}>{r.grade}</Badge> },
        { key: "date", label: "Date", render: (r) => fmtDate(r.date) },
      ]} /></Card>
      <Modal open={card} onClose={() => setCard(false)} size="lg" title="Report card" footer={<Button icon={Printer} onClick={() => window.print()}>Print</Button>}>
        <ReportCard student={{ id: profile.uid, ...profile }} results={items} className={classes.label(profile.classId)} inst={inst} />
      </Modal>
    </>
  );
}

function StaffGradebook() {
  const { profile } = useAuth();
  const toast = useToast();
  const classes = useLookup("classes");
  const courses = useLookup("courses");
  const { data: inst } = useValue("institute");
  const [classId, setClassId] = useState("");
  const { items: students, loading } = useList("users", { orderBy: "classId", equal: classId || undefined, enabled: Boolean(classId), live: false });
  const roster = useMemo(() => students.filter((s) => s.role === "student"), [students]);
  const [results, setResults] = useState({});
  const [card, setCard] = useState(null);
  const [entry, setEntry] = useState(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!roster.length) { setResults({}); return; }
    Promise.all(roster.map((s) => get(ref(db, `results/${s.id}`)).then((r) => [s.id, Object.entries(r.val() || {}).map(([id, v]) => ({ id, ...v }))]))).then((e) => setResults(Object.fromEntries(e)));
  }, [roster, tick]);

  const rows = roster.map((s) => ({ ...s, ...summarise(results[s.id] || [], inst?.gradingScale), count: (results[s.id] || []).length }));

  const addMarks = async (e) => {
    e.preventDefault();
    const id = newKey(`results/${entry.studentId}`);
    const percent = pct(Number(entry.score), Number(entry.total));
    await patch({ [`results/${entry.studentId}/${id}`]: { title: entry.title, courseName: entry.courseName, courseId: "", classId, score: Number(entry.score), total: Number(entry.total), percent, grade: gradeFor(percent, inst?.gradingScale).grade, passed: percent >= 40, source: "manual", date: Date.now(), enteredBy: profile.uid } });
    audit(profile, "add_marks", `${entry.title} → ${roster.find((s) => s.id === entry.studentId)?.name}`);
    toast.success("Marks recorded"); setEntry(null); setTick((t) => t + 1);
  };

  return (
    <>
      <PageHeader title="Gradebook" subtitle="Class-wise performance, manual marks and report cards." actions={classId && <Button icon={Plus} onClick={() => setEntry({ studentId: "", title: "", courseName: "", score: "", total: 100 })}>Add marks</Button>} />
      <div className="filters"><Field label="Class" type="select" options={classes.options} value={classId} onChange={setClassId} /></div>
      {!classId ? <Card><Empty icon={Award} title="Select a class" /></Card> : (
        <Card flush><DataTable loading={loading} rows={rows} searchKeys={["name", "rollNo"]} columns={[
          { key: "rollNo", label: "Roll no." }, { key: "name", label: "Student" }, { key: "count", label: "Assessments" },
          { key: "percent", label: "Overall %", render: (r) => (r.count ? `${r.percent}%` : "—") },
          { key: "grade", label: "Grade", render: (r) => (r.count ? <Badge tone={r.percent >= 40 ? "green" : "red"}>{r.grade.grade}</Badge> : "—") },
          { key: "_a", label: "", sortable: false, align: "right", render: (r) => <Button size="sm" variant="secondary" icon={FileText} disabled={!r.count} onClick={() => setCard(r)}>Report card</Button> },
        ]} /></Card>
      )}
      <Modal open={Boolean(card)} onClose={() => setCard(null)} size="lg" title="Report card" footer={<Button icon={Printer} onClick={() => window.print()}>Print</Button>}>
        {card && <ReportCard student={card} results={results[card.id] || []} className={classes.label(classId)} inst={inst} />}
      </Modal>
      <Modal open={Boolean(entry)} onClose={() => setEntry(null)} title="Add marks (assignment / internal / practical)" footer={<><Button variant="ghost" onClick={() => setEntry(null)}>Cancel</Button><Button type="submit" form="marks-form">Save</Button></>}>
        {entry && (
          <form id="marks-form" className="form-grid" onSubmit={addMarks}>
            <Field span={2} label="Student" type="select" required options={roster.map((s) => ({ value: s.id, label: `${s.rollNo || ""} ${s.name}` }))} value={entry.studentId} onChange={(v) => setEntry({ ...entry, studentId: v })} />
            <Field label="Assessment title" required placeholder="Internal test 1" value={entry.title} onChange={(v) => setEntry({ ...entry, title: v })} />
            <Field label="Subject" required type="select" options={courses.items.map((c) => ({ value: c.name, label: c.name }))} value={entry.courseName} onChange={(v) => setEntry({ ...entry, courseName: v })} />
            <Field label="Score" type="number" min={0} required value={entry.score} onChange={(v) => setEntry({ ...entry, score: v })} />
            <Field label="Out of" type="number" min={1} required value={entry.total} onChange={(v) => setEntry({ ...entry, total: v })} />
          </form>
        )}
      </Modal>
    </>
  );
}
