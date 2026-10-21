# TeamFlow progress

- GitHub initialization: done. Repository connected; initial commit pushed to main.
- Task numbering and progress tracking: done. Checklist IDs use phase.task; update this file after each task.
- Repository housekeeping: done. Stopped tracking prompt.md; the local file stays ignored by Git.
- Phase 0, task 0.1: done. Added the project overview, user features and MVP scope in README.md.
- Phase 0, task 0.2: done. Revised docs/architecture.md with boxed HLDs, component ownership, request flows and failure recovery, following the ticket reservation project's structure.
- Phase 0, task 0.3: done. Added the database ERD, table fields, keys, membership and deletion rules, and planned V3 reliability tables in docs/architecture.md.
- Phase 0, task 0.4: done. Added API endpoints, permissions, request/response examples, errors and user flows in docs/architecture.md.
- Phase 0, task 0.5: done. Added docs/roadmap.md with all 108 checklist tasks, matching IDs/checks and version milestones.
- Phase 0, task 0.6: done. Added the experiment plan with planned commands, expected observations, measurements and recovery checks. Experiments have not run yet.
- Phase 0, task 0.7: done. Recorded the architecture review and apps/web + apps/api structure. User authorized setup through 0.9 without stopping.
- Phase 0, task 0.8: done. GitHub is connected and the approved apps/web/src/app and apps/api/src folders are tracked.
- Phase 0, task 0.9: done. Added Next.js/Tailwind frontend, Express TypeScript API, npm workspaces and setup commands. Type checks, both builds and local startup/HTTP checks passed.

- Phase 0, task 0.10: done. Connected Prisma to Supabase and created the profiles table. Added local environment setup, its example and database commands. Migration, schema validation, backend type checking/build and a Prisma read passed (0 profiles). Development uses encrypted SSL without certificate verification; full verification is documented for deployment.

- Phase 0, task 0.11: done. Added GET /health, API .env loading, PORT in the environment example, and setup instructions. Backend type checking/build passed. Health returned 200 with the example database placeholder; loading PORT from .env and overriding it through the shell both passed. Verification servers were stopped.

- Phase 0, task 0.12: done. Added Vitest and Supertest, a health endpoint test and port-validation unit tests. All 11 tests, backend type checking and production build passed. Confirmed a temporary failing assertion returns exit code 1, removed it and reran the passing suite. Added test commands at the root and in apps/api; production output excludes tests.

Next task: 0.13 — Add Docker Compose for the approved V1 local processes.
