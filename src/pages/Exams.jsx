// src/pages/Exams.jsx — exam management (staff) and exam taking (students)
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { get, ref, remove, set, update } from "firebase/database";
import { ArrowLeft, Check, Clock, Eye, FileQuestion, Flag, Pencil, Plus, Rocket, Trash2, Upload, ClipboardList } from "lucide-react";
import { db } from "../lib/firebase";
import { useAuth } from "../lib/auth";
import { audit, bump, newKey, patch, ts, useList, useLookup, useServerOffset, useValue } from "../lib/db";
import { cx, debounce, fmtDateTime, fromLocalInput, parseCSV, toLocalInput } from "../lib/utils";
import { Badge, Button, Card, Empty, Field, Modal, PageHeader, Spinner, Tabs, useConfirm, useToast } from "../components/ui";
import DataTable from "../components/DataTable";

export default function Exams() {
  const { profile } = useAuth();
  const { id } = useParams();
  if (profile.role === "student") return id ? <ExamTake id={id} /> : <StudentExams />;
  return id ? <ExamEditor id={id} /> : <StaffExams />;
}

/* ───────────── Staff: list ───────────── */
function StaffExams() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const isAdmin = profile.role === "admin";
  const { items, loading } = useList("papers", isAdmin ? { limit: 300 } : { orderBy: "createdBy", equal: profile.uid });
  const classes = useLookup("classes");
  const courses = useLookup("courses");
  const [form, setForm] = useState(null);

  const create = async (e) => {
    e.preventDefault();
    const startAt = fromLocalInput(form.startAt), endAt = fromLocalInput(form.endAt);
    if (endAt <= startAt) return toast.error("The window must close after it opens.");
    const id = newKey("papers");
    await set(ref(db, `papers/${id}`), {
      title: form.title, code: form.code, classId: form.classId, courseId: form.courseId || "", duration: Number(form.duration),
      startAt, endAt, passPercent: Number(form.passPercent), status: "draft", questionCount: 0, totalMarks: 0,
      createdBy: profile.uid, createdByName: profile.name, createdAt: Date.now(),
    });
    bump("papers", 1);
    audit(profile, "create_exam", form.title);
    navigate(`/exams/${id}`);
  };

  const del = async (p) => {
    if (!(await confirm({ title: "Delete exam?", message: `"${p.title}" and its questions will be removed. Student attempts are kept for records.` }))) return;
    await patch({ [`papers/${p.id}`]: null, [`paperQuestions/${p.id}`]: null, [`paperKeys/${p.id}`]: null });
    bump("papers", -1);
    audit(profile, "delete_exam", p.title);
  };

  const now = Date.now();
  const state = (p) => p.status !== "published" ? ["draft", "neutral"] : now < p.startAt ? ["scheduled", "blue"] : now <= p.endAt ? ["live", "green"] : ["closed", "amber"];
  const columns = [
    { key: "title", label: "Exam", render: (p) => <div><strong>{p.title}</strong><div className="muted small">{p.code}</div></div> },
    { key: "classId", label: "Class", sortValue: (p) => classes.label(p.classId), render: (p) => classes.label(p.classId) },
    { key: "startAt", label: "Window", render: (p) => <span className="small">{fmtDateTime(p.startAt)} → {fmtDateTime(p.endAt)}</span> },
    { key: "questionCount", label: "Questions", render: (p) => `${p.questionCount || 0} · ${p.totalMarks || 0} marks` },
    { key: "status", label: "State", sortValue: (p) => state(p)[0], render: (p) => <Badge tone={state(p)[1]}>{state(p)[0]}</Badge> },
    { key: "_a", label: "", sortable: false, align: "right", render: (p) => (
      <div className="row gap-xs end">
        <Link className="icon-btn" to={`/exams/${p.id}`} title="Edit"><Pencil size={16} /></Link>
        <Link className="icon-btn" to={`/grading/${p.id}`} title="Grade & results"><ClipboardList size={16} /></Link>
        <button className="icon-btn danger" onClick={() => del(p)} title="Delete"><Trash2 size={16} /></button>
      </div>) },
  ];

  return (
    <>
      <PageHeader title="Exams" subtitle={isAdmin ? "All examinations across the institute." : "Papers you have created."}
        actions={<Button icon={Plus} onClick={() => setForm({ title: "", code: "", classId: "", courseId: "", duration: 30, startAt: toLocalInput(Date.now() + 3600e3), endAt: toLocalInput(Date.now() + 86400e3), passPercent: 40 })}>New exam</Button>} />
      <Card flush><DataTable columns={columns} rows={items} loading={loading} searchKeys={["title", "code"]} initialSort={{ key: "startAt", dir: "desc" }} /></Card>
      <Modal open={Boolean(form)} onClose={() => setForm(null)} title="Create exam"
        footer={<><Button variant="ghost" onClick={() => setForm(null)}>Cancel</Button><Button type="submit" form="exam-form">Create &amp; add questions</Button></>}>
        {form && (
          <form id="exam-form" className="form-grid" onSubmit={create}>
            <Field span={2} label="Exam title" required value={form.title} onChange={(v) => setForm({ ...form, title: v })} />
            <Field label="Paper code" required value={form.code} onChange={(v) => setForm({ ...form, code: v })} />
            <Field label="Course" type="select" options={courses.options} value={form.courseId} onChange={(v) => setForm({ ...form, courseId: v })} />
            <Field label="Class" type="select" required options={classes.options} value={form.classId} onChange={(v) => setForm({ ...form, classId: v })} />
            <Field label="Duration (minutes)" type="number" min={1} required value={form.duration} onChange={(v) => setForm({ ...form, duration: v })} />
            <Field label="Opens at" type="datetime-local" required value={form.startAt} onChange={(v) => setForm({ ...form, startAt: v })} />
            <Field label="Closes at" type="datetime-local" required value={form.endAt} onChange={(v) => setForm({ ...form, endAt: v })} />
            <Field label="Pass percentage" type="number" min={0} max={100} value={form.passPercent} onChange={(v) => setForm({ ...form, passPercent: v })} />
          </form>
        )}
      </Modal>
    </>
  );
}

/* ───────────── Staff: editor ───────────── */
const blankQ = { type: "mcq", text: "", A: "", B: "", C: "", D: "", correct: "A", marks: 1, model: "" };

function ExamEditor({ id }) {
  const { profile } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const fileRef = useRef(null);
  const { data: paper, loading } = useValue(`papers/${id}`);
  const { items: qs } = useList(`paperQuestions/${id}`);
  const { data: keys } = useValue(`paperKeys/${id}`);
  const [q, setQ] = useState(null);
  const questions = useMemo(() => [...qs].sort((a, b) => (a.order || 0) - (b.order || 0)), [qs]);

  if (loading) return <Spinner />;
  if (!paper) return <Empty title="Exam not found" action={<Link to="/exams">Back to exams</Link>} />;
  const locked = paper.createdBy !== profile.uid && profile.role !== "admin";

  const totals = (list) => ({ questionCount: list.length, totalMarks: list.reduce((a, x) => a + Number(x.marks || 0), 0) });

  const saveQuestion = async (e) => {
    e.preventDefault();
    if (q.type === "mcq" && ![q.A, q.B, q.C, q.D].every((o) => o.trim())) return toast.error("Fill in all four options.");
    const qid = q.id || newKey(`paperQuestions/${id}`);
    const pub = { type: q.type, text: q.text, marks: Number(q.marks), order: q.order || Date.now() };
    if (q.type === "mcq") pub.options = { A: q.A, B: q.B, C: q.C, D: q.D };
    const next = q.id ? questions.map((x) => (x.id === qid ? { ...x, ...pub } : x)) : [...questions, { id: qid, ...pub }];
    await patch({
      [`paperQuestions/${id}/${qid}`]: pub,
      [`paperKeys/${id}/${qid}`]: q.type === "mcq" ? { correct: q.correct } : { model: q.model || "" },
      [`papers/${id}/questionCount`]: totals(next).questionCount,
      [`papers/${id}/totalMarks`]: totals(next).totalMarks,
    });
    setQ(null);
  };

  const delQuestion = async (x) => {
    const next = questions.filter((y) => y.id !== x.id);
    await patch({ [`paperQuestions/${id}/${x.id}`]: null, [`paperKeys/${id}/${x.id}`]: null, [`papers/${id}/questionCount`]: next.length, [`papers/${id}/totalMarks`]: totals(next).totalMarks });
  };

  const importCsv = async (file) => {
    if (!file) return;
    const rows = parseCSV(await file.text()).filter((r) => r.text);
    if (!rows.length) return toast.error("No questions found. Use columns: type,text,A,B,C,D,correct,marks,model");
    const u = {}; const added = [];
    rows.forEach((r, i) => {
      const qid = newKey(`paperQuestions/${id}`);
      const type = (r.type || "mcq").toLowerCase() === "short" ? "short" : "mcq";
      const pub = { type, text: r.text, marks: Number(r.marks) || 1, order: Date.now() + i };
      if (type === "mcq") pub.options = { A: r.A || "", B: r.B || "", C: r.C || "", D: r.D || "" };
      u[`paperQuestions/${id}/${qid}`] = pub;
      u[`paperKeys/${id}/${qid}`] = type === "mcq" ? { correct: (r.correct || "A").toUpperCase() } : { model: r.model || "" };
      added.push(pub);
    });
    const all = [...questions, ...added];
    u[`papers/${id}/questionCount`] = all.length; u[`papers/${id}/totalMarks`] = totals(all).totalMarks;
    await patch(u);
    toast.success(`${rows.length} questions imported`);
    fileRef.current.value = "";
  };

  const setStatus = async (status) => {
    if (status === "published") {
      if (!questions.length) return toast.error("Add at least one question first.");
      if (!(await confirm({ title: "Publish exam?", message: "Students in the class will see it and can start during the exam window. Questions are locked once students begin.", confirmLabel: "Publish", danger: false }))) return;
    }
    await update(ref(db, `papers/${id}`), { status });
    audit(profile, `${status}_exam`, paper.title);
  };

  const field = (k, v) => update(ref(db, `papers/${id}`), { [k]: v });
  const demoCsv = "type,text,A,B,C,D,correct,marks,model\nmcq,Capital of India?,Mumbai,New Delhi,Kolkata,Chennai,B,1,\nshort,Define photosynthesis,,,,,,3,Process by which plants make food using light\n";

  return (
    <>
      <PageHeader title={paper.title} subtitle={`${paper.code} · ${paper.duration} min · ${paper.questionCount || 0} questions · ${paper.totalMarks || 0} marks`}
        actions={<>
          <Link className="btn btn-ghost" to="/exams"><ArrowLeft size={16} />Back</Link>
          <Link className="btn btn-secondary" to={`/grading/${id}`}><ClipboardList size={16} />Results</Link>
          {paper.status === "published" ? <Button variant="secondary" onClick={() => setStatus("draft")} disabled={locked}>Unpublish</Button>
            : <Button icon={Rocket} onClick={() => setStatus("published")} disabled={locked}>Publish</Button>}
        </>} />
      <div className="grid two">
        <Card title="Schedule">
          <div className="form-grid">
            <Field label="Opens" type="datetime-local" disabled={locked} value={toLocalInput(paper.startAt)} onChange={(v) => field("startAt", fromLocalInput(v))} />
            <Field label="Closes" type="datetime-local" disabled={locked} value={toLocalInput(paper.endAt)} onChange={(v) => field("endAt", fromLocalInput(v))} />
            <Field label="Duration (min)" type="number" disabled={locked} value={paper.duration} onChange={(v) => field("duration", Number(v) || 1)} />
            <Field label="Pass %" type="number" disabled={locked} value={paper.passPercent} onChange={(v) => field("passPercent", Number(v) || 0)} />
          </div>
        </Card>
        <Card title="Add questions" subtitle="One by one or in bulk from CSV.">
          <div className="row gap-sm wrap">
            <Button icon={Plus} disabled={locked} onClick={() => setQ({ ...blankQ })}>New question</Button>
            <input ref={fileRef} type="file" accept=".csv" hidden onChange={(e) => importCsv(e.target.files[0])} />
            <Button variant="secondary" icon={Upload} disabled={locked} onClick={() => fileRef.current.click()}>Import CSV</Button>
            <Button variant="ghost" onClick={() => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([demoCsv])); a.download = "questions-template.csv"; a.click(); }}>Template</Button>
          </div>
        </Card>
      </div>
      <Card title={`Questions (${questions.length})`}>
        {!questions.length ? <Empty icon={FileQuestion} title="No questions yet" /> : questions.map((x, i) => (
          <div key={x.id} className="q-card">
            <div className="row between gap-sm">
              <strong>Q{i + 1}. {x.text}</strong>
              <div className="row gap-xs"><Badge tone="indigo">{x.type === "mcq" ? "MCQ" : "Short"}</Badge><Badge>{x.marks} mark{x.marks > 1 ? "s" : ""}</Badge>
                {!locked && <><button className="icon-btn" onClick={() => setQ({ ...blankQ, id: x.id, type: x.type, text: x.text, marks: x.marks, order: x.order, ...(x.options || {}), correct: keys?.[x.id]?.correct || "A", model: keys?.[x.id]?.model || "" })}><Pencil size={16} /></button>
                  <button className="icon-btn danger" onClick={() => delQuestion(x)}><Trash2 size={16} /></button></>}
              </div>
            </div>
            {x.type === "mcq" && <div className="small muted" style={{ marginTop: 6 }}>{Object.entries(x.options || {}).map(([k, v]) => <span key={k} style={{ marginRight: 14, fontWeight: keys?.[x.id]?.correct === k ? 700 : 400, color: keys?.[x.id]?.correct === k ? "var(--green)" : undefined }}>{k}. {v}{keys?.[x.id]?.correct === k && " ✓"}</span>)}</div>}
          </div>
        ))}
      </Card>
      <Modal open={Boolean(q)} onClose={() => setQ(null)} title={q?.id ? "Edit question" : "New question"} size="md"
        footer={<><Button variant="ghost" onClick={() => setQ(null)}>Cancel</Button><Button type="submit" form="q-form">Save</Button></>}>
        {q && (
          <form id="q-form" className="form-grid" onSubmit={saveQuestion}>
            <Field label="Type" type="select" options={[{ value: "mcq", label: "Multiple choice" }, { value: "short", label: "Short answer (manual grading)" }]} value={q.type} onChange={(v) => setQ({ ...q, type: v })} />
            <Field label="Marks" type="number" min={1} required value={q.marks} onChange={(v) => setQ({ ...q, marks: v })} />
            <Field span={2} label="Question" type="textarea" required value={q.text} onChange={(v) => setQ({ ...q, text: v })} />
            {q.type === "mcq" ? <>
              {["A", "B", "C", "D"].map((k) => <Field key={k} label={`Option ${k}`} required value={q[k]} onChange={(v) => setQ({ ...q, [k]: v })} />)}
              <Field span={2} label="Correct option" type="select" options={["A", "B", "C", "D"].map((k) => ({ value: k, label: `Option ${k}` }))} value={q.correct} onChange={(v) => setQ({ ...q, correct: v })} />
            </> : <Field span={2} label="Model answer (for grader only)" type="textarea" value={q.model} onChange={(v) => setQ({ ...q, model: v })} />}
          </form>
        )}
      </Modal>
    </>
  );
}

/* ───────────── Student: list ───────────── */
function StudentExams() {
  const { profile } = useAuth();
  const { items: papers, loading } = useList("papers", { orderBy: "classId", equal: profile.classId || "none", enabled: Boolean(profile.classId) });
  const { items: results } = useList(`results/${profile.uid}`);
  const [attempts, setAttempts] = useState({});
  const [tab, setTab] = useState("open");
  const published = useMemo(() => papers.filter((p) => p.status === "published"), [papers]);

  useEffect(() => {
    Promise.all(published.map((p) => get(ref(db, `attempts/${p.id}/${profile.uid}`)).then((s) => [p.id, s.val()]))).then((e) => setAttempts(Object.fromEntries(e)));
  }, [published, profile.uid]);

  const now = Date.now();
  const rm = Object.fromEntries(results.map((r) => [r.paperId || r.id, r]));
  const status = (p) => {
    const a = attempts[p.id];
    if (a?.status === "submitted") return "done";
    if (a?.status === "in_progress" && now < a.startedAt + p.duration * 60000) return "resume";
    if (a) return "done";
    return now < p.startAt ? "soon" : now <= p.endAt ? "live" : "missed";
  };
  const groups = { open: published.filter((p) => ["live", "resume", "soon"].includes(status(p))), done: published.filter((p) => status(p) === "done"), missed: published.filter((p) => status(p) === "missed") };

  if (!profile.classId) return <><PageHeader title="Exams" /><Card><Empty title="You are not assigned to a class yet" hint="Ask the office to enrol you in a class." /></Card></>;
  return (
    <>
      <PageHeader title="My exams" subtitle="Timed online assessments for your class." />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: "open", label: "Upcoming & live", count: groups.open.length }, { value: "done", label: "Attempted", count: groups.done.length }, { value: "missed", label: "Missed", count: groups.missed.length }]} />
      {loading ? <Spinner /> : !groups[tab].length ? <Card><Empty icon={FileQuestion} title="Nothing here" /></Card> : (
        <div className="grid two">
          {groups[tab].map((p) => {
            const s = status(p), r = rm[p.id];
            return (
              <Card key={p.id} title={p.title} subtitle={p.code}>
                <div className="grid" style={{ gap: 8 }}>
                  <div className="row gap-sm small muted"><Clock size={15} />{p.duration} min · {p.questionCount} questions · {p.totalMarks} marks</div>
                  <div className="small muted">Window: {fmtDateTime(p.startAt)} → {fmtDateTime(p.endAt)}</div>
                  {s === "live" && <Link className="btn btn-primary" to={`/exams/${p.id}`}>Start exam</Link>}
                  {s === "resume" && <Link className="btn btn-primary" to={`/exams/${p.id}`}>Resume exam</Link>}
                  {s === "soon" && <Badge tone="blue">Opens {fmtDateTime(p.startAt)}</Badge>}
                  {s === "done" && (r ? <Badge tone="green">Result: {r.score}/{r.total} · {r.grade}</Badge> : <Badge tone="amber">Submitted · awaiting results</Badge>)}
                  {s === "missed" && <Badge tone="red">Window closed</Badge>}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

/* ───────────── Student: take exam ───────────── */
function ExamTake({ id }) {
  const { profile } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const offset = useServerOffset();
  const { data: paper, loading } = useValue(`papers/${id}`);
  const { data: attempt, loading: aLoading } = useValue(`attempts/${id}/${profile.uid}`);
  const inProgress = attempt?.status === "in_progress";
  const { items: qs } = useList(`paperQuestions/${id}`, { enabled: inProgress });
  const questions = useMemo(() => [...qs].sort((a, b) => (a.order || 0) - (b.order || 0)), [qs]);
  const [answers, setAnswers] = useState({});
  const [flags, setFlags] = useState({});
  const [cur, setCur] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [starting, setStarting] = useState(false);
  const submitting = useRef(false);
  const seeded = useRef(false);

  useEffect(() => { if (attempt?.answers && !seeded.current) { setAnswers(attempt.answers); seeded.current = true; } }, [attempt]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now() + offset), 1000); return () => clearInterval(t); }, [offset]);

  const save = useMemo(() => debounce((qid, v) => set(ref(db, `attempts/${id}/${profile.uid}/answers/${qid}`), v).catch(() => {}), 600), [id, profile.uid]);
  useEffect(() => () => save.cancel(), [save]);
  const answer = (qid, v) => { setAnswers((a) => ({ ...a, [qid]: v })); save(qid, v); };

  const submit = useCallback(async (auto = false) => {
    if (submitting.current) return;
    submitting.current = true;
    save.cancel();
    try {
      const u = {};
      Object.entries(answersRef.current).forEach(([qid, v]) => { u[`attempts/${id}/${profile.uid}/answers/${qid}`] = v; });
      u[`attempts/${id}/${profile.uid}/status`] = "submitted";
      u[`attempts/${id}/${profile.uid}/submittedAt`] = ts();
      await patch(u);
      toast[auto ? "info" : "success"](auto ? "Time is up — your answers were submitted." : "Exam submitted.");
      navigate("/exams");
    } catch (e) { submitting.current = false; toast.error("Submit failed — check your connection and retry."); }
  }, [id, profile.uid, navigate, toast, save]);
  const answersRef = useRef({}); answersRef.current = answers;

  const deadline = attempt?.startedAt ? attempt.startedAt + (paper?.duration || 0) * 60000 : 0;
  const left = Math.max(0, deadline - now);
  useEffect(() => { if (inProgress && deadline && left === 0) submit(true); }, [inProgress, deadline, left, submit]);

  // Integrity: count tab/window switches during the attempt
  useEffect(() => {
    if (!inProgress) return undefined;
    let n = attempt?.tabSwitches || 0;
    const onHide = () => { if (document.hidden) { n += 1; set(ref(db, `attempts/${id}/${profile.uid}/tabSwitches`), n).catch(() => {}); } };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [inProgress, id, profile.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = async () => {
    setStarting(true);
    try {
      await patch({
        [`attempts/${id}/${profile.uid}/startedAt`]: ts(),
        [`attempts/${id}/${profile.uid}/status`]: "in_progress",
        [`attempts/${id}/${profile.uid}/studentName`]: profile.name,
      });
    } catch (e) { toast.error("Cannot start: the exam may be closed or not assigned to your class."); } finally { setStarting(false); }
  };

  if (loading || aLoading) return <Spinner />;
  if (!paper || paper.status !== "published") return <Empty title="Exam unavailable" action={<Link to="/exams">Back to exams</Link>} />;

  if (attempt?.status === "submitted" || (attempt && !inProgress)) return <Card><Empty icon={Check} title="You have already submitted this exam" hint="Results appear under Results once your teacher publishes them." action={<Link className="btn btn-primary" to="/exams">Back to exams</Link>} /></Card>;

  if (!attempt) {
    const open = Date.now() >= paper.startAt && Date.now() <= paper.endAt;
    return (
      <Card title={paper.title} subtitle={paper.code}>
        <ul className="muted" style={{ margin: "0 0 18px 18px", display: "grid", gap: 6 }}>
          <li>{paper.questionCount} questions · {paper.totalMarks} marks · {paper.duration} minutes.</li>
          <li>The timer starts when you press Start and cannot be paused. Answers are saved automatically.</li>
          <li>Switching tabs or windows is recorded and visible to your teacher.</li>
          <li>The exam submits itself when time runs out.</li>
        </ul>
        <div className="row gap-sm"><Button loading={starting} disabled={!open} icon={Rocket} onClick={start}>Start exam</Button><Link className="btn btn-ghost" to="/exams">Cancel</Link></div>
        {!open && <p className="err" style={{ marginTop: 10 }}>This exam is not open right now.</p>}
      </Card>
    );
  }

  if (!questions.length) return <Spinner />;
  const q = questions[Math.min(cur, questions.length - 1)];
  const mins = Math.floor(left / 60000), secs = Math.floor((left % 60000) / 1000);
  const answered = questions.filter((x) => (answers[x.id] ?? "") !== "").length;

  return (
    <div className="exam">
      <Card className="no-print">
        <div className={cx("timer", left < 300000 && "low")} aria-live="off"><Clock size={20} /> {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}</div>
        <p className="muted small" style={{ margin: "4px 0 12px" }}>{answered}/{questions.length} answered</p>
        <div className="palette">
          {questions.map((x, i) => <button key={x.id} className={cx((answers[x.id] ?? "") !== "" && "done", flags[x.id] && "flag", i === cur && "cur")} onClick={() => setCur(i)}>{i + 1}</button>)}
        </div>
        <Button style={{ width: "100%", marginTop: 16 }} onClick={async () => { if (await confirm({ title: "Submit exam?", message: `${questions.length - answered} question(s) are unanswered. You cannot change answers after submitting.`, confirmLabel: "Submit", danger: false })) submit(false); }}>Submit exam</Button>
      </Card>
      <Card title={`Question ${cur + 1} of ${questions.length}`} subtitle={`${q.marks} mark${q.marks > 1 ? "s" : ""}`}
        actions={<Button size="sm" variant={flags[q.id] ? "secondary" : "ghost"} icon={Flag} onClick={() => setFlags((f) => ({ ...f, [q.id]: !f[q.id] }))}>{flags[q.id] ? "Flagged" : "Flag"}</Button>}>
        <p style={{ fontSize: "1.08rem", marginBottom: 16, whiteSpace: "pre-wrap" }}>{q.text}</p>
        {q.type === "mcq"
          ? Object.entries(q.options || {}).map(([k, v]) => (
              <label key={k} className={cx("opt", answers[q.id] === k && "sel")}>
                <input type="radio" name={q.id} checked={answers[q.id] === k} onChange={() => answer(q.id, k)} /> <strong>{k}.</strong> {v}
              </label>))
          : <textarea className="input" rows={6} placeholder="Type your answer…" value={answers[q.id] || ""} onChange={(e) => answer(q.id, e.target.value)} />}
        <div className="row between" style={{ marginTop: 18 }}>
          <Button variant="secondary" disabled={cur === 0} onClick={() => setCur(cur - 1)}>Previous</Button>
          <Button disabled={cur === questions.length - 1} onClick={() => setCur(cur + 1)}>Next</Button>
        </div>
      </Card>
    </div>
  );
}
