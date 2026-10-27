// src/pages/Grading.jsx — auto-grade MCQs, manually grade short answers, publish results
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowLeft, Download, Send } from "lucide-react";
import { useAuth } from "../lib/auth";
import { audit, patch, useList, useLookup, useValue } from "../lib/db";
import { download, gradeFor, pct, toCSV } from "../lib/utils";
import { Badge, Button, Card, Empty, PageHeader, Spinner, Stat, useToast } from "../components/ui";
import DataTable from "../components/DataTable";
import { Modal } from "../components/ui";
import { Award, TrendingUp, Users, CheckCheck } from "lucide-react";

export default function Grading() {
  const { id } = useParams();
  const { profile } = useAuth();
  const toast = useToast();
  const { data: paper, loading } = useValue(`papers/${id}`);
  const { data: inst } = useValue("institute");
  const { items: qs } = useList(`paperQuestions/${id}`);
  const { data: keys } = useValue(`paperKeys/${id}`);
  const { items: attempts } = useList(`attempts/${id}`);
  const courses = useLookup("courses");
  const [manual, setManual] = useState({}); // uid -> qid -> marks
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(false);
  const questions = useMemo(() => [...qs].sort((a, b) => (a.order || 0) - (b.order || 0)), [qs]);

  useEffect(() => {
    const m = {};
    attempts.forEach((a) => { if (a.grading?.manual) m[a.id] = a.grading.manual; });
    setManual((cur) => ({ ...m, ...cur }));
  }, [attempts]);

  const rows = useMemo(() => attempts.filter((a) => a.status === "submitted" || a.status === "graded").map((a) => {
    let score = 0, pendingShort = 0;
    questions.forEach((q) => {
      const ans = a.answers?.[q.id];
      if (q.type === "mcq") { if (ans && ans === keys?.[q.id]?.correct) score += q.marks; }
      else if (ans) { const m = manual[a.id]?.[q.id]; if (m === undefined) pendingShort++; else score += Math.min(Number(m) || 0, q.marks); }
    });
    const total = paper?.totalMarks || 0;
    const percent = pct(score, total);
    return { id: a.id, name: a.studentName || a.id, score, total, percent, pendingShort, attempt: a, grade: gradeFor(percent, inst?.gradingScale).grade, passed: percent >= (paper?.passPercent ?? 40) };
  }), [attempts, questions, keys, manual, paper, inst]);

  if (loading) return <Spinner />;
  if (!paper) return <Empty title="Exam not found" />;

  const publish = async () => {
    setBusy(true);
    try {
      const u = {};
      rows.forEach((r) => {
        u[`attempts/${id}/${r.id}/grading`] = { manual: manual[r.id] || {}, score: r.score, total: r.total, gradedBy: profile.uid, at: Date.now() };
        u[`attempts/${id}/${r.id}/status`] = "graded";
        u[`results/${r.id}/${id}`] = {
          paperId: id, title: paper.title, courseId: paper.courseId || "", courseName: courses.label(paper.courseId) !== "—" ? courses.label(paper.courseId) : paper.title,
          classId: paper.classId, score: r.score, total: r.total, percent: r.percent, grade: r.grade, passed: r.passed, source: "exam", date: Date.now(),
        };
      });
      await patch(u);
      audit(profile, "publish_results", paper.title);
      toast.success(`Results published for ${rows.length} student(s)`);
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };

  const avg = rows.length ? Math.round(rows.reduce((a, r) => a + r.percent, 0) / rows.length) : 0;
  const dist = ["0-39", "40-59", "60-79", "80-100"].map((label, i) => ({ label, count: rows.filter((r) => [r.percent < 40, r.percent >= 40 && r.percent < 60, r.percent >= 60 && r.percent < 80, r.percent >= 80][i]).length }));
  const cur = open && rows.find((r) => r.id === open);

  return (
    <>
      <PageHeader title={`Results — ${paper.title}`} subtitle={`${paper.code} · ${paper.totalMarks} marks · pass ${paper.passPercent}%`}
        actions={<>
          <Link className="btn btn-ghost" to="/exams"><ArrowLeft size={16} />Exams</Link>
          <Button variant="secondary" icon={Download} onClick={() => download(`${paper.code}-results.csv`, toCSV(rows, [{ label: "Student", key: "name" }, { label: "Score", key: "score" }, { label: "Total", key: "total" }, { label: "Percent", key: "percent" }, { label: "Grade", key: "grade" }]))}>Export</Button>
          <Button icon={Send} loading={busy} disabled={!rows.length} onClick={publish}>Save &amp; publish</Button>
        </>} />
      <div className="grid stats">
        <Stat label="Submissions" value={rows.length} icon={Users} tone="indigo" />
        <Stat label="Average" value={`${avg}%`} icon={TrendingUp} tone="blue" />
        <Stat label="Highest" value={`${rows.length ? Math.max(...rows.map((r) => r.percent)) : 0}%`} icon={Award} tone="green" />
        <Stat label="Pass rate" value={`${pct(rows.filter((r) => r.passed).length, rows.length)}%`} icon={CheckCheck} tone="violet" />
      </div>
      <div className="grid two">
        <Card title="Score distribution"><div className="chart-box"><ResponsiveContainer><BarChart data={dist}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" /><XAxis dataKey="label" stroke="var(--muted)" /><YAxis allowDecimals={false} stroke="var(--muted)" /><Tooltip /><Bar dataKey="count" fill="var(--primary)" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div></Card>
        <Card flush title="Submissions" subtitle="Click a row to grade short answers.">
          <DataTable pageSize={8} rows={rows} onRowClick={(r) => setOpen(r.id)} columns={[
            { key: "name", label: "Student" },
            { key: "score", label: "Score", render: (r) => `${r.score}/${r.total}` },
            { key: "grade", label: "Grade", render: (r) => <Badge tone={r.passed ? "green" : "red"}>{r.grade}</Badge> },
            { key: "pendingShort", label: "Pending", render: (r) => (r.pendingShort ? <Badge tone="amber">{r.pendingShort} to grade</Badge> : <Badge tone="green">Done</Badge>) },
            { key: "tabs", label: "Tab switches", sortValue: (r) => r.attempt.tabSwitches || 0, render: (r) => (r.attempt.tabSwitches ? <Badge tone={r.attempt.tabSwitches > 3 ? "red" : "amber"}>{r.attempt.tabSwitches}</Badge> : "0") },
          ]} />
        </Card>
      </div>
      <Modal open={Boolean(cur)} onClose={() => setOpen(null)} size="lg" title={cur ? `${cur.name} — ${cur.score}/${cur.total}` : ""} footer={<Button onClick={() => setOpen(null)}>Done</Button>}>
        {cur && questions.map((q, i) => {
          const ans = cur.attempt.answers?.[q.id];
          const ok = q.type === "mcq" && ans === keys?.[q.id]?.correct;
          return (
            <div key={q.id} className="q-card">
              <strong>Q{i + 1}. {q.text}</strong> <Badge>{q.marks} marks</Badge>
              {q.type === "mcq" ? (
                <p className="small" style={{ marginTop: 6 }}>Answered: <strong>{ans || "—"}</strong> · Correct: <strong>{keys?.[q.id]?.correct}</strong> <Badge tone={ok ? "green" : "red"}>{ok ? `+${q.marks}` : "0"}</Badge></p>
              ) : (
                <div style={{ marginTop: 8 }}>
                  <p style={{ whiteSpace: "pre-wrap" }}>{ans || <em className="muted">No answer</em>}</p>
                  {keys?.[q.id]?.model && <p className="small muted">Model answer: {keys[q.id].model}</p>}
                  {ans && <div className="row gap-sm" style={{ marginTop: 6 }}><label className="small">Marks</label>
                    <input className="input" style={{ width: 90 }} type="number" min={0} max={q.marks} value={manual[cur.id]?.[q.id] ?? ""} onChange={(e) => setManual((m) => ({ ...m, [cur.id]: { ...m[cur.id], [q.id]: e.target.value === "" ? undefined : Math.min(q.marks, Math.max(0, Number(e.target.value))) } }))} /> / {q.marks}</div>}
                </div>
              )}
            </div>
          );
        })}
      </Modal>
    </>
  );
}
