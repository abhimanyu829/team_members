# WorkOS Enterprise Platform — PRD

## Project Overview
A startup TeamOS MVP — a Workforce Operating System with 8 modules:
auth, hierarchy, departments, tasks, notifications, files, analytics, meetings + AI Copilot.

## Architecture
- **Frontend**: React 19, Tailwind CSS, shadcn/ui, Recharts, Lucide React
- **Backend**: FastAPI, MongoDB (Motor), JWT + Google OAuth auth
- **AI**: Claude Sonnet 4.5 (Emergent LLM Key)
- **Storage**: Emergent Object Storage
- **Realtime**: Native WebSocket per user

## User Personas
1. **Super Admin** (founder/CEO): Sees entire org, all KPIs, manages departments
2. **HOD** (Head of Department): Manages team tasks, members, dept analytics
3. **Worker**: Personal kanban, my tasks, meetings, AI copilot

## Core Requirements (Static)
- Multi-role authentication (JWT + Google OAuth)
- 3-level org hierarchy (Super Admin → HOD → Worker)
- Kanban task board with drag-and-drop
- Real-time notifications via WebSocket
- File upload/download (Object Storage)
- Meeting calendar
- AI Copilot (Claude Sonnet 4.5)
- Analytics & KPI cards per role

## What's Been Implemented (Phase 1 - MVP)
Date: Feb 2026

### Backend (server.py)
- Auth: JWT (email/password) + Google OAuth (Emergent-managed)
- Users CRUD with role management
- Departments CRUD with HOD assignment
- Tasks CRUD with status, priority, assignee, sprint, due_date
- Task comments
- Notifications (CRUD + real-time via WebSocket)
- File upload/download (Emergent Object Storage)
- Analytics: KPIs, task-by-status, dept comparison
- Meetings CRUD with attendees
- AI Copilot (Claude Sonnet 4.5 via emergentintegrations)
- WebSocket connection manager per user_id
- Seed data: 10 users, 3 depts, 20 tasks, 3 meetings

### Frontend
- Login/Register page (JWT + Google OAuth)
- Auth callback (Google OAuth flow)
- Super Admin Dashboard (KPIs, org tree, dept comparison chart, recent tasks)
- HOD Dashboard (team management, dept analytics, task creation)
- Worker Dashboard (personal kanban, meetings, AI copilot)
- Tasks Page (full kanban board with HTML5 drag-and-drop)
- Files Page (upload, list, download)
- Meetings Page (calendar view, create meeting)
- Settings Page (profile management)
- AI Copilot (Claude Sonnet 4.5 chat panel)
- Notifications Panel (real-time via WebSocket)
- Role-based sidebar navigation
- Responsive layout

## Test Credentials
See /app/memory/test_credentials.md

## Prioritized Backlog

### P0 (MVP — Done)
- [x] Auth (JWT + Google)
- [x] Role-based dashboards
- [x] Kanban task board
- [x] AI Copilot
- [x] File management
- [x] Meeting calendar
- [x] Notifications

### P1 (Next Phase)
- [ ] Sprint velocity charts
- [ ] Task DAG (dependencies/blockers)
- [ ] HOD-Worker direct messaging
- [ ] Email notifications
- [ ] Task due date reminders
- [ ] Department-level file organization

### P2 (Future)
- [ ] Multi-tenant support
- [ ] Advanced RBAC/ABAC
- [ ] Payroll integration
- [ ] Custom KPI formulas
- [ ] Zapier/webhook integration
- [ ] Mobile app (React Native)
