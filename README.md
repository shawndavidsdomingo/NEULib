<div align="center">

# 📚 NEU Library Portal

**A full-stack, real-time visitor management system for the New Era University Library.**
*No more paper logbooks. No more guessing who's inside. Just tap in, learn, tap out.*

[![Live on Firebase](https://img.shields.io/badge/🔥%20Live%20on%20Firebase-shawnitzkydavidson--neu--library.web.app-orange?style=for-the-badge)](https://shawnitzkydavidson-neu-library.web.app/)
[![Live on Vercel](https://img.shields.io/badge/▲%20Live%20on%20Vercel-shawndavidsdomingo--neu--library.vercel.app-black?style=for-the-badge)](https://shawndavidsdomingo-neu-library.vercel.app/)

[![Next.js](https://img.shields.io/badge/Next.js-15.5-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![Firebase](https://img.shields.io/badge/Firebase-11-orange?style=flat-square&logo=firebase)](https://firebase.google.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38B2AC?style=flat-square&logo=tailwind-css)](https://tailwindcss.com/)
[![Gemini AI](https://img.shields.io/badge/Gemini-AI%20Insights-4285F4?style=flat-square&logo=google)](https://ai.google.dev/)

> **2026 Information Management 2 — Midterm Project**
> New Era University · College of Informatics and Computing Studies

</div>

---

## What is this?

The **NEU Library Portal** replaces the humble paper logbook with a living, breathing digital system. Students tap in with their ID or Google account, pick why they're here, and go. Admins get real-time dashboards, AI-generated insights, exportable reports, and the ability to manage everything — from who's blocked to what visit purposes appear on the kiosk — without ever touching a spreadsheet.

It runs as a **serverless static app**: Next.js exports to static files, Firebase handles all real-time data, and Vercel/Firebase Hosting serves it to the world. Zero custom backend. Zero maintenance headaches.

---

## Live Deployments

| Platform | URL |
|---|---|
| 🔥 Firebase Hosting | https://shawnitzkydavidson-neu-library.web.app/ |
| ▲ Vercel | https://shawndavidsdomingo-neu-library.vercel.app/ |

---

## Feature Overview

### For Students
| | Feature | What it does |
|---|---|---|
| 🖥️ | **Self-Service Kiosk** | Tap in/out with your Student ID or `@neu.edu.ph` Google account |
| 📊 | **Personal Analytics** | See your visit history, study hours, streaks, and purpose breakdown |
| 📬 | **Message Inbox** | Receive missed tap-out notifications with a one-click "I Already Left" fix |
| 🔁 | **Credential Requests** | Request name, ID, or department changes directly from the portal |
| 🔓 | **Unblock Requests** | If blocked, submit an unblock request with your reason for admin review |

### For Admins & Staff
| | Feature | What it does |
|---|---|---|
| 👁️ | **Live Presence** | See exactly who is inside the library right now, in real time |
| 📋 | **Registry** | Full student database — search, filter, block, unblock, import via CSV |
| 📁 | **Log History** | Browse all session records and blocked access attempts with full filtering |
| 📄 | **Reports Hub** | Generate PDF and CSV reports filtered by date, department, and purpose |
| 🤖 | **AI Insights** | Gemini-powered trend analysis of your library traffic data |
| 📨 | **Missed Tap-Out Management** | Notify students who forgot to check out, individually or in bulk |
| ✅ | **Credential Request Review** | Approve or revoke student credential change requests with a full audit trail |
| 🔔 | **Pending Visitor Approvals** | Approve new `@neu.edu.ph` registrations before they can use the kiosk |

### For Super Admins (+ everything above)
| | Feature | What it does |
|---|---|---|
| 👥 | **Staff Access Management** | Promote students to staff, revoke access, register new admin accounts |
| 🏛️ | **Department Management** | Add and manage NEU college departments live from the dashboard |
| 🎯 | **Purpose Management** | Control what visit reasons appear on the kiosk in real time |
| 🔍 | **Audit Log** | Every admin action ever taken, with actor, target, timestamp, and detail |

---

## Tech Stack

### Frontend
| Technology | Version | Role |
|---|---|---|
| [Next.js](https://nextjs.org/) | 15.5 | React framework, App Router, static export |
| [React](https://react.dev/) | 19.2 | UI rendering |
| [TypeScript](https://www.typescriptlang.org/) | 5 | Type safety across the codebase |
| [Tailwind CSS](https://tailwindcss.com/) | 3.4 | Utility-first styling |
| [shadcn/ui](https://ui.shadcn.com/) | — | Radix-based accessible component library |
| [Lucide React](https://lucide.dev/) | 0.475 | Icons |
| [Recharts](https://recharts.org/) | 2.15 | Interactive data visualization |
| [date-fns](https://date-fns.org/) | 3.6 | Date parsing and formatting |
| [jsPDF](https://github.com/parallax/jsPDF) + [autotable](https://github.com/simonbengtsson/jsPDF-AutoTable) | 2.5 / 3.8 | PDF report generation |

### Backend & Infrastructure
| Technology | Version | Role |
|---|---|---|
| [Firebase Auth](https://firebase.google.com/docs/auth) | 11.10 | Google SSO with `@neu.edu.ph` domain gating |
| [Cloud Firestore](https://firebase.google.com/docs/firestore) | 11.10 | Real-time NoSQL database |
| [Firebase Genkit](https://firebase.google.com/docs/genkit) | 1.28 | AI orchestration framework |
| [Google Gemini](https://ai.google.dev/) | 1.5 Flash / Pro | AI-generated visit summaries |
| [Vercel](https://vercel.com/) + [Firebase Hosting](https://firebase.google.com/docs/hosting) | — | Deployment platforms |

---

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│            Static Export (Vercel / Firebase Hosting)        │
│            Next.js 15 · App Router · TypeScript            │
└─────────────────────────┬──────────────────────────────────┘
                          │ HTTPS
          ┌───────────────┴───────────────┐
          │                               │
   ┌──────▼──────┐                ┌───────▼───────┐
   │  Firebase   │                │  Google Gemini│
   │    Auth     │                │  via Genkit   │
   │  Firestore  │                │  AI Insights  │
   └──────┬──────┘                └───────────────┘
          │ onSnapshot (real-time listeners)
   ┌──────▼──────────────────────────────────────┐
   │             Firestore Collections            │
   │                                              │
   │  /users              /library_logs           │
   │  /blocked_attempts   /departments            │
   │  /programs           /visit_purposes         │
   │  /credential_requests /audit_logs            │
   │  /notifications                              │
   └──────────────────────────────────────────────┘
```

The app uses **real-time Firestore listeners** (`onSnapshot`) for all live data via custom `useCollection` and `useDoc` hooks. All writes use a **non-blocking fire-and-forget pattern** to keep the UI responsive. A global `FirebaseErrorListener` catches Firestore permission errors and surfaces them to the user cleanly.

---

## Project Structure

```
src/
├── app/
│   ├── page.tsx                    # Main router — handles all view transitions
│   ├── layout.tsx                  # Root layout with background image + fonts
│   ├── globals.css                 # Global styles and custom utility classes
│   └── api/ai-summary/route.ts     # Server route for AI visit summary (Vercel)
│
├── components/
│   ├── terminal/
│   │   └── TerminalView.tsx        # Visitor kiosk check-in/out terminal
│   ├── student/
│   │   ├── StudentDashboard.tsx    # Student personal portal
│   │   └── RegistrationPage.tsx    # New visitor registration flow
│   ├── admin/
│   │   ├── UnifiedAdminDashboard.tsx  # Single dashboard for staff + super admin
│   │   ├── OverviewDashboard.tsx      # KPI cards, charts, live feed
│   │   ├── CurrentVisitors.tsx        # Live presence table
│   │   ├── LogHistory.tsx             # Session archive + blocked attempts
│   │   ├── UserManagement.tsx         # Student registry with pagination
│   │   ├── ReportModule.tsx           # PDF/CSV report generator + AI insights
│   │   ├── CredentialRequestsTab.tsx  # Credential change request review
│   │   ├── AuditLogTab.tsx            # Immutable admin action log
│   │   ├── AdminAccessManagement.tsx  # Staff role management
│   │   ├── DepartmentManagement.tsx   # College/dept CRUD
│   │   ├── PurposeManagement.tsx      # Visit purpose CRUD
│   │   ├── TemporaryVisitorManagement.tsx  # Pending visitor approvals
│   │   └── MissedTapOutTab.tsx        # Missed tap-out notifications
│   ├── LiveClock.tsx               # Real-time digital clock
│   └── FirebaseErrorListener.tsx   # Global Firestore error handler
│
├── firebase/
│   ├── index.ts                    # Firebase app initialization
│   ├── provider.tsx                # FirebaseProvider context
│   ├── firestore/
│   │   ├── use-collection.tsx      # Real-time collection hook (onSnapshot)
│   │   └── use-doc.tsx             # Real-time document hook
│   └── non-blocking-updates.tsx    # Fire-and-forget write helpers
│
├── lib/
│   ├── firebase-schema.ts          # All TypeScript interfaces + DEPARTMENTS + PROGRAMS
│   ├── firestore-ids.ts            # Deterministic Firestore document ID generators
│   └── audit-logger.ts             # writeAuditLog() — called on every admin action
│
└── ai/
    ├── genkit.ts                   # Genkit + Google AI initialization
    └── flows/
        └── ai-powered-visit-summary-flow.ts  # Gemini AI flow definition
```

---

## User Roles

```
Role          Access Level             Where they go
─────────────────────────────────────────────────────────────────
student       Standard user            Student Portal
visitor       Pending registration     Registration flow
admin         Library staff            Admin Dashboard (staff tabs)
super_admin   Full system access       Admin Dashboard (all tabs)
```

### Role Routing

```
Google Login (@neu.edu.ph)
         │
         ▼
  Lookup /users by email
         │
         ├─ super_admin ──────► Admin Console (all tabs)
         ├─ admin ─────────────► Admin Console (staff tabs)
         ├─ student ───────────► Student Portal
         ├─ visitor ───────────► Visitor Dashboard (pending)
         └─ not found ─────────► Registration flow
```

### Admin vs Super Admin

| Capability | Staff | Super Admin |
|---|:---:|:---:|
| View dashboards & analytics | ✅ | ✅ |
| Manage student registry | ✅ | ✅ |
| Approve pending visitors | ✅ | ✅ |
| Generate PDF/CSV reports | ✅ | ✅ |
| Notify students (missed tap-out) | ✅ | ✅ |
| Review credential requests | ✅ | ✅ |
| Delete logs or user records | ❌ | ✅ |
| Manage staff access / promote roles | ❌ | ✅ |
| Manage departments & programs | ❌ | ✅ |
| Manage visit purposes (kiosk) | ❌ | ✅ |
| View audit log | ❌ | ✅ |

---

## Firestore Data Schema

All users share a **single unified collection** (`/users`). Document IDs are student/staff IDs — not Firebase UIDs.

### `/users/{studentId}`
```typescript
interface UserRecord {
  id:          string;    // Doc ID = student/staff ID (e.g. "24-12864-480")
  firstName:   string;
  middleName?: string;
  lastName:    string;
  email:       string;    // @neu.edu.ph
  role:        'student' | 'admin' | 'super_admin' | 'visitor';
  status:      'active' | 'pending' | 'blocked';
  deptID?:     string;    // e.g. "CICS"
  program?:    string;    // e.g. "BSIT"
  addedAt?:    string;    // ISO timestamp
}
```

### `/library_logs/{logId}`
```typescript
interface LibraryLogRecord {
  studentId:           string;  // Foreign key → /users
  studentName:         string;  // Denormalized snapshot
  deptID:              string;
  program?:            string;
  purpose:             string;
  checkInTimestamp:    string;  // ISO 8601
  checkOutTimestamp?:  string;  // Absent if still inside
}
```

### `/blocked_attempts/{id}`
```typescript
// Written whenever a blocked user attempts entry
{
  studentId:   string;
  studentName: string;
  deptID:      string;
  program?:    string;
  timestamp:   string;  // ISO 8601
}
```

### `/credential_requests/{reqId}`
```typescript
interface CredentialRequest {
  studentId:    string;
  studentName:  string;
  email:        string;
  type:         'name' | 'student_id' | 'dept_program' | 'admin_privilege' | 'unblock_request';
  status:       'pending' | 'pending_verification' | 'approved' | 'revoked';
  current:      Record<string, string>;   // Fields before change
  requested:    Record<string, string>;   // What the student wants
  reason:       string;
  requiresVerification?: boolean;         // true for ID, dept, name, admin_privilege
  verified?:    boolean;                  // Toggled after physical check at admin office
  adminNote?:   string;                   // Revocation reason
  createdAt:    string;
  updatedAt:    string;
}
```

### `/audit_logs/{logId}`
```typescript
interface AuditLogRecord {
  action:      string;    // e.g. 'user.block', 'role.promote', 'user.unblock'
  actorId:     string;    // Firebase UID of admin who acted
  actorName:   string;
  actorEmail:  string;
  targetId?:   string;
  targetName?: string;
  detail?:     string;    // Human-readable description
  timestamp:   string;    // ISO 8601
}
```

**Audit action types:** `user.block` · `user.unblock` · `user.delete` · `user.edit` · `user.add` · `user.import` · `role.promote` · `role.demote` · `role.toggle_super` · `staff.add` · `staff.revoke` · `notification.send` · `dept.add` · `dept.delete` · `purpose.add` · `purpose.delete` · `purpose.toggle`

### Supported Departments (16 NEU Colleges)

| Code | College |
|---|---|
| LIBRARY | Library |
| ABM | College of Accountancy |
| CAS | College of Arts and Sciences |
| CBA | College of Business Administration |
| CICS | College of Informatics and Computing Studies |
| CRIM | College of Criminology |
| CED | College of Education |
| CEA | College of Engineering and Architecture |
| CON | College of Nursing |
| CMT | College of Medical Technology |
| COC | College of Communication |
| CPT | College of Physical Therapy |
| CRT | College of Respiratory Therapy |
| COMS | College of Music |
| COM | College of Midwifery |
| COA | College of Agriculture |
| SOIR | School of International Relations |

---

## Security Rules

**File:** `firestore.rules`

Because Firestore doc IDs are student IDs (not Firebase UIDs), server-side role lookups by UID are not possible without a mirror collection. Security is handled at two levels:

1. **Firestore Rules** — institutional email gating, owner override, create-only audit logs
2. **UI-layer RBAC** — finer-grained controls (e.g. only super admins see Staff Access tab)

```
Collection              Read                      Write
──────────────────────────────────────────────────────────────────────
/users                  Any authenticated user    NEU email · owner · self
/library_logs           Any signed-in user        Any authenticated user
/blocked_attempts       NEU email · owner         Any signed-in user (create)
                                                  NEU email · owner (update)
/departments            Public                    NEU institutional email
/programs               Public                    NEU institutional email
/visit_purposes         Public (kiosk anon.)      NEU institutional email
/credential_requests    NEU email · owner         Students (create) · NEU (update)
/audit_logs             NEU institutional email   Auth users (create only — immutable)
/notifications          Any signed-in user        Any authenticated user
```

---

## Smart Logic

### Missed Tap-Out Detection

No scheduled jobs or cloud functions needed. A session is classified as **No Tap** purely at render time:

```typescript
const isNoTap = !log.checkOutTimestamp && !isToday(parseISO(log.checkInTimestamp));
```

### Midnight Cut-off

When a student taps in on a new day and has a stale open session from yesterday, the system doesn't try to close it — it **starts a fresh session** and leaves the old one permanently flagged as No Tap. Historical data stays intact.

### ID Change Cascade

When an ID change request is approved, the system atomically:
1. Copies the user doc to the new ID, deletes the old one
2. Updates `studentId` on all `library_logs` records
3. Updates `studentId` on all `blocked_attempts` records
4. Updates `studentId` on all `credential_requests` records

The cascade always queries by both `req.studentId` (the numeric ID) AND `actualDocId` (the Firestore doc key) to handle all storage patterns.

### Visit Streak Gamification

The Student Portal shows two streak counters computed entirely client-side:

- **Current Streak** — consecutive calendar days ending today or yesterday with at least one completed visit
- **Best Streak** — the longest such run in the student's full history

Stale no-tap sessions are excluded from streak calculations.

### Blocked User Intercept

When a blocked student taps in, the system first checks for an active session. If they have one open (they were blocked while inside), a **persistent modal** appears instructing them to contact the admin — no auto-dismiss. If they're not inside, a 5-second countdown dismisses the blocked entry alert automatically.

---

## AI Integration

**Files:** `src/ai/genkit.ts` · `src/app/api/ai-summary/route.ts`

The AI Insights button in the Reports Hub sends up to 50 session records to a **Gemini-powered Genkit flow** that returns a scholarly trend analysis: peak hours, top departments, common purposes, and actionable library insights.

### Model Fallback Chain
```
gemini-2.0-flash-exp  →  gemini-1.5-flash  →  gemini-1.5-pro
```

### Statistical Fallback (always available)

If all models fail — key not set, quota exceeded, network error — the system instantly falls back to a **client-side statistical summary** with no API call:

- Peak activity hour
- Most common visit purpose
- Most active department
- Unique student count
- Average completed session duration

The AI Insights button **always produces output**. It never fails silently.

### API Key Security

The Gemini key is **server-side only**. Never prefix it with `NEXT_PUBLIC_`.

```bash
# .env.local (git-ignored)
GEMINI_API_KEY=your_key_here
```

Set this in Vercel → Settings → Environment Variables for production.

---

## PDF Reports

Three report templates, each generated fully client-side with **jsPDF + autotable**:

| Template | Triggered by | Accent color | Contents |
|---|---|---|---|
| **Activity & Engagement** | ACTIVE filter | Gold | KPI cards, attendance trend chart, session archive table |
| **Restricted Access & Violation** | BLOCKED filter | Red | Denied attempt stats, violation log table |
| **Comprehensive Operations** | ALL filter | Navy | Combined KPIs, stacked traffic chart, unified session + blocked table |

All templates include the NEU logo (loaded from `/public/neu-logo.png`), date range header, filter context, and page numbers.

---

## Design System

### Colors

| Token | Value | Usage |
|---|---|---|
| Navy | `hsl(221, 72%, 22%)` | Primary — buttons, active states, headings |
| Gold | `hsl(43, 85%, 55%)` | Accent — highlights, badges, pagination active |
| Emerald | `#059669` | Success states |
| Red | `hsl(0, 72%, 51%)` | Destructive — errors, blocked states |
| Amber | `hsl(38, 90%, 48%)` | Warnings — missed tap-outs, pending states |

### Typography

| Font | Usage |
|---|---|
| Playfair Display | All headings |
| DM Sans | Body text, UI elements |
| DM Mono | IDs, timestamps, code |

### Background

A fixed full-viewport photo of the NEU Library (`neulibrary.jpg`) with a navy gradient overlay sits at `z-index: -50` across all views, giving the app its distinctive look.

---

## Pagination

All five data-heavy admin tables have consistent **rows-per-page + page navigation**:

- Presets: **25 · 50 · 100**
- **Custom**: prompt accepts any value 10–500
- Active page highlighted in **gold**
- Page change scrolls smoothly back to top
- Tables: Live Presence · Log History (Sessions + Blocked) · Registry · Requests · Audit Log

---

## Local Development

### Prerequisites
- Node.js 20+
- npm
- Firebase CLI (for deploying rules): `npm install -g firebase-tools`

### Setup

```bash
# 1. Clone
git clone https://github.com/shawndavidsdomingo/NEULib.git
cd NEULib

# 2. Install dependencies
npm install

# 3. Create environment file
cp .env.example .env.local
# Fill in Firebase config and Gemini API key

# 4. Start dev server (Turbopack, port 9002)
npm run dev
```

Open [http://localhost:9002](http://localhost:9002)

### Scripts

| Command | Description |
|---|---|
| `npm run dev` | Dev server with Turbopack on port 9002 |
| `npm run build` | Production static export to `/out` |
| `npm run lint` | ESLint check |
| `npm run typecheck` | TypeScript check without emit |
| `npm run genkit:dev` | Start Genkit developer UI |

### Deploy Firestore Rules

```bash
firebase login
firebase deploy --only firestore:rules
```

---

## Environment Variables

```env
# Firebase (safe to expose — restrict in Google Cloud Console to your domain)
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

# Gemini AI (server-side only — NEVER prefix with NEXT_PUBLIC_)
GEMINI_API_KEY=
```

---

## Known Limitations

- **Static export + API routes** — The `/api/ai-summary` route requires server-side rendering. On GitHub Pages (static only), AI calls run client-side with the statistical fallback. Full AI works on Vercel.
- **RFID simulation** — The kiosk uses a text input to simulate RFID scanning. Physical hardware integration requires a separate RFID reader bridge.
- **No push notifications** — Student notifications are in-app only; students must open the portal to see them.
- **Firestore UID mismatch** — Doc IDs are student IDs, not Firebase UIDs, which limits server-side role lookups in security rules. Fine-grained write controls rely on institutional email matching instead.

---

## Changelog

### v0.3 — Pagination & Reports Overhaul
- ✅ Pagination (25/50/100/Custom) on all 5 admin tables with gold active state + scroll-to-top
- ✅ Three-template PDF engine — Activity (gold), Violations (red), Comprehensive (navy)
- ✅ NEU logo embedded in PDF headers from `/public/neu-logo.png`
- ✅ Reports Hub two-column layout: filters left, Top Visitors right (Top 5, always visible)
- ✅ AI Insights panel renders below filters as a full-width card, doesn't disrupt layout

### v0.2 — Credential Requests & Security
- ✅ Credential request system — name, student ID, dept/program, admin privilege, unblock
- ✅ All request types require physical verification (`requiresVerification: true`)
- ✅ ID change cascade — syncs `library_logs`, `blocked_attempts`, `credential_requests` on approval
- ✅ Firestore rule fix — `blocked_attempts` updates now permitted for NEU admins (enables ID cascade)
- ✅ Blocked users can only access "Request Unblock" in the Contact Admin form
- ✅ `unblock_request` type — admin can approve directly from Requests tab, sets `status: 'active'`
- ✅ Cascade bug fix — queries both `req.studentId` and `actualDocId` to handle all storage patterns

### v0.1 — Initial Institutional Release
- ✅ Visitor kiosk with RFID simulation and Google Login
- ✅ Smart check-in/check-out with midnight cut-off logic
- ✅ Student Portal — visits, analytics, streaks, message inbox
- ✅ Blocked user intercept — persistent modal if blocked while inside
- ✅ Unified Admin Dashboard (staff + super admin in one component)
- ✅ Live Presence, Log History (Sessions + Blocked tabs), Registry, Reports
- ✅ AI-powered insights (Genkit + Gemini) with statistical fallback
- ✅ Audit Log — every admin action, immutable, timestamped
- ✅ Staff Access Management, Department Management, Purpose Management
- ✅ Bulk CSV student import
- ✅ Responsive layout with mobile bottom navigation

---

## License

© 2026 New Era University Library. All Rights Reserved.
Developed for institutional use at New Era University, No. 9 Central Avenue, Quezon City, Philippines.

---

<div align="center">

*Built with ❤️ for the NEU Library — bridging physical presence with digital intelligence.*

**[🔥 Firebase](https://shawnitzkydavidson-neu-library.web.app/) · [▲ Vercel](https://shawndavidsdomingo-neu-library.vercel.app/)**

</div>
