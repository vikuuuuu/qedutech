// src/pages/People.jsx — students & staff management
import { useMemo, useRef, useState } from "react";
import { Download, Pencil, Plus, Power, Upload } from "lucide-react";
import { ref, update } from "firebase/database";
import { db } from "../lib/firebase";
import { audit, bump, useList, useLookup } from "../lib/db";
import { useAuth } from "../lib/auth";
import { download, parseCSV, randomPassword, toCSV, fmtDate } from "../lib/utils";
import { Avatar, Badge, Button, Card, Field, Modal, PageHeader, useConfirm, useToast } from "../components/ui";
import DataTable from "../components/DataTable";

const friendly = (e) => (e?.code?.includes("email-already") ? "Email already registered" : e?.message || "Failed");

export default function People({ kind }) {
  const isStudent = kind === "student";
  const { profile, createAccount } = useAuth();
  const canEdit = profile.role === "admin";
  const toast = useToast();
  const confirm = useConfirm();
  const fileRef = useRef(null);
  const { items, loading } = useList("users", { orderBy: "role", equal: kind });
  const classes = useLookup("classes");
  const depts = useLookup("departments");
  const [classFilter, setClassFilter] = useState("");
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [creds, setCreds] = useState(null);
  const [importing, setImporting] = useState(null);

  const rows = useMemo(() => (classFilter ? items.filter((r) => r.classId === classFilter) : items), [items, classFilter]);
  const set = (k) => (v) => setEditing((e) => ({ ...e, values: { ...e.values, [k]: v } }));

  const fields = isStudent
    ? [
        ["name", "Full name", "text", true], ["email", "Email (login)", "email", true, "new"],
        ["rollNo", "Roll / admission no.", "text", true], ["classId", "Class", "select", true],
        ["dob", "Date of birth", "date"], ["phone", "Phone", "tel"],
        ["guardianName", "Guardian name", "text"], ["guardianPhone", "Guardian phone", "tel"],
        ["admissionDate", "Admission date", "date"], ["address", "Address", "textarea"],
      ]
    : [
        ["name", "Full name", "text", true], ["email", "Email (login)", "email", true, "new"],
        ["employeeId", "Employee ID", "text", true], ["departmentId", "Department", "select"],
        ["designation", "Designation", "text"], ["phone", "Phone", "tel"], ["joinDate", "Joining date", "date"],
      ];

  const save = async (e) => {
    e.preventDefault();
    const v = editing.values;
    const errs = {};
    fields.forEach(([n,, , req, only]) => { if (req && !v[n] && !(only === "new" && editing.uid)) errs[n] = "Required"; });
    if (!editing.uid && (!v.password || v.password.length < 6)) errs.password = "Min 6 characters";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      if (editing.uid) {
        const { password, email, ...rest } = v;
        await update(ref(db, `users/${editing.uid}`), rest);
        audit(profile, `update_${kind}`, v.name);
        toast.success("Saved");
      } else {
        const { password, ...rest } = v;
        await createAccount({ ...rest, password, role: kind });
        bump(isStudent ? "students" : "teachers", 1);
        toast.success(`${isStudent ? "Student" : "Teacher"} account created`);
      }
      setEditing(null);
    } catch (err) { toast.error(friendly(err)); } finally { setSaving(false); }
  };

  const toggle = async (r) => {
    const active = r.status !== "inactive";
    if (!(await confirm({ title: active ? "Deactivate account?" : "Re-activate account?", message: `${r.name} will ${active ? "lose" : "regain"} access immediately. Records are kept.`, confirmLabel: active ? "Deactivate" : "Activate", danger: active }))) return;
    await update(ref(db, `users/${r.id}`), { status: active ? "inactive" : "active" });
    audit(profile, active ? "deactivate_user" : "activate_user", r.name);
  };

  const runImport = async (file) => {
    if (!file) return;
    const data = parseCSV(await file.text());
    if (!data.length) return toast.error("CSV is empty or has no header row.");
    const byName = Object.fromEntries(classes.items.map((c) => [c.name.toLowerCase(), c.id]));
    const out = [];
    setImporting({ done: 0, total: data.length });
    for (let i = 0; i < data.length; i++) {
      const r = data[i];
      const password = randomPassword();
      try {
        if (!r.name || !r.email) throw new Error("name and email are required");
        await createAccount({
          name: r.name, email: r.email, password, role: "student", rollNo: r.rollNo || "", phone: r.phone || "",
          guardianName: r.guardianName || "", guardianPhone: r.guardianPhone || "", dob: r.dob || "",
          classId: byName[(r.class || "").toLowerCase()] || "",
        });
        bump("students", 1);
        out.push({ name: r.name, email: r.email, password, result: "created" });
      } catch (err) { out.push({ name: r.name, email: r.email, password: "", result: friendly(err) }); }
      setImporting({ done: i + 1, total: data.length });
    }
    setImporting(null);
    setCreds(out);
    if (fileRef.current) fileRef.current.value = "";
  };

  const columns = [
    { key: "name", label: isStudent ? "Student" : "Teacher", render: (r) => <div className="cell-user"><Avatar name={r.name} /><div><strong>{r.name}</strong><small>{r.email}</small></div></div> },
    isStudent
      ? { key: "rollNo", label: "Roll no." }
      : { key: "employeeId", label: "Emp. ID" },
    isStudent
      ? { key: "classId", label: "Class", sortValue: (r) => classes.label(r.classId), render: (r) => classes.label(r.classId) }
      : { key: "departmentId", label: "Department", sortValue: (r) => depts.label(r.departmentId), render: (r) => depts.label(r.departmentId) },
    isStudent ? { key: "guardianName", label: "Guardian", render: (r) => r.guardianName ? `${r.guardianName}${r.guardianPhone ? ` · ${r.guardianPhone}` : ""}` : "—" } : { key: "designation", label: "Designation" },
    { key: "createdAt", label: "Joined", sortValue: (r) => r.createdAt || 0, render: (r) => fmtDate(r.createdAt) },
    { key: "status", label: "Status", render: (r) => <Badge tone={r.status === "inactive" ? "red" : "green"}>{r.status === "inactive" ? "Inactive" : "Active"}</Badge> },
    ...(canEdit ? [{ key: "_a", label: "", sortable: false, align: "right", width: 90, render: (r) => (
      <div className="row gap-xs end">
        <button className="icon-btn" title="Edit" onClick={() => { setErrors({}); setEditing({ uid: r.id, values: { ...r } }); }}><Pencil size={16} /></button>
        <button className="icon-btn" title="Activate / deactivate" onClick={() => toggle(r)}><Power size={16} /></button>
      </div>) }] : []),
  ];

  const exportCsv = () => download(`${kind}s.csv`, toCSV(rows, [
    { label: "Name", key: "name" }, { label: "Email", key: "email" },
    isStudent ? { label: "Roll no", key: "rollNo" } : { label: "Employee ID", key: "employeeId" },
    isStudent ? { label: "Class", value: (r) => classes.label(r.classId) } : { label: "Department", value: (r) => depts.label(r.departmentId) },
    { label: "Phone", key: "phone" }, { label: "Status", value: (r) => r.status || "active" },
  ]));

  const sample = () => download("students-template.csv", "name,email,rollNo,class,phone,guardianName,guardianPhone,dob\nAarav Sharma,aarav@example.com,2026-001,B.Tech CSE – Sem 1 – A,9876543210,Rakesh Sharma,9876500000,2008-05-14\n");

  return (
    <>
      <PageHeader
        title={isStudent ? "Students" : "Staff"}
        subtitle={isStudent ? "Enrolment, guardians and class allocation." : "Teaching staff and their departments."}
        actions={canEdit && (
          <>
            {isStudent && <>
              <input ref={fileRef} type="file" accept=".csv" hidden onChange={(e) => runImport(e.target.files[0])} />
              <Button variant="secondary" icon={Upload} loading={Boolean(importing)} onClick={() => fileRef.current.click()}>
                {importing ? `Importing ${importing.done}/${importing.total}` : "Bulk import"}
              </Button>
            </>}
            <Button icon={Plus} onClick={() => { setErrors({}); setEditing({ uid: null, values: { password: "" } }); }}>Add {isStudent ? "student" : "teacher"}</Button>
          </>
        )}
      />
      <Card flush>
        <DataTable
          columns={columns} rows={rows} loading={loading}
          searchKeys={["name", "email", "rollNo", "employeeId", "phone"]}
          toolbar={<>
            {isStudent && <select className="input" value={classFilter} onChange={(e) => setClassFilter(e.target.value)} aria-label="Filter by class">
              <option value="">All classes</option>{classes.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>}
            {isStudent && canEdit && <Button variant="ghost" size="sm" onClick={sample}>CSV template</Button>}
            <Button variant="ghost" size="sm" icon={Download} onClick={exportCsv}>Export</Button>
          </>}
        />
      </Card>

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} size="md" title={`${editing?.uid ? "Edit" : "Add"} ${isStudent ? "student" : "teacher"}`}
        footer={<><Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" form="people-form" loading={saving}>Save</Button></>}>
        <form id="people-form" className="form-grid" onSubmit={save} noValidate>
          {editing && fields.map(([n, label, type, req, only]) => (
            <Field key={n} name={n} label={label} type={type} required={req} span={type === "textarea" ? 2 : undefined}
              disabled={only === "new" && Boolean(editing.uid)} error={errors[n]} value={editing.values[n]} onChange={set(n)}
              options={n === "classId" ? classes.options : n === "departmentId" ? depts.options : undefined} />
          ))}
          {editing && !editing.uid && (
            <Field label="Temporary password" required value={editing.values.password} onChange={set("password")} error={errors.password}
              hint="Share securely; the user can change it in Settings." span={2}>
              <div className="row gap-sm">
                <input className="input" value={editing.values.password || ""} onChange={(e) => set("password")(e.target.value)} />
                <Button type="button" variant="secondary" onClick={() => set("password")(randomPassword())}>Generate</Button>
              </div>
            </Field>
          )}
        </form>
      </Modal>

      <Modal open={Boolean(creds)} onClose={() => setCreds(null)} size="lg" title="Import finished"
        footer={<><Button variant="secondary" icon={Download} onClick={() => download("new-student-credentials.csv", toCSV(creds, [{ label: "Name", key: "name" }, { label: "Email", key: "email" }, { label: "Temporary password", key: "password" }, { label: "Result", key: "result" }]))}>Download credentials</Button><Button onClick={() => setCreds(null)}>Done</Button></>}>
        <p className="muted" style={{ marginBottom: 12 }}>Temporary passwords are shown only here — download them now and distribute securely.</p>
        <DataTable rows={creds?.map((c, i) => ({ ...c, id: i })) || []} pageSize={8} columns={[
          { key: "name", label: "Name" }, { key: "email", label: "Email" }, { key: "password", label: "Password" },
          { key: "result", label: "Result", render: (r) => <Badge tone={r.result === "created" ? "green" : "red"}>{r.result}</Badge> },
        ]} />
      </Modal>
    </>
  );
}
