// src/pages/Dashboard.jsx — role-specific home screens
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Building2, CalendarCheck, CalendarClock, FileQuestion, GraduationCap, Megaphone, School, Users, Wallet, Award } from "lucide-react";
import { useAuth } from "../lib/auth";
import { useList, useValue } from "../lib/db";
import { DAYS, fmtDateTime, money, pct } from "../lib/utils";
import { Badge, Card, Empty, PageHeader, Stat } from "../components/ui";

export default function Dashboard() {
  const { profile } = useAuth();
  const hour = new Date().getHours();
  const hello = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  return (
    <>
      <PageHeader title={`${hello}, ${profile.name.split(" ")[0]}`} subtitle={new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" })} />
      {profile.role === "admin" ? <Admin /> : profile.role === "teacher" ? <Teacher profile={profile} /> : <Student profile={profile} />}
    </>
  );
}

function NoticesCard({ audience, classId }) {
  const { items } = useList("notices", { limit: 8 });
  const rows = useMemo(() => items.filter((n) => n.audience === "all" || n.audience === audience || (n.audience === "class" && (!classId || n.classId === classId))).reverse().slice(0, 4), [items, audience, classId]);
  return (
    <Card title="Latest notices" actions={<Link to="/notices" className="small">View all</Link>}>
      {!rows.length ? <Empty icon={Megaphone} title="No notices" /> : rows.map((n) => (
        <div key={n.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}><strong>{n.title}</strong><div className="small muted">{n.authorName} · {fmtDateTime(n.createdAt)}</div></div>
      ))}
    </Card>
  );
}

function Admin() {
  const { data: s } = useValue("stats");
  const { data: inst } = useValue("institute");
  const { items: daily } = useList("attendanceDaily", { limit: 7 });
  const trend = daily.map(({ id, ...c }) => { const v = Object.values(c).reduce((a, x) => ({ p: a.p + (x.P || 0) + (x.L || 0), t: a.t + (x.total || 0) }), { p: 0, t: 0 }); return { date: id.slice(5), percent: pct(v.p, v.t) }; });
  const cur = inst?.currency || "₹";
  return (
    <>
      <div className="grid stats">
        <Stat label="Students" value={s?.students || 0} icon={GraduationCap} tone="indigo" />
        <Stat label="Teachers" value={s?.teachers || 0} icon={Users} tone="blue" />
        <Stat label="Departments" value={s?.departments || 0} icon={Building2} tone="violet" />
        <Stat label="Classes" value={s?.classes || 0} icon={School} tone="green" />
        <Stat label="Exams" value={s?.papers || 0} icon={FileQuestion} tone="amber" />
        <Stat label="Fees collected" value={money(s?.feesCollected || 0, cur)} icon={Wallet} tone="green" hint={`of ${money(s?.feesBilled || 0, cur)} billed`} />
      </div>
      <div className="grid two">
        <Card title="Attendance — last 7 recorded days">
          {!trend.length ? <Empty icon={CalendarCheck} title="No attendance yet" /> : (
            <div className="chart-box"><ResponsiveContainer><AreaChart data={trend}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" /><XAxis dataKey="date" stroke="var(--muted)" fontSize={12} /><YAxis domain={[0, 100]} unit="%" stroke="var(--muted)" fontSize={12} /><Tooltip /><Area dataKey="percent" stroke="var(--primary)" fill="var(--primary-soft)" strokeWidth={2} /></AreaChart></ResponsiveContainer></div>
          )}
        </Card>
        <NoticesCard audience="all" />
      </div>
    </>
  );
}

function useToday(items) {
  const day = DAYS[(new Date().getDay() + 6) % 7];
  return items.filter((s) => s.day === day).sort((a, b) => a.start.localeCompare(b.start));
}

function Teacher({ profile }) {
  const { items: papers } = useList("papers", { orderBy: "createdBy", equal: profile.uid });
  const { items: slots } = useList(`timetableByTeacher/${profile.uid}`);
  const today = useToday(slots);
  const live = papers.filter((p) => p.status === "published" && p.endAt > Date.now());
  return (
    <>
      <div className="grid stats">
        <Stat label="My exams" value={papers.length} icon={FileQuestion} tone="indigo" />
        <Stat label="Live / upcoming" value={live.length} icon={CalendarClock} tone="green" />
        <Stat label="Periods today" value={today.length} icon={CalendarClock} tone="amber" />
      </div>
      <div className="grid two">
        <Card title="Today's schedule" actions={<Link to="/timetable" className="small">Timetable</Link>}>
          {!today.length ? <Empty icon={CalendarClock} title="No periods today" /> : today.map((s) => <div key={s.id} className="slot"><strong>{s.subject}</strong><small>{s.start}–{s.end} · {s.className}{s.room ? ` · ${s.room}` : ""}</small></div>)}
        </Card>
        <NoticesCard audience="teachers" />
      </div>
    </>
  );
}

function Student({ profile }) {
  const { items: papers } = useList("papers", { orderBy: "classId", equal: profile.classId || "none", enabled: Boolean(profile.classId) });
  const { data: att } = useValue(`attendanceByStudent/${profile.uid}`);
  const { items: inv } = useList("fees/invoices", { orderBy: "studentId", equal: profile.uid });
  const { items: results } = useList(`results/${profile.uid}`);
  const { items: slots } = useList(profile.classId ? `timetable/${profile.classId}` : null);
  const today = useToday(slots);
  const attVals = Object.values(att || {});
  const attPct = pct(attVals.filter((x) => x !== "A").length, attVals.length);
  const due = inv.reduce((a, i) => a + (i.amount - (i.paid || 0)), 0);
  const upcoming = papers.filter((p) => p.status === "published" && p.endAt > Date.now()).sort((a, b) => a.startAt - b.startAt).slice(0, 4);
  const avg = results.length ? Math.round(results.reduce((a, r) => a + r.percent, 0) / results.length) : 0;
  return (
    <>
      <div className="grid stats">
        <Stat label="Attendance" value={attVals.length ? `${attPct}%` : "—"} icon={CalendarCheck} tone={attPct >= 75 || !attVals.length ? "green" : "red"} />
        <Stat label="Average score" value={results.length ? `${avg}%` : "—"} icon={Award} tone="indigo" />
        <Stat label="Fees due" value={money(due)} icon={Wallet} tone={due ? "amber" : "green"} />
        <Stat label="Upcoming exams" value={upcoming.length} icon={FileQuestion} tone="blue" />
      </div>
      <div className="grid two">
        <Card title="Next exams" actions={<Link to="/exams" className="small">All exams</Link>}>
          {!upcoming.length ? <Empty icon={FileQuestion} title="No upcoming exams" /> : upcoming.map((p) => <div key={p.id} className="row between" style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}><div><strong>{p.title}</strong><div className="small muted">{fmtDateTime(p.startAt)} · {p.duration} min</div></div><Badge tone={p.startAt <= Date.now() ? "green" : "blue"}>{p.startAt <= Date.now() ? "Live" : "Soon"}</Badge></div>)}
        </Card>
        <Card title="Today's classes" actions={<Link to="/timetable" className="small">Timetable</Link>}>
          {!today.length ? <Empty icon={CalendarClock} title="No periods today" /> : today.map((s) => <div key={s.id} className="slot"><strong>{s.subject}</strong><small>{s.start}–{s.end}{s.room ? ` · ${s.room}` : ""} · {s.teacherName}</small></div>)}
        </Card>
      </div>
      <NoticesCard audience="students" classId={profile.classId} />
    </>
  );
}
