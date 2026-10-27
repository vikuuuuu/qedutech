// src/lib/nav.js
import {
  LayoutDashboard, GraduationCap, Users, Building2, BookOpen, School, CalendarClock, ClipboardCheck,
  FileQuestion, Award, Wallet, Megaphone, BarChart3, ScrollText, Settings,
} from "lucide-react";

const I = {
  dashboard: { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  students: { to: "/students", label: "Students", icon: GraduationCap },
  staff: { to: "/staff", label: "Staff", icon: Users },
  departments: { to: "/departments", label: "Departments", icon: Building2 },
  courses: { to: "/courses", label: "Courses", icon: BookOpen },
  classes: { to: "/classes", label: "Classes", icon: School },
  timetable: { to: "/timetable", label: "Timetable", icon: CalendarClock },
  attendance: { to: "/attendance", label: "Attendance", icon: ClipboardCheck },
  exams: { to: "/exams", label: "Exams", icon: FileQuestion },
  gradebook: { to: "/gradebook", label: "Gradebook", icon: Award },
  results: { to: "/gradebook", label: "Results", icon: Award },
  fees: { to: "/fees", label: "Fees", icon: Wallet },
  notices: { to: "/notices", label: "Notice board", icon: Megaphone },
  reports: { to: "/reports", label: "Reports", icon: BarChart3 },
  audit: { to: "/audit", label: "Audit log", icon: ScrollText },
  settings: { to: "/settings", label: "Settings", icon: Settings },
};

export const NAV = {
  admin: [
    { group: "Overview", items: [I.dashboard, I.reports] },
    { group: "People", items: [I.students, I.staff] },
    { group: "Academics", items: [I.departments, I.courses, I.classes, I.timetable, I.attendance] },
    { group: "Assessment", items: [I.exams, I.gradebook] },
    { group: "Operations", items: [I.fees, I.notices, I.audit, I.settings] },
  ],
  teacher: [
    { group: "Overview", items: [I.dashboard] },
    { group: "Teaching", items: [I.timetable, I.attendance, I.students] },
    { group: "Assessment", items: [I.exams, I.gradebook] },
    { group: "Communication", items: [I.notices, I.settings] },
  ],
  student: [
    { group: "Overview", items: [I.dashboard] },
    { group: "Learning", items: [I.exams, I.results, I.timetable, I.attendance] },
    { group: "Campus", items: [I.fees, I.notices, I.settings] },
  ],
};

export const ROLE_LABEL = { admin: "Administrator", teacher: "Teacher", student: "Student" };
