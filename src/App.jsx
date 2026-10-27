// src/App.jsx
import { lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import { Protected } from "./lib/auth";

// Every page is its own chunk — users only download what their role visits.
const Login = lazy(() => import("./pages/Login"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const People = lazy(() => import("./pages/People"));
const Academics = lazy(() => import("./pages/Academics"));
const Attendance = lazy(() => import("./pages/Attendance"));
const Timetable = lazy(() => import("./pages/Timetable"));
const Notices = lazy(() => import("./pages/Notices"));
const Fees = lazy(() => import("./pages/Fees"));
const Exams = lazy(() => import("./pages/Exams"));
const Grading = lazy(() => import("./pages/Grading"));
const Gradebook = lazy(() => import("./pages/Gradebook"));
const Reports = lazy(() => import("./pages/Reports"));
const Audit = lazy(() => import("./pages/Audit"));
const Settings = lazy(() => import("./pages/Settings"));

const ADMIN = ["admin"];
const STAFF = ["admin", "teacher"];

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Protected><Layout /></Protected>}>
        <Route index element={<Dashboard />} />
        <Route path="students" element={<Protected roles={STAFF}><People kind="student" /></Protected>} />
        <Route path="staff" element={<Protected roles={ADMIN}><People kind="teacher" /></Protected>} />
        <Route path="departments" element={<Protected roles={ADMIN}><Academics kind="departments" /></Protected>} />
        <Route path="courses" element={<Protected roles={ADMIN}><Academics kind="courses" /></Protected>} />
        <Route path="classes" element={<Protected roles={ADMIN}><Academics kind="classes" /></Protected>} />
        <Route path="attendance" element={<Attendance />} />
        <Route path="timetable" element={<Timetable />} />
        <Route path="notices" element={<Notices />} />
        <Route path="fees" element={<Fees />} />
        <Route path="exams" element={<Exams />} />
        <Route path="exams/:id" element={<Exams />} />
        <Route path="grading/:id" element={<Protected roles={STAFF}><Grading /></Protected>} />
        <Route path="gradebook" element={<Gradebook />} />
        <Route path="reports" element={<Protected roles={ADMIN}><Reports /></Protected>} />
        <Route path="audit" element={<Protected roles={ADMIN}><Audit /></Protected>} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
