// src/pages/Fees.jsx
import { useMemo, useState } from "react";
import { FilePlus2, Printer, Receipt, Wallet, IndianRupee, AlertTriangle } from "lucide-react";
import { equalTo, get, orderByChild, query, ref } from "firebase/database";
import { db } from "../lib/firebase";
import { useAuth } from "../lib/auth";
import { audit, bump, newKey, patch, useList, useLookup, useValue } from "../lib/db";
import { fmtDate, money, todayKey } from "../lib/utils";
import { Badge, Button, Card, Field, Modal, PageHeader, Stat, Tabs, useToast } from "../components/ui";
import DataTable from "../components/DataTable";

const TONE = { paid: "green", partial: "amber", pending: "red" };

export default function Fees() {
  const { profile } = useAuth();
  const isAdmin = profile.role === "admin";
  if (profile.role === "teacher") return <PageHeader title="Fees" subtitle="Fee records are available to administrators and the student concerned." />;
  return <FeesView isAdmin={isAdmin} profile={profile} />;
}

function FeesView({ isAdmin, profile }) {
  const toast = useToast();
  const { data: inst } = useValue("institute");
  const cur = inst?.currency || "₹";
  const { items, loading } = useList("fees/invoices", isAdmin ? { limit: 500 } : { orderBy: "studentId", equal: profile.uid });
  const classes = useLookup("classes");
  const [tab, setTab] = useState("all");
  const [create, setCreate] = useState(null);
  const [pay, setPay] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [busy, setBusy] = useState(false);

  const totals = useMemo(() => items.reduce((a, i) => ({ billed: a.billed + i.amount, paid: a.paid + (i.paid || 0), overdue: a.overdue + (i.status !== "paid" && i.dueDate < todayKey() ? i.amount - (i.paid || 0) : 0) }), { billed: 0, paid: 0, overdue: 0 }), [items]);
  const rows = useMemo(() => items.filter((i) => tab === "all" || i.status === tab).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)), [items, tab]);

  const generate = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const snap = create.target === "student"
        ? await get(ref(db, `users/${create.studentId}`))
        : await get(query(ref(db, "users"), orderByChild("classId"), equalTo(create.classId)));
      const targets = create.target === "student"
        ? (snap.exists() ? [[create.studentId, snap.val()]] : [])
        : Object.entries(snap.val() || {}).filter(([, u]) => u.role === "student" && u.status !== "inactive");
      if (!targets.length) throw new Error("No matching students found.");
      const u = {};
      targets.forEach(([sid, s]) => {
        const id = newKey("fees/invoices");
        u[`fees/invoices/${id}`] = { studentId: sid, studentName: s.name, rollNo: s.rollNo || "", classId: s.classId || "", title: create.title, amount: Number(create.amount), paid: 0, status: "pending", dueDate: create.dueDate, createdAt: Date.now() };
      });
      await patch(u);
      bump("feesBilled", Number(create.amount) * targets.length);
      audit(profile, "generate_invoices", `${create.title} × ${targets.length}`);
      toast.success(`${targets.length} invoice(s) created`);
      setCreate(null);
    } catch (err) { toast.error(err); } finally { setBusy(false); }
  };

  const students = useList("users", { orderBy: "role", equal: "student", enabled: Boolean(create) && create.target === "student", live: false });

  const record = async (e) => {
    e.preventDefault();
    const amt = Number(pay.amount);
    const due = pay.inv.amount - (pay.inv.paid || 0);
    if (!(amt > 0) || amt > due) return toast.error(`Enter an amount between 1 and ${due}.`);
    setBusy(true);
    try {
      const pid = newKey(`fees/invoices/${pay.inv.id}/payments`);
      const paid = (pay.inv.paid || 0) + amt;
      await patch({
        [`fees/invoices/${pay.inv.id}/paid`]: paid,
        [`fees/invoices/${pay.inv.id}/status`]: paid >= pay.inv.amount ? "paid" : "partial",
        [`fees/invoices/${pay.inv.id}/payments/${pid}`]: { amount: amt, method: pay.method, reference: pay.reference || "", at: Date.now(), by: profile.name },
      });
      bump("feesCollected", amt);
      audit(profile, "record_payment", `${pay.inv.studentName} ${amt}`);
      toast.success("Payment recorded");
      setPay(null);
    } catch (err) { toast.error(err); } finally { setBusy(false); }
  };

  const columns = [
    ...(isAdmin ? [{ key: "studentName", label: "Student", render: (r) => <div><strong>{r.studentName}</strong><div className="muted small">{r.rollNo} {classes.label(r.classId) !== "—" ? `· ${classes.label(r.classId)}` : ""}</div></div> }] : []),
    { key: "title", label: "Fee" },
    { key: "amount", label: "Amount", render: (r) => money(r.amount, cur) },
    { key: "paid", label: "Paid", render: (r) => money(r.paid, cur) },
    { key: "dueDate", label: "Due", render: (r) => fmtDate(r.dueDate) },
    { key: "status", label: "Status", render: (r) => <Badge tone={r.status !== "paid" && r.dueDate < todayKey() ? "red" : TONE[r.status]}>{r.status !== "paid" && r.dueDate < todayKey() ? "overdue" : r.status}</Badge> },
    { key: "_a", label: "", sortable: false, align: "right", render: (r) => (
      <div className="row gap-xs end">
        {isAdmin && r.status !== "paid" && <Button size="sm" variant="secondary" onClick={() => setPay({ inv: r, amount: r.amount - (r.paid || 0), method: "Cash", reference: "" })}>Record payment</Button>}
        {(r.paid || 0) > 0 && <button className="icon-btn" title="Receipt" onClick={() => setReceipt(r)}><Receipt size={16} /></button>}
      </div>) },
  ];

  return (
    <>
      <PageHeader title={isAdmin ? "Fees & invoices" : "My fees"} subtitle="Invoices, payments and receipts."
        actions={isAdmin && <Button icon={FilePlus2} onClick={() => setCreate({ target: "class", classId: "", studentId: "", title: "", amount: "", dueDate: todayKey() })}>Generate invoices</Button>} />
      <div className="grid stats">
        <Stat label="Billed" value={money(totals.billed, cur)} icon={Wallet} tone="indigo" />
        <Stat label="Collected" value={money(totals.paid, cur)} icon={IndianRupee} tone="green" hint={`${totals.billed ? Math.round((totals.paid / totals.billed) * 100) : 0}% of billed`} />
        <Stat label="Outstanding" value={money(totals.billed - totals.paid, cur)} icon={Wallet} tone="amber" />
        <Stat label="Overdue" value={money(totals.overdue, cur)} icon={AlertTriangle} tone="red" />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={["all", "pending", "partial", "paid"].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1), count: v === "all" ? items.length : items.filter((i) => i.status === v).length }))} />
      <Card flush><DataTable columns={columns} rows={rows} loading={loading} searchKeys={["studentName", "title", "rollNo"]} /></Card>

      <Modal open={Boolean(create)} onClose={() => setCreate(null)} title="Generate invoices"
        footer={<><Button variant="ghost" onClick={() => setCreate(null)}>Cancel</Button><Button type="submit" form="inv-form" loading={busy}>Generate</Button></>}>
        {create && (
          <form id="inv-form" className="form-grid" onSubmit={generate}>
            <Field label="Bill" type="select" options={[{ value: "class", label: "Entire class" }, { value: "student", label: "Single student" }]} value={create.target} onChange={(v) => setCreate({ ...create, target: v })} />
            {create.target === "class"
              ? <Field label="Class" type="select" required options={classes.options} value={create.classId} onChange={(v) => setCreate({ ...create, classId: v })} />
              : <Field label="Student" type="select" required options={students.items.map((s) => ({ value: s.id, label: `${s.name} (${s.rollNo || s.email})` }))} value={create.studentId} onChange={(v) => setCreate({ ...create, studentId: v })} />}
            <Field span={2} label="Fee title" required placeholder="Tuition – Term 1" value={create.title} onChange={(v) => setCreate({ ...create, title: v })} />
            <Field label={`Amount (${cur})`} type="number" min={1} required value={create.amount} onChange={(v) => setCreate({ ...create, amount: v })} />
            <Field label="Due date" type="date" required value={create.dueDate} onChange={(v) => setCreate({ ...create, dueDate: v })} />
          </form>
        )}
      </Modal>

      <Modal open={Boolean(pay)} onClose={() => setPay(null)} size="sm" title="Record payment"
        footer={<><Button variant="ghost" onClick={() => setPay(null)}>Cancel</Button><Button type="submit" form="pay-form" loading={busy}>Save payment</Button></>}>
        {pay && (
          <form id="pay-form" className="grid" onSubmit={record}>
            <p><strong>{pay.inv.studentName}</strong> — {pay.inv.title}<br /><span className="muted">Balance {money(pay.inv.amount - (pay.inv.paid || 0), cur)}</span></p>
            <Field label="Amount" type="number" min={1} required value={pay.amount} onChange={(v) => setPay({ ...pay, amount: v })} />
            <Field label="Method" type="select" options={["Cash", "UPI", "Card", "Bank transfer", "Cheque"].map((m) => ({ value: m, label: m }))} value={pay.method} onChange={(v) => setPay({ ...pay, method: v })} />
            <Field label="Reference no." value={pay.reference} onChange={(v) => setPay({ ...pay, reference: v })} />
          </form>
        )}
      </Modal>

      <Modal open={Boolean(receipt)} onClose={() => setReceipt(null)} title="Payment receipt" footer={<Button icon={Printer} onClick={() => window.print()}>Print</Button>}>
        {receipt && (
          <div className="reportcard">
            <h2>{inst?.name || "Institute"} — Fee receipt</h2>
            <p className="center small">{inst?.address}</p>
            <dl className="kv" style={{ margin: "16px 0" }}>
              <dt>Student</dt><dd>{receipt.studentName} {receipt.rollNo && `(${receipt.rollNo})`}</dd>
              <dt>Fee</dt><dd>{receipt.title}</dd>
              <dt>Invoice total</dt><dd>{money(receipt.amount, cur)}</dd>
              <dt>Total paid</dt><dd>{money(receipt.paid, cur)}</dd>
              <dt>Balance</dt><dd>{money(receipt.amount - receipt.paid, cur)}</dd>
            </dl>
            <table className="table"><thead><tr><th>Date</th><th>Method</th><th>Reference</th><th>Amount</th></tr></thead>
              <tbody>{Object.entries(receipt.payments || {}).map(([k, p]) => <tr key={k}><td>{fmtDate(p.at)}</td><td>{p.method}</td><td>{p.reference || "—"}</td><td>{money(p.amount, cur)}</td></tr>)}</tbody></table>
          </div>
        )}
      </Modal>
    </>
  );
}
