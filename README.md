# TeamFlow

TeamFlow is a simple team task management application. Teams use it to organize workspaces, projects and tasks, discuss work through comments, and receive assignment notifications.

We are building the same application in three versions to learn backend engineering and system design. We will measure a working application first, reproduce real problems, and then measure whether Redis and RabbitMQ improve it.

## What users can do in V1

- Sign up, log in and log out using Supabase Auth.
- Create and rename workspaces, invite existing users by email, view members and remove members with permission checks.
- Create, view, rename and delete projects inside a workspace.
- Create, view, edit and delete tasks with a title and description.
- Assign tasks to workspace members and set due dates.
- Move tasks between Todo, In Progress and Done, and filter them by status.
- Add comments to tasks.
- View assignment notifications and mark them as read.
- Receive basic assignment emails through a test email provider.

Workspace membership and permissions control access to projects, tasks, comments and member management. Notifications are visible only to their recipient.

## MVP scope

The MVP is V1: a working Next.js frontend and Express API backed by Supabase PostgreSQL, Prisma and Supabase Auth. Assignment emails are sent synchronously, meaning the API request waits for the email attempt to finish.

V1 includes the features above, validation, permission checks, relevant tests and baseline performance measurements. Keep implementation inside the numbered checklist and use the simplest correct solution.

## The three versions

| Version | Infrastructure | Learning goal |
| --- | --- | --- |
| V1 | Supabase PostgreSQL and Auth | Build the working app; measure database queries, request latency and synchronous email failures. |
| V2 | Add Redis | Reproduce repeated-read costs; explore cache-aside, TTL, invalidation, rate limiting, stampedes and graceful fallback. |
| V3 | Add RabbitMQ and a separate Node.js worker | Reproduce slow and unreliable email processing; explore routing, ACK/NACK, retries, dead-letter queues, idempotency, publisher confirms, an outbox and worker scaling. |

Redis starts in V2 and RabbitMQ starts in V3. Record comparable measurements and failure experiments before and after each addition.

## Tech stack

- Frontend: Next.js, TypeScript and Tailwind CSS.
- Backend: Node.js, Express and TypeScript.
- Database and ORM: Supabase PostgreSQL and Prisma.
- Authentication: Supabase Auth.
- Infrastructure: Docker Compose; Redis in V2; RabbitMQ in V3.
- Tests and measurements: Vitest, Supertest and k6.
- Version control: Git and GitHub.

## Project status and setup

Tasks 0.1–0.10 are complete. The frontend/API scaffold uses npm workspaces: `apps/web` contains Next.js and `apps/api` contains Express. Prisma connects to Supabase PostgreSQL, and the initial `profiles` migration and database read have passed.

- [checklist.md](checklist.md): numbered tasks, test steps and acceptance criteria.
- [docs/roadmap.md](docs/roadmap.md): the complete V1/V2/V3 plan using the same task IDs and completion status.
- [docs/experiments.md](docs/experiments.md): planned problem demonstrations, commands, observations and measurements.
- [progress.md](progress.md): simple task statuses and the next task.
- `prompt.md`: local project instructions and working rules, excluded from Git.

The architecture document contains the [V1/V2/V3 HLD diagrams](docs/architecture.md#2-versioned-high-level-design), [PostgreSQL ERD](docs/architecture.md#8-postgresql-database-erd), and [API endpoints and user flows](docs/architecture.md#9-api-endpoints-and-user-flows). The [implementation roadmap](docs/roadmap.md) covers all phases; the [experiment plan](docs/experiments.md) defines how to demonstrate problems and measure changes.

The [architecture and folder review](docs/architecture.md#10-architecture-review-and-project-structure) records the setup. Each task is checked, recorded, committed and pushed separately.

## Local development

Requirements: Node.js 22.16 or newer and npm 10 or newer. Run commands from the repository root. One root lockfile manages both workspaces.

Install the locked dependencies:

```powershell
npm ci
```

Start the frontend in one terminal:

```powershell
npm run dev:web
```

Open [TeamFlow](http://127.0.0.1:3000). The initial page uses Tailwind CSS.

Start the API in another terminal:

```powershell
npm run dev:api
```

The API listens at `http://127.0.0.1:3001` and prints its startup message. At this scaffold stage, `GET /` returns Express's default `404`; the health endpoint is added in task 0.11 and resource endpoints follow their roadmap tasks. Use Ctrl+C in each terminal to stop its server.

## Build and TypeScript checks

```powershell
npm run typecheck
npm run build
```

After building, use `npm run start:web` and `npm run start:api` in separate terminals to start the production builds. The development and production scripts use the same default ports, so stop the development servers first. Set `PORT` for the API if a different port is needed.

`node_modules`, `.next`, API `dist` output and generated Next.js type files stay local and ignored. Commit package manifests and the root lockfile when dependencies change.

## Supabase PostgreSQL and Prisma (task 0.10)

Use a Supabase development project. Open **Connect → Session pooler** and copy its PostgreSQL connection string using port **5432**. This connection works over IPv4 and suits our persistent Express server. See the [Supabase Prisma guide](https://supabase.com/docs/guides/database/prisma).

If `apps/api/.env` does not exist, copy the template from the repository root:

```powershell
Copy-Item apps/api/.env.example apps/api/.env
```

In `apps/api/.env`, replace `DATABASE_URL` with the connection string and fill in your database password. URL-encode special characters in the password. Keep credentials in this local file; Git ignores it. This database URL belongs to the backend. It is different from the Supabase project URL and browser API key used by authentication later.

For local development, keep the template's `sslmode=require&uselibpqcompat=true` query parameters. This requires an encrypted connection and uses the PostgreSQL driver's libpq-compatible SSL behavior; it does not verify the server certificate. No certificate download is needed for this development setup.

For deployment, download the root certificate from **Database → Settings → SSL Configuration**, save it as `apps/api/supabase-ca.crt`, and replace both development parameters with `sslmode=verify-full&sslrootcert=supabase-ca.crt`. The npm commands below run inside the API workspace, where this relative certificate path resolves. The certificate stays local and ignored. See [Supabase's SSL instructions](https://supabase.com/docs/guides/database/connecting-to-postgres#connecting-with-ssl).

Run from the repository root:

```powershell
npm run db:generate
npm run db:validate
npm run db:migrate
npm run db:status
npm run db:check
```

Or, from `apps/api`, use the same five commands. The root scripts forward them to the API workspace.

| Command | Purpose |
| --- | --- |
| `db:generate` | Generate TypeScript Prisma Client from `prisma/schema.prisma`; no database connection is needed. |
| `db:validate` | Check the Prisma schema. |
| `db:migrate` | Apply committed SQL migrations using `prisma migrate deploy`. |
| `db:status` | Show whether committed migrations have been applied. |
| `db:check` | Read the `profiles` table through Prisma and print its row count without user details or credentials. |

The initial migration creates `public.profiles`, with UUID IDs referencing Supabase's existing `auth.users`, unique normalized emails, an optional display name and timestamps. Open **Table Editor → public → profiles** in Supabase to see it. It starts empty; authentication tasks will synchronize real users into profiles.

The migration enables RLS and removes direct access for browser roles. Express will use its server database connection and apply application permission checks. Prisma does not manage Supabase's Auth tables. The Auth foreign key, email check and access rules are custom SQL: preserve them in later migrations.

To recreate this application schema, point `.env` at another fresh Supabase development project and run `db:migrate`, then `db:check`. These commands apply migration files without a shadow database or resetting existing data. An existing database with conflicting application tables needs a migration baseline first. For future schema changes, review a new SQL migration before applying it; do not use `db push` or reset the hosted project. See [Prisma's migration command behavior](https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/development-and-production).

Prisma CLI, Client and the PostgreSQL adapter use the same Prisma 7 version. The generated client lives in `apps/api/src/generated/prisma` and stays ignored. Dependency installation generates it automatically. The API uses one shared Prisma Client with at most five database connections; later route modules will import it from `src/lib/prisma.ts`.
