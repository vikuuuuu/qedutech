// src/pages/Reports.jsx — institute-wide analytics built from pre-aggregated counters
import { useMemo } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { Download } from "lucide-react";
import { get, ref } from "firebase/database";
import { db } from "../lib/firebase";
import { useList, useLookup, useValue } from "../lib/db";
import { download, money, pct, toCSV } from "../lib/utils";
import { Button, Card, PageHeader } from "../components/ui";

export default function Reports() {
  const { data: stats } = useValue("stats");
  const { data: inst } = useValue("institute");
  const { items: daily } = useList("attendanceDaily", { limit: 14 });
  const { items: students } = useList("users", { orderBy: "role", equal: "student", live: false });
  const classes = useLookup("classes");
  const cur = inst?.currency || "₹";

  const trend = useMemo(() => daily.map(({ id, ...byClass }) => {
    const v = Object.values(byClass).reduce((a, c) => ({ P: a.P + (c.P || 0), L: a.L + (c.L || 0), t: a.t + (c.total || 0) }), { P: 0, L: 0, t: 0 });
    return { date: id.slice(5), percent: pct(v.P + v.L, v.t) };
  }), [daily]);

  const perClass = useMemo(() => {
    const m = {};
    students.forEach((s) => { if (s.status !== "inactive") m[s.classId || "none"] = (m[s.classId || "none"] || 0) + 1; });
    return Object.entries(m).map(([id, count]) => ({ name: id === "none" ? "Unassigned" : classes.label(id), count }));
  }, [students, classes]);

  const billed = stats?.feesBilled || 0, collected = stats?.feesCollected || 0;
  const fee = [{ name: "Collected", value: collected }, { name: "Outstanding", value: Math.max(0, billed - collected) }];

  const exportFees = async () => {
    const s = await get(ref(db, "fees/invoices"));
    const rows = Object.entries(s.val() || {}).map(([id, v]) => ({ id, ...v }));
    download("fees-ledger.csv", toCSV(rows, [{ label: "Student", key: "studentName" }, { label: "Roll no", key: "rollNo" }, { label: "Fee", key: "title" }, { label: "Amount", key: "amount" }, { label: "Paid", key: "paid" }, { label: "Status", key: "status" }, { label: "Due", key: "dueDate" }]));
  };

  const axis = { stroke: "var(--muted)", fontSize: 12 };
  return (
    <>
      <PageHeader title="Reports" subtitle="Attendance, enrolment and finance at a glance."
        actions={<>
          <Button variant="secondary" icon={Download} onClick={() => download("students.csv", toCSV(students, [{ label: "Name", key: "name" }, { label: "Email", key: "email" }, { label: "Roll no", key: "rollNo" }, { label: "Class", value: (r) => classes.label(r.classId) }, { label: "Guardian", key: "guardianName" }, { label: "Guardian phone", key: "guardianPhone" }]))}>Student list</Button>
          <Button variant="secondary" icon={Download} onClick={exportFees}>Fee ledger</Button>
        </>} />
      <div className="grid two">
        <Card title="Attendance — last 14 recorded days" subtitle="Institute-wide present + late %">
          <div className="chart-box"><ResponsiveContainer><AreaChart data={trend}><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--primary)" stopOpacity={0.4} /><stop offset="100%" stopColor="var(--primary)" stopOpacity={0} /></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" /><XAxis dataKey="date" {...axis} /><YAxis domain={[0, 100]} {...axis} unit="%" /><Tooltip /><Area dataKey="percent" stroke="var(--primary)" fill="url(#g)" strokeWidth={2} /></AreaChart></ResponsiveContainer></div>
        </Card>
        <Card title="Fee collection" subtitle={`${money(collected, cur)} of ${money(billed, cur)} billed`}>
          <div className="chart-box"><ResponsiveContainer><PieChart><Pie data={fee} dataKey="value" innerRadius={60} outerRadius={95} paddingAngle={3}><Cell fill="var(--green)" /><Cell fill="var(--amber)" /></Pie><Tooltip formatter={(v) => money(v, cur)} /><Legend /></PieChart></ResponsiveContainer></div>
        </Card>
      </div>
      <Card title="Students per class">
        <div className="chart-box"><ResponsiveContainer><BarChart data={perClass}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" /><XAxis dataKey="name" {...axis} interval={0} /><YAxis allowDecimals={false} {...axis} /><Tooltip /><Bar dataKey="count" fill="var(--primary)" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div>
      </Card>
    </>
  );
}
