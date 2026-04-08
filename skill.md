# TeamOS MVP — Project Standards

## Stack
- React 19 (CRA + CRACO)
- Tailwind CSS + shadcn/ui
- FastAPI (Python)
- MongoDB (Motor async)
- WebSocket (native)
- Emergent Object Storage
- Emergent LLM Key (Claude Sonnet 4.5)

## Coding Standards
- Modular monolith only (no microservices)
- Role-aware layouts: super_admin | hod | worker
- MongoDB: always use `{"_id": 0}` projection
- All users identified by custom `user_id` (UUID)
- JWT auth (cookies) + Google OAuth (session_token cookies)
- Both auth methods handled in `get_current_user`
- API prefix: all backend routes under `/api`
- Frontend: always `withCredentials: true` for API calls
- `data-testid` on all interactive elements

## Product Rules
- Max hierarchy depth = 3 (Super Admin → HOD → Worker)
- Startup TeamOS use case (internal)
- Founder-first dashboard UX (Super Admin sees all)
- HOD workflow isolation (dept-scoped)
- Worker private workspace (personal kanban)
- No multi-tenant complexity
- Mobile responsive (lg: breakpoint for sidebar)

## Architecture Decisions
- Auth: JWT (15min access, 7d refresh) + Google OAuth session_token (7d)
- Storage: Emergent Object Storage (no direct URLs, all via backend)
- AI: Claude Sonnet 4.5 via Emergent LLM key
- WS: FastAPI native WebSocket per user_id
- Seed data: 10 users, 3 departments, 20 tasks, 3 meetings
