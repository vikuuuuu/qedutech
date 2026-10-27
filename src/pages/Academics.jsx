// src/pages/Academics.jsx
import { useMemo } from "react";
import CrudPage from "../components/CrudPage";
import { Badge } from "../components/ui";
import { useLookup } from "../lib/db";

const SEMESTERS = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: `Semester / Grade ${i + 1}` }));

function Departments() {
  const staff = useLookup("users", "name", { orderBy: "role", equal: "teacher" });
  const columns = useMemo(() => [
    { key: "code", label: "Code", width: 110, render: (r) => <Badge tone="indigo">{r.code}</Badge> },
    { key: "name", label: "Department" },
    { key: "head", label: "Head of department", sortValue: (r) => staff.label(r.headId), render: (r) => staff.label(r.headId) },
    { key: "description", label: "Description", sortable: false },
  ], [staff]);
  const fields = useMemo(() => [
    { name: "name", label: "Department name", required: true },
    { name: "code", label: "Code", required: true, hint: "Short unique code, e.g. CSE" },
    { name: "headId", label: "Head of department", type: "select", options: staff.options, span: 2 },
    { name: "description", label: "Description", type: "textarea", span: 2 },
  ], [staff.options]);
  return (
    <CrudPage title="Departments" subtitle="Academic departments, faculties or wings of your institute." path="departments" entity="department" statKey="departments"
      columns={columns} fields={fields} searchKeys={["name", "code"]}
      transform={(v) => ({ ...v, code: v.code.toUpperCase() })} />
  );
}

function Courses() {
  const depts = useLookup("departments");
  const columns = useMemo(() => [
    { key: "code", label: "Code", width: 110, render: (r) => <Badge tone="indigo">{r.code}</Badge> },
    { key: "name", label: "Course / Subject" },
    { key: "departmentId", label: "Department", sortValue: (r) => depts.label(r.departmentId), render: (r) => depts.label(r.departmentId) },
    { key: "semester", label: "Sem / Grade", width: 120 },
    { key: "credits", label: "Credits", width: 90 },
  ], [depts]);
  const fields = useMemo(() => [
    { name: "name", label: "Course name", required: true },
    { name: "code", label: "Course code", required: true },
    { name: "departmentId", label: "Department", type: "select", options: depts.options, required: true },
    { name: "semester", label: "Semester / Grade", type: "select", options: SEMESTERS, required: true },
    { name: "credits", label: "Credits / weightage", type: "number", min: 0, max: 20 },
  ], [depts.options]);
  return (
    <CrudPage title="Courses" subtitle="Subjects offered across departments." path="courses" entity="course" statKey="courses"
      columns={columns} fields={fields} searchKeys={["name", "code"]} defaults={{ credits: 3 }}
      transform={(v) => ({ ...v, code: v.code.toUpperCase() })} />
  );
}

function Classes() {
  const depts = useLookup("departments");
  const staff = useLookup("users", "name", { orderBy: "role", equal: "teacher" });
  const columns = useMemo(() => [
    { key: "name", label: "Class / batch" },
    { key: "departmentId", label: "Department", sortValue: (r) => depts.label(r.departmentId), render: (r) => depts.label(r.departmentId) },
    { key: "semester", label: "Sem / Grade", width: 120 },
    { key: "section", label: "Section", width: 90 },
    { key: "classTeacherId", label: "Class teacher", sortValue: (r) => staff.label(r.classTeacherId), render: (r) => staff.label(r.classTeacherId) },
    { key: "academicYear", label: "Year", width: 110 },
  ], [depts, staff]);
  const fields = useMemo(() => [
    { name: "name", label: "Class name", required: true, hint: "e.g. B.Tech CSE – Sem 3 – A", span: 2 },
    { name: "departmentId", label: "Department", type: "select", options: depts.options },
    { name: "semester", label: "Semester / Grade", type: "select", options: SEMESTERS, required: true },
    { name: "section", label: "Section", placeholder: "A" },
    { name: "academicYear", label: "Academic year", placeholder: "2026-27" },
    { name: "classTeacherId", label: "Class teacher", type: "select", options: staff.options, span: 2 },
  ], [depts.options, staff.options]);
  return (
    <CrudPage title="Classes" subtitle="Sections and batches students are enrolled into." path="classes" entity="class" statKey="classes"
      columns={columns} fields={fields} searchKeys={["name", "section"]} />
  );
}

export default function Academics({ kind }) {
  return kind === "departments" ? <Departments /> : kind === "courses" ? <Courses /> : <Classes />;
}
