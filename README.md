# QuizMaster Institute

Online exams + institute management for schools, colleges and universities.
React 18 · Vite · Firebase Auth + Realtime Database · Recharts.

## Run
```bash
npm install
cp .env.example .env   # fill Firebase web config (a populated .env is already included)
npm run dev            # http://localhost:5173
npm run build
```

## Deploy security rules (required)
```bash
npm i -g firebase-tools && firebase login
firebase use <your-project-id>
firebase deploy --only database   # reads database.rules.json
```
Enable **Email/Password** under Firebase Console → Authentication → Sign-in method.

## First run
Open the app → "Set up your institute" appears while `meta/initialized` is unset. Create the first
administrator there, then add departments → courses → classes → staff → students in Settings/People pages.

## Modules
| Area | Admin | Teacher | Student |
|---|---|---|---|
| Students / Staff (CRUD, deactivate, CSV bulk import + credentials export) | ✓ | view students | – |
| Departments, Courses, Classes | ✓ | – | – |
| Timetable (class + teacher views) | edit | view | view |
| Attendance (daily marking, monthly report, low-attendance flag) | ✓ | ✓ | own heat-map |
| Exams (MCQ + short answer, CSV question import, timed attempts, tab-switch log) | all | own | take |
| Grading (auto MCQ, manual short, distribution chart, publish) | ✓ | ✓ | – |
| Gradebook, manual marks, printable report cards, GPA | ✓ | ✓ | own results |
| Fees (bulk invoices, partial payments, receipts, overdue) | ✓ | – | own |
| Notice board (audience targeting, pin) | ✓ | post | read |
| Reports, Audit log, Institute profile + grading scale | ✓ | – | – |

## What changed vs. v1 (breaking)
* **Auth**: plaintext passwords and the hard-coded `Admin@123` account are gone. Firebase Auth is used;
  profiles live at `users/{uid}`. Old users must be re-created (use the CSV import for students).
* **Answer keys** are stored at `paperKeys/` (staff only); students can no longer download correct answers.
  Questions are readable by a student only after their attempt starts; the DB rules enforce the exam window,
  class membership, duration (+60 s grace) and single submission.
* Rules (`database.rules.json`) enforce roles server-side — cookies are no longer trusted.

## Performance & scalability
* Route-level code splitting; vendor chunks (react / firebase / charts) cached separately. Bootstrap, Chart.js,
  react-calendar and CRA removed.
* Indexed queries (`orderByChild + equalTo`, `limitToLast`) instead of downloading whole collections;
  `.indexOn` declared in the rules.
* Pre-aggregated counters (`stats/*`) and `attendanceDaily` keep dashboards O(1)/O(days) rather than O(users).
* Attendance is dual-written (`attendance/{class}/{date}` and `attendanceByStudent/{uid}`) in one atomic
  multi-path update, so student views never scan a class.
* Config-driven `CrudPage`, shared `DataTable`, `useList/useValue` hooks → new modules are ~50 lines.
* Firebase config moved to env vars.

## Known limits / next steps
* Grading and totals are computed client-side by staff; for tamper-proof grading and per-role custom claims,
  move them to Cloud Functions.
* RTDB suits a single institute up to a few thousand students. For multi-tenant or larger deployments,
  migrate to Firestore and namespace data per institute.
* Rotate/restrict the Firebase API key in Google Cloud Console (HTTP referrer restriction).
