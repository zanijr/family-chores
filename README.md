Family Chores App

Overview
A full-stack app to manage family chores with rewards. Includes:
- Node.js/Express API with JWT auth (parent/child roles)
- MySQL database (Dockerized)
- Frontend (simple.html + Alpine app) with mobile-first UI
- Recurring chores, photo submissions, approvals
- Backups and scheduled jobs

Repository
Target GitHub repo: https://github.com/zanijr/family-chores

Quick Start (Docker)
1) Prerequisites
- Docker and Docker Compose installed

2) Environment
- Copy .env.example to .env and update values (JWT_SECRET, DB creds, etc.)

3) Run
docker-compose up -d --build

4) Open
- App: http://localhost:3000
- API: http://localhost:3000/api
- Health: http://localhost:3000/health

Login and Registration
- Register a family (admin/parent account) from the UI.
- Login supports email + password (family code required only on registration or when an email exists in multiple families).

Key API Endpoints
- Auth: POST /api/auth/register, POST /api/auth/login, GET /api/auth/verify
- Users: GET /api/users/family/members, GET /api/users/me/chores
- Chores: CRUD under /api/chores, assignment/accept/decline/submit/approve/reject
- Recurring: /api/recurring and /api/recurring/generate
- Backups: /api/backups

Project Structure
api/               Node/Express API
api/routes/        Route handlers
api/middleware/    Auth, logging, error handling
api/utils/         backup, scheduler, notifications
database/          init and updates SQL
frontend/          simple front-end (simple.html) and Alpine app (index.html + app.js)
nginx/             reverse proxy configuration
uploads/           runtime uploads (gitignored)
api/backups/       runtime backups (gitignored)

Open Tasks (tracked in memory-bank/progress.md)
- Make auto-assigned single chores start as pending_acceptance (actionable for kids)
- Add endpoint and UI to group chores by member for parents
- Finalize login-by-email-only flow with fallback to family-code prompt on duplicates
- Add landing page at / with “Welcome” and “Get Started” CTA

Development
- API: cd api && npm install && npm run start
- Frontend: served by nginx in Docker (or open frontend/simple.html directly for static testing)

Environment and Secrets
- .env is required and not checked in (see .gitignore). Use .env.example as a starting point.

Contributing
- PRs welcome. Use a feature branch, commit with conventional messages when possible, and open a PR.

License
MIT (optional; update as needed)
