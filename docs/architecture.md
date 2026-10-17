# TeamFlow — Architecture and data flow plan

This Phase 0 design contains the HLD for task **0.2**, database ERD for task **0.3**, API plan for task **0.4**, and architecture/file-structure review for task **0.7**. PostgreSQL owns application data; Redis holds temporary copies; RabbitMQ delivers background work.

HLD mein hum system ke main parts, unki responsibility aur unke connections samajhte hain. Section 8 contains the ERD; section 9 contains the API endpoints and user flows.

## 1. System context and ownership

A team member uses the Next.js frontend to work with workspaces, projects, tasks, comments and notifications. Supabase Auth identifies the user; the Express API decides whether that user may perform an action.

| Component | Responsibility | Introduced |
| --- | --- | --- |
| Next.js frontend | Forms, pages, session handling and API requests | V1 |
| Supabase Auth | Signup, login and authentication identities | V1 |
| Express API | Token verification, input validation, workspace permissions and business rules | V1 |
| Prisma | Database queries and transactions inside the API and, later, worker | V1 |
| Supabase PostgreSQL | Persistent application data and, later, outbox records | V1 |
| Test email provider | Receive assignment emails during development | V1 |
| Redis | Cached dashboard reads and shared rate-limit counters | V2 |
| RabbitMQ | Exchange, routing, email queue, retries and dead-letter queue | V3 |
| Node.js worker | Outbox publishing and background email processing | V3 |

Workspaces, projects, tasks, comments and notifications are responsibilities inside one Express application. The worker is another process from the same project, using the same database and event definitions.

Frontend route guards improve navigation; the API still verifies every protected request. Database and provider credentials stay on the backend.

## 2. Versioned high-level design

### 2.1 V1 — PostgreSQL application

```text
+--------------------------------+       +------------------------+
| Browser: Next.js frontend      | <---> | Supabase Auth          |
| Pages, forms and session       | login | Signup and login       |
+--------------------------------+       +------------------------+
                |
                | HTTPS request + access token
                v
+-----------------------------------------------------------------+
| Express API - one application                                   |
|                                                                 |
| Verify token -> validate input -> check workspace permission    |
| Workspaces | Projects | Tasks | Comments | Notifications        |
| Prisma transactions | Synchronous email                         |
+-----------------------------------------------------------------+
                |                                     |
       Prisma read / write                Wait for email attempt
                v                                     v
+--------------------------------+       +------------------------+
| Supabase PostgreSQL            |       | Test email provider    |
| Persistent application data    |       | Assignment emails      |
+--------------------------------+       +------------------------+
```

The API verifies the token through the Supabase Auth integration before applying workspace permissions. Application reads go to PostgreSQL. Assignment requests save the task change and in-app notification, then attempt email before returning.

**Learning goal:** Observe repeated database work and synchronous email delays in a working application. V1 mein pehle normal app banayenge aur actual problems measure karenge.

### 2.2 V2 — Add Redis

```text
+--------------------------------+       +------------------------+
| Browser: Next.js frontend      | <---> | Supabase Auth          |
| Pages, forms and session       | login | Signup and login       |
+--------------------------------+       +------------------------+
                |
                | HTTPS request + access token
                v
+-----------------------------------------------------------------+
| Express API - same application                                  |
| Token checks | Validation | Workspace permissions               |
| Prisma | Cache-aside | Invalidation | Rate limiting             |
+-----------------------------------------------------------------+
          |                         |                      |
    Cache / TTL              Writes / reads          Sync email
    Rate limits              Miss / outage
          v                         v                      v
+-------------------+   +------------------------+   +------------+
| Redis             |   | Supabase PostgreSQL    |   | Test email |
| Temporary cache   |   | Authoritative data     |   | provider   |
| Rate-limit state  |   |                        |   |            |
+-------------------+   +------------------------+   +------------+
```

Authorization happens before cached data is returned. The API uses Redis for selected reads and rate limiting; PostgreSQL continues to store the application data. Emails still run synchronously.

**Learning goal:** Measure whether Redis reduces the observed repeated-read cost, then test expiry, invalidation, simultaneous misses and outages.

### 2.3 V3 — Add RabbitMQ and a separate worker

```text
+--------------------------------+       +------------------------+
| Browser: Next.js frontend      | <---> | Supabase Auth          |
| Pages, forms and session       | login | Signup and login       |
+--------------------------------+       +------------------------+
                |
                | HTTPS request + access token
                v
+-----------------------------------+     +-----------------------+
| Express API - same application    | <-> | Redis                 |
| Permissions | Prisma transactions |     | Cache and rate limits |
+-----------------------------------+     +-----------------------+
                |
                | Reads and writes; assignment + notification + outbox
                | saved in one transaction.
                v
+-----------------------------------------------------------------+
| Supabase PostgreSQL                                             |
| Application data | Outbox events | Processing records           |
+-----------------------------------------------------------------+
                ^
                | Claim pending events; record confirmed publication.
                v
+-----------------------------------------------------------------+
| Separate Node.js worker process                                 |
| Outbox publisher loop                                           |
+-----------------------------------------------------------------+
                |
                | Publish event; wait for broker confirmation.
                v
+-----------------------------------------------------------------+
| RabbitMQ                                                        |
| Task events exchange -> routing key + binding -> Email queue    |
| Retry queues | Dead-letter queue                                |
+-----------------------------------------------------------------+
                |
                | Deliver event; worker ACKs successful processing.
                v
+-----------------------------------------------------------------+
| Separate Node.js worker process                                 |
| Email consumer loop | Idempotency | Bounded retry handling      |
+-----------------------------------------------------------------+
                |
                v
+--------------------------------+
| Test email provider            |
+--------------------------------+
```

The two worker boxes show responsibilities in the same separate Node.js process. Later, multiple instances of that process can share the workload. The consumer also accesses PostgreSQL for processing records.

This is the final V3 design after reliability work. Phase 9 starts with direct API publication to RabbitMQ so we can observe the database/publish gap. Phase 10 replaces that path with the transactional outbox shown above.

**Learning goal:** Reduce request time spent waiting for email while making committed work recoverable after failures. Queue mein email ka kaam worker ko milta hai; API ko email delivery ka wait nahi karna padta.

## 3. Request flow and workspace isolation

### Sign in and open a project

```text
Member -> Next.js -> Supabase Auth -> Session/access token

Next.js -> Express API: protected request + access token
API     -> Auth integration: verify token
API     -> PostgreSQL: check workspace membership and resource ownership
API     -> PostgreSQL or authorized cache: fetch requested data
API     -> Next.js: result or a clear authentication/permission error
```

The API derives the user from the verified token. It checks that the requested project or task belongs to a workspace the user can access. A caller-supplied user or workspace ID is never enough to grant access.

### Assign a task

```text
Member -> Frontend -> API
                       |
                       +-> Verify user and workspace access
                       +-> Confirm assignee belongs to the workspace
                       +-> V1/V2: save assignment and notification
                       |          Invalidate affected cache in V2.
                       |          Attempt synchronous email; return response.
                       |
                       +-> Final V3: one transaction saves assignment,
                                     notification and outbox event.
                                     Invalidate cache; return response.
                                     Worker sends the email later.
```

In final V3, the assignment, notification and outbox event commit together. The API returns after the database work and bounded cache handling. A successful assignment response confirms the saved change; it does not claim the email has already arrived.

## 4. Redis caching and rate limiting

```text
Authorized dashboard read
          |
          v
    Look up Redis key
          |
          +--- HIT ----------------------> Return cached result
          |
          +--- MISS ---> Read PostgreSQL -> Cache with TTL -> Return result
          |
          +--- TIMEOUT / UNAVAILABLE ----> Read PostgreSQL -> Return result

Successful task write -> Invalidate affected dashboard cache entries
```

Keys include the workspace and resource identity, plus any parameters that change the result. TTL limits how long entries live. Mutations invalidate affected entries after the database commit. Recovery must prevent entries made stale during an outage from being served again.

Rate limiting uses separate Redis counters with an explicit window. Concurrent increments and reset behavior must be checked. Its outage policy is a separate decision; falling back to PostgreSQL for dashboard reads does not replace the limiter.

A burst of misses can cause a cache stampede. We will reproduce it and choose a small mitigation based on evidence. Cache invalidation also has race conditions that must be covered by the implementation checks.

**Simple explanation:** Redis data ki temporary copy rakhta hai. Miss ya outage par original data PostgreSQL se milta hai. Faster responses ka benefit measured workload se prove karna hai.

## 5. Assignment events, routing and transactional outbox

```text
API -> PostgreSQL transaction:
       Update assignment + create notification + insert outbox event
                           |
                         COMMIT
                           |
Worker publisher -> Claim pending outbox event
                 -> Publish to task events exchange
                 -> Wait for RabbitMQ publisher confirmation
                 -> Mark publication progress in PostgreSQL

Exchange -- routing key + binding --> Email queue
                                         |
                                         v
                          Worker consumer: check event ID,
                          attempt email if not completed
                                         |
                     +-------------------+----------------------+
                     |                   |                      |
                  SUCCESS          TRANSIENT FAILURE       PERMANENT /
                     |                   |                RETRIES EXHAUSTED
                     v                   v                      |
               Record result      Retry queue                   v
               ACK                Bounded backoff        Dead-letter queue
                                  Return to email queue
```

The consumer checks the event ID before repeating completed processing. Publisher confirms mean the broker accepted a publication; they do not mean an email was delivered. Worker instances coordinate outbox claims through PostgreSQL.

ACK follows successful processing. For failures, either use the configured NACK/reject routing or confirm the retry/dead-letter handoff before acknowledging the original message. Unacknowledged work can be redelivered after a crash.

A crash after publication but before recording progress can publish the same event twice. A unique event ID and idempotent processing handle duplicate database effects. A provider may accept an email just before a crash; exactly one external email requires provider idempotency support, otherwise duplicate-email risk remains.

**Simple explanation:** Outbox pending event ko database mein rakhta hai. Broker down ho to event baad mein publish ho sakta hai. Idempotency ka matlab same event dobara aaye to completed database effect repeat na ho.

## 6. Failure and recovery

| Failure | Expected behavior | What we inspect |
| --- | --- | --- |
| PostgreSQL unavailable | Requests needing it fail clearly; no false success. An uncommitted assignment transaction rolls back. | HTTP result, logs and persisted state |
| Redis unavailable | Cache reads use bounded timeouts and fall back to PostgreSQL. Rate-limit behavior follows its chosen policy. | Request latency, errors and recovery freshness |
| Email provider slow or unavailable in V1/V2 | The synchronous request is affected; a previously committed assignment may still exist. | Response time, saved assignment/notification and email outcome |
| RabbitMQ unavailable in final V3 | Committed outbox events remain pending and are published after recovery. | Outbox backlog and confirmed publications |
| Worker crashes before ACK | Unacknowledged work is redelivered; event IDs guard completed processing. | Redelivery and duplicate effects |
| Email keeps failing in V3 | Bounded retries end in the dead-letter queue. | Attempts, queue depth and diagnostic context |

Failures must be reproduced before judging the improvement. Exact commands, expected observations and measured results belong in task **0.6**, the experiment plan.

## 7. Runtime, measurements and review

Docker Compose will run the approved local processes: frontend/API in V1, Redis in V2, and RabbitMQ plus the separate worker in V3. Supabase PostgreSQL and Auth remain hosted services. Deployment providers and worker hosting will be chosen in the deployment task.

Compare versions using the same dataset and workload. Record p50/p95 request latency, errors, throughput and database query/load metrics; add cache hits/misses in V2 and queue depth, delivery time, retries and worker throughput in V3.

To review this HLD:

1. Open this Markdown file in an editor or on GitHub; the boxed diagrams should retain their spacing.
2. Trace a signed-in member through the UI, permission check and database read in each version.
3. Trace an assignment through its notification and email path.
4. Check the Redis miss/outage path and the V3 broker/worker recovery paths.
5. Confirm the version boundaries: PostgreSQL in V1, Redis in V2, RabbitMQ and a separate worker in V3.

**Interview explanation:** Pehle PostgreSQL app ka baseline measure karenge. Repeated reads costly hon to Redis evaluate karenge. Slow ya unreliable email processing ke liye RabbitMQ worker, retries, idempotency aur outbox use karenge. Har decision ka benefit aur cost measurements se explain karenge.

## 8. PostgreSQL database ERD

This is the planned logical schema. Tables and migrations will be implemented in their numbered tasks. Application tables use the `public` schema and Prisma; Supabase manages the `auth` schema.

**Legend:** `PK` = primary key, `FK` = foreign key, `?` = nullable, `1` = exactly one, and `0..*` = zero or more. Unless shown otherwise, IDs are UUIDs and timestamps use `timestamptz`.

**Simple explanation:** PK har row ki unique pehchan hai. FK doosri table ki row se link banata hai. ERD se samajh aata hai ke user, workspace aur task ka data aapas mein kaise connected hai.

### 8.1 Identity and workspace membership

```text
+------------------------------+
| auth.users (Supabase-managed) |
| id PK                        |
+------------------------------+
                1
                | Same user ID
              0..1
+------------------------------+
| profiles                     |
| id PK, FK -> auth.users.id    |
| email UNIQUE                 |
| display_name?                |
+------------------------------+
                1
                |
              0..*
+------------------------------+           +---------------------------+
| workspace_members            |   0..*    | workspaces                |
| workspace_id PK, FK          | --------> | id PK                     |
| user_id PK, FK -> profiles   |      1    | owner_id FK -> profiles   |
| joined_at                    |           | name                      |
+------------------------------+           +---------------------------+

workspace_members.workspace_id -> workspaces.id
workspaces.owner_id            -> profiles.id
One profile can own zero or more workspaces.
```

Each application profile shares its primary key with its Supabase Auth user. We reference `auth.users.id`, which is the managed table's primary key, and keep application profile data in our own table. This follows [Supabase's user-data guidance](https://supabase.com/docs/guides/auth/managing-user-data).

An Auth account can temporarily have no application profile; the auth integration must create or synchronize the profile before workspace actions are allowed. The profile's email comes from trusted Supabase Auth data, is normalized for lookup, and stays synchronized when that verified email changes. Passwords and sessions remain managed by Supabase Auth. Prisma migrations manage our application tables and their references without taking ownership of Supabase's Auth tables.

`workspace_members` connects users and workspaces: one user can join many workspaces, and one workspace can have many users. Its composite primary key `(workspace_id, user_id)` prevents duplicate membership. Creating a workspace also adds its owner as a member in the same transaction.

For the MVP, `workspaces.owner_id` identifies the owner; other joined users are members. The owner stays a member and cannot remove themselves through the member-removal action. Adding an existing user by email creates a membership directly; a pending invitation/acceptance workflow is outside the current checklist.

### 8.2 Project, task, comment and notification relationships

```text
+-----------------------------------+
| workspaces                        |
| id PK                             |
+-----------------------------------+
                 1
                 |
               0..*
+-----------------------------------+
| projects                          |
| id PK                             |
| workspace_id FK -> workspaces.id   |
| created_by FK -> profiles.id       |
+-----------------------------------+
                 1
                 |
               0..*
+-----------------------------------+
| tasks                             |
| id PK                             |
| project_id FK -> projects.id       |
| created_by FK -> profiles.id       |
| assignee_id? FK -> profiles.id     |
+-----------------------------------+
                 1
                 |
                 +---- 0..* comments
                 |         id PK
                 |         task_id FK -> tasks.id
                 |         author_id FK -> profiles.id
                 |
                 +---- 0..* notifications
                           id PK
                           task_id? FK -> tasks.id
                           recipient_id FK -> profiles.id

One profile can create many projects/tasks, write many comments,
receive many notifications, and be assigned many tasks.
A task has zero or one assignee.
```

Every project belongs to one workspace; every task belongs to one project. The API follows `task -> project -> workspace` when checking access. A comment belongs to one task. A notification has one recipient and may retain its text after its linked task is deleted.

### 8.3 V1 tables and fields

The diagram highlights relationships; this table lists the planned fields. Fields are required unless marked `?` or given a nullable rule.

| Table | Primary key | Foreign keys | Other fields |
| --- | --- | --- | --- |
| `profiles` | `id` | `id -> auth.users.id` | `email text UNIQUE`, `display_name text?`, `created_at`, `updated_at` |
| `workspaces` | `id` | `owner_id -> profiles.id` | `name text`, `created_at`, `updated_at` |
| `workspace_members` | `(workspace_id, user_id)` | `workspace_id -> workspaces.id`, `user_id -> profiles.id` | `joined_at` |
| `projects` | `id` | `workspace_id -> workspaces.id`, `created_by -> profiles.id` | `name text`, `created_at`, `updated_at` |
| `tasks` | `id` | `project_id -> projects.id`, `created_by -> profiles.id`, `assignee_id? -> profiles.id` | `title text`, `description text` default empty, `status`, `due_date date?`, `created_at`, `updated_at` |
| `comments` | `id` | `task_id -> tasks.id`, `author_id -> profiles.id` | `body text`, `created_at` |
| `notifications` | `id` | `recipient_id -> profiles.id`, `task_id? -> tasks.id` | `type` initially `task_assigned`, `message text`, `read_at?`, `created_at` |

Task status uses the database values `todo`, `in_progress` and `done`, displayed as Todo, In Progress and Done. A due date is a calendar date; `read_at` is a nullable timestamp, with null meaning unread. Names, task titles and comment bodies must not be blank.

### 8.4 Integrity, deletion and access rules

- Foreign keys enforce existing parents. Database constraints enforce unique membership, unique normalized profile email and valid task status. Input validation provides useful errors before database writes.
- `tasks.assignee_id` references a profile, so the FK alone does not establish workspace membership. The assignment transaction must verify membership in the task's workspace. Assignment and member removal must coordinate concurrent writes so a removed user cannot remain assigned accidentally.
- Removing a member clears that user's task assignments in the workspace in the same transaction, then removes their membership. Their existing comments and creator references remain as history. Later requests must fail current membership checks, including requests that could hit Redis.
- Project deletion cascades to its tasks; task deletion cascades to its comments. Notification `task_id` uses `ON DELETE SET NULL`, preserving the notification message and recipient after task deletion.
- Workspace/profile deletion is not an MVP action. References to these rows use restrictive deletion rules so an administrative delete cannot silently erase a team's work. Any later account-deletion flow needs an explicit cleanup policy, including its Auth/profile relationship.
- Application data is accessed through Express. Restrict direct client access through Supabase Data API grants/RLS; API permission checks still apply to Prisma operations and must not assume direct database queries automatically inherit a user's Supabase session.

Initial indexes follow the planned lookups: membership by `user_id`, projects by `workspace_id`, tasks by `(project_id, status)` and `assignee_id`, comments by `(task_id, created_at)`, and notifications by `(recipient_id, created_at)`. Primary/unique keys already index profile IDs, emails and workspace membership pairs. Measure query plans before adding further indexes.

### 8.5 Planned V3 reliability tables

V2 reuses the V1 PostgreSQL model; Redis stores its own temporary keys. The following tables are added during Phase 10 reliability tasks.

```text
Assignment transaction
        |
        +-> Update tasks
        +-> Insert notifications
        +-> Insert outbox_events
                       |
                       | Same event ID in RabbitMQ messages
                       v
                Worker consumer
                       |
                       +-> processed_events
                           Record completed processing by event ID.
```

| Table | Key and core fields | Purpose |
| --- | --- | --- |
| `outbox_events` | `id uuid PK`, `event_type text`, `payload jsonb`, `created_at`, `published_at?` | Commit a pending event with the assignment and notification; record publication only after broker confirmation. |
| `processed_events` | `event_id uuid PK`, `processed_at` | Uniquely record completed processing for the email consumer. |

`processed_events.event_id` uses the event ID from `outbox_events.id`; this is a logical link, without a database FK, so retiring a published outbox row does not erase deduplication records. Worker claims, retry metadata and retention will be finalized in the reliability tasks. Concurrent deliveries must coordinate processing; checking for an existing row alone is insufficient. External email duplication limits remain as described in section 5.

### 8.6 Manual review and acceptance

Use this example to trace the relationships on paper:

1. Profiles `U1` and `U2` correspond to two Supabase Auth IDs.
2. `U1` creates workspace `W1`; memberships `(W1, U1)` and `(W1, U2)` connect both users to it. The owner is `U1`.
3. Project `P1` references `W1`. Task `T1` references `P1`, is created by `U1`, and is assigned to member `U2`.
4. Comment `C1` references `T1` and author `U2`. Notification `N1` references `T1` and recipient `U2`; null `read_at` means unread.
5. A repeated `(W1, U2)` membership is rejected by the composite PK. A missing project ID fails the task FK. Assigning an existing user outside `W1` must fail the API membership check.
6. Deleting `T1` deletes `C1`, keeps `N1` and clears `N1.task_id`. Removing `U2` instead clears their assignments and access while preserving authorship history.
7. In final V3, one transaction also creates event `E1` in `outbox_events`. Publication and consumption use `E1` to recover and deduplicate work.

These are design checks for the full application. Task 0.10 introduces only `profiles`; later tasks add the remaining tables and exercise their database and permission rules.

**Interview explanation:** Users aur workspaces ka many-to-many relation membership table se banta hai. Task ka workspace project ke through milta hai. PK/FK data integrity protect karte hain; membership authorization API transaction check karti hai. Redis speed improve kar sakta hai aur outbox email events recover karta hai, lekin dono permission checks ki jagah nahi lete.

## 9. API endpoints and user flows

This is the planned contract for task **0.4**. Routes are implemented in their existing roadmap tasks. The application is still in planning; the examples below are design examples.

**Simple explanation:** API contract frontend aur backend ka agreement hai: kis URL par kya request bhejni hai, kya response milega, aur kaun action kar sakta hai.

### 9.1 Common request and response rules

- Application routes use the prefix `/api/v1`. The public health route is `GET /health`.
- Protected routes require `Authorization: Bearer <supabase-access-token>`. The server verifies it and derives the acting user; request bodies cannot choose the acting user or creator.
- JSON request/response fields use camelCase, mapping to the ERD's snake_case database fields. IDs are UUID strings; timestamps are UTC ISO 8601 strings; `dueDate` is `YYYY-MM-DD` or null.
- A single-resource response is `{ "data": <resource> }`. Creation returns `201`, reads/updates return `200`, and successful deletion returns `204` with no response body.
- List routes accept integer `page >= 1` and `limit` from 1 to 100, defaulting to 1 and 20. Responses use `{ "data": [], "meta": { "page": 1, "limit": 20, "total": 0 } }`. The total counts only accessible records matching the filters. Invalid pagination returns `400`; an empty accessible list returns `200`.
- Lists use stable ordering: workspaces/projects/tasks by `createdAt` then ID ascending; comments by `createdAt` then ID ascending; notifications by `createdAt` then ID descending; members by `joinedAt` then `userId` ascending. Comparisons and load tests use the same pagination and filters.
- Unknown body/query fields, invalid UUIDs, empty workspace/project/task edit patches and invalid field values return `400`. Names are trimmed, nonblank and at most 100 characters; task titles at most 200; descriptions at most 10,000; comments nonblank and at most 5,000. Emails are trimmed, validated and normalized for lookup. The explicit mark-as-read action takes no body.
- Task status is one of `todo`, `in_progress`, `done`. Omitted patch fields stay unchanged; `dueDate: null` clears the date. Nullable assignment is handled by its dedicated route.
- Membership is checked before returning workspace resources or cached results. Resources outside the caller's workspace return `404`, the same as a missing resource. An existing member attempting an owner-only action receives `403`.

The lists are bounded from V1 onward; the baseline must demonstrate actual query cost under this contract rather than introduce an artificial unbounded response later.

### 9.2 Authentication and profile synchronization

The frontend uses the Supabase client for [signup](https://supabase.com/docs/reference/javascript/auth-signup), [password login](https://supabase.com/docs/reference/javascript/auth-signinwithpassword), and [logout](https://supabase.com/docs/reference/javascript/auth-signout). These provider actions have Supabase's response/error format; Express routes follow our application envelope.

| User action | Provider call | Input | Expected outcome |
| --- | --- | --- | --- |
| Sign up | `supabase.auth.signUp` | Email and password | Show the provider result; when confirmation is enabled, ask the user to confirm before expecting a session. |
| Log in | `supabase.auth.signInWithPassword` | Email and password | Receive a valid session or show a useful auth error. |
| Refresh page | Supabase session restoration/refresh | Existing session | Keep a valid user signed in; require login when a session cannot be restored. |
| Log out | `supabase.auth.signOut` | Current session | Clear local user/session state after success and return to login. |

| Method and path | Access | Request | Success |
| --- | --- | --- | --- |
| `GET /health` | Public | No body | `200 { "status": "ok" }`; process liveness only, without leaking configuration. |
| `POST /api/v1/auth/sync` | Verified Auth user | No body | `200` Profile; idempotently create/sync the caller's profile from trusted Auth data. |
| `GET /api/v1/me` | Verified Auth user with profile | No body | `200` Profile for the caller. |

After a session is established, sync the profile before opening workspace pages. A repeated sync must not create a duplicate profile. All protected application routes except sync require that profile; if it is missing, return `409 PROFILE_NOT_READY` and let the frontend retry sync. A profile lookup failure must not bypass authorization.

### 9.3 Workspaces and members

Here and below, paths omit the `/api/v1` prefix for readability. **Member** means a current member of the resource's workspace, including its owner. **Owner** means that member also matches `workspaces.owner_id`.

| Method and path | Access | Request body | Success |
| --- | --- | --- | --- |
| `POST /workspaces` | Signed-in user | `{ "name": "Engineering" }` | `201` Workspace; create the owner membership in the same transaction. |
| `GET /workspaces` | Signed-in user | None | `200` paginated Workspaces the caller belongs to. |
| `GET /workspaces/:workspaceId` | Member | None | `200` Workspace; combine with its project list for the workspace dashboard. |
| `PATCH /workspaces/:workspaceId` | Owner | `{ "name": "Platform" }` | `200` updated Workspace. |
| `GET /workspaces/:workspaceId/members` | Member | None | `200` paginated Memberships, including member display details. |
| `POST /workspaces/:workspaceId/members` | Owner | `{ "email": "member@example.com" }` | `201` Membership for an existing TeamFlow profile. |
| `DELETE /workspaces/:workspaceId/members/:userId` | Owner | None | `204`; clear the removed member's assignments in this workspace in the same transaction. |

Adding an existing member returns `409 ALREADY_MEMBER`; an unknown invitee returns `404 USER_NOT_FOUND` after checking the owner's permission. Removing the owner returns `409 OWNER_REMOVAL_NOT_ALLOWED`; removing a missing membership returns `404`. A signed-in outsider receives `404` on workspace-specific routes. Historical comments and creator references survive member removal.

### 9.4 Projects and dashboard reads

| Method and path | Access | Request body | Success |
| --- | --- | --- | --- |
| `POST /workspaces/:workspaceId/projects` | Member | `{ "name": "Website refresh" }` | `201` Project. |
| `GET /workspaces/:workspaceId/projects` | Member | None | `200` paginated Projects in that workspace. |
| `GET /projects/:projectId` | Member | None | `200` Project. |
| `PATCH /projects/:projectId` | Member | `{ "name": "Website launch" }` | `200` updated Project. |
| `DELETE /projects/:projectId` | Member | None | `204`; cascade through tasks/comments and clear linked notification task IDs. |
| `GET /projects/:projectId/dashboard` | Member | None | `200` Dashboard with `projectId`, `taskCount` and `taskCounts` by status. |

The dashboard read is the baseline measurement and V2 cache target. It is implemented as part of the existing project-dashboard/baseline tasks. V1 calculates the counts in PostgreSQL; V2 may cache the same authorized response. Counts cover the whole project, independent of task-list pagination.

All current members can manage projects and tasks in their workspace. Workspace renaming and membership changes require its owner. Delete confirmation is a frontend step; the API still checks permission for every DELETE request.

### 9.5 Tasks, assignment and comments

| Method and path | Access | Request body/query | Success |
| --- | --- | --- | --- |
| `POST /projects/:projectId/tasks` | Member | `{ "title": "Build signup page", "description": "Add validation" }` | `201` Task; starts as `todo`, unassigned, without a due date. Description may be omitted. |
| `GET /projects/:projectId/tasks` | Member | Optional `status`, plus list pagination | `200` paginated Tasks in the project, filtered before counting/paging. |
| `GET /tasks/:taskId` | Member | None | `200` Task. |
| `PATCH /tasks/:taskId` | Member | Any nonempty subset of `title`, `description`, `status`, `dueDate` | `200` updated Task; `description: ""` clears the description. |
| `PUT /tasks/:taskId/assignee` | Member | `{ "assigneeId": "<member UUID>" }` or `{ "assigneeId": null }` | `200` Task plus assignment delivery metadata described below. |
| `DELETE /tasks/:taskId` | Member | None | `204`; delete comments and clear linked notification task IDs. |
| `GET /tasks/:taskId/comments` | Member | List pagination | `200` paginated Comments. |
| `POST /tasks/:taskId/comments` | Member | `{ "body": "Signup validation is ready." }` | `201` Comment authored by the caller. |

Assignment checks the project's workspace and the assignee's membership inside the coordinated mutation transaction. A nonmember assignee returns `400 ASSIGNEE_NOT_MEMBER`. `assigneeId` cannot be set through the general task patch; the dedicated route owns notification/email side effects.

Changing to a different non-null assignee creates one in-app notification. Repeating the current assignment is a no-op with no new notification/email. Clearing the assignee sends neither. The transaction must coordinate concurrent assignment and member-removal requests as described in section 8.4.

For a saved assignment, `meta.emailStatus` communicates the email attempt:

| Value | Meaning |
| --- | --- |
| `accepted` | In V1/V2, the synchronous provider accepted the email; inbox delivery is not being claimed. |
| `failed` | The email attempt or, during early V3 experiments, publication definitely failed. The assignment is already saved. |
| `unknown` | A timeout/disconnection leaves the external outcome uncertain. The assignment is already saved. |
| `pending` | In final V3, the outbox event committed and the worker will process it, including after broker recovery. |
| `not_required` | The assignee was unchanged or cleared, so no email was requested. |

A synchronous email failure after commit returns the saved Task with `200` and `meta.warning`, such as "Task saved; email could not be sent." The UI shows the saved assignment and warning without automatically repeating the mutation. Validation/transaction failures still return an error without claiming success. Keep provider failures/timeouts as separate metrics even when the assignment's HTTP response is `200`.

Phase 9's direct-publish experiment must label successful-but-unconfirmed publication as `unknown`, rather than claiming durable delivery. Its loss/retry gaps are recorded in experiments. Final V3 reports `pending` after the outbox commit; HTTP success does not wait for the worker or provider.

### 9.6 Notifications

| Method and path | Access | Request | Success |
| --- | --- | --- | --- |
| `GET /notifications` | Signed-in recipient | List pagination; no body | `200` paginated Notifications belonging only to the caller. |
| `PATCH /notifications/:notificationId/read` | Notification recipient | No body | `200` Notification with `readAt` set by the server. |

Marking an already-read notification is a no-op and retains its first read timestamp. Another user's notification returns `404`. After a task is deleted, its notification can remain with `taskId: null`; the UI must not show a link to a missing task. Reading a notification does not grant access to its linked task.

### 9.7 Resource shapes and error cases

The named success objects above have these fields; nullable values use JSON null. Fields and references follow section 8.

| Object | Response fields |
| --- | --- |
| Profile | `id`, `email`, `displayName`, `createdAt`, `updatedAt` |
| Workspace | `id`, `name`, `ownerId`, `createdAt`, `updatedAt` |
| Membership | `workspaceId`, `userId`, `joinedAt`, `user: { id, email, displayName }` |
| Project | `id`, `workspaceId`, `name`, `createdBy`, `createdAt`, `updatedAt` |
| Dashboard | `projectId`, `taskCount`, `taskCounts: { todo, in_progress, done }` |
| Task | `id`, `projectId`, `title`, `description`, `status`, `assigneeId`, `dueDate`, `createdBy`, `createdAt`, `updatedAt` |
| Comment | `id`, `taskId`, `authorId`, `body`, `createdAt` |
| Notification | `id`, `recipientId`, `taskId`, `type`, `message`, `readAt`, `createdAt` |

Errors use `{ "error": { "code": "VALIDATION_ERROR", "message": "Check the submitted fields.", "fields": { "title": "Title is required." } } }`. The optional `fields` map is for validation; messages must not expose tokens, SQL or private provider details.

| HTTP status | Meaning / examples |
| --- | --- |
| `400` | `VALIDATION_ERROR`, `ASSIGNEE_NOT_MEMBER`; invalid body, UUID, status, date or pagination. |
| `401` | `UNAUTHENTICATED`; missing, invalid or expired access token. |
| `403` | `FORBIDDEN`; a workspace member attempts an owner-only operation. |
| `404` | `NOT_FOUND`; missing or inaccessible resource. `USER_NOT_FOUND` is only for an authorized owner's invite lookup. |
| `409` | `ALREADY_MEMBER`, `OWNER_REMOVAL_NOT_ALLOWED`, `PROFILE_NOT_READY`; the requested operation conflicts with current state. |
| `429` | `RATE_LIMITED` once Redis rate limiting is introduced; include `Retry-After` in seconds. |
| `500` | `INTERNAL_ERROR`; unexpected server failure. |
| `503` | `DEPENDENCY_UNAVAILABLE`; required database/Auth dependency is unavailable, rather than a token being rejected as invalid. |

V2 rate limiting applies to the selected authenticated Express routes using the verified user ID; Supabase's direct Auth endpoints retain the provider's own controls. Cache outages follow the fallback plan instead of automatically becoming `503`. An unexpected disconnect around a database commit can leave its outcome uncertain; a generic error must not promise rollback unless it is known. Re-read current state before retrying an uncertain mutation.

### 9.8 Request and response examples

Create a workspace after signing in and syncing the profile:

```http
POST /api/v1/workspaces
Authorization: Bearer <access-token>
Content-Type: application/json

{ "name": "Engineering" }
```

```json
{
  "data": {
    "id": "11111111-1111-4111-8111-111111111111",
    "name": "Engineering",
    "ownerId": "22222222-2222-4222-8222-222222222222",
    "createdAt": "2026-10-16T10:00:00.000Z",
    "updatedAt": "2026-10-16T10:00:00.000Z"
  }
}
```

Success is `201`. List that workspace's projects with `GET /api/v1/workspaces/11111111-1111-4111-8111-111111111111/projects?page=1&limit=20`. An empty authorized list is:

```json
{ "data": [], "meta": { "page": 1, "limit": 20, "total": 0 } }
```

Update a task using its actual ID from a create/list response:

```http
PATCH /api/v1/tasks/<taskId>
Authorization: Bearer <access-token>
Content-Type: application/json

{ "status": "in_progress", "dueDate": "2026-10-30" }
```

Success is `200` with the complete Task object described above. Assignment uses `PUT /api/v1/tasks/<taskId>/assignee` with `{ "assigneeId": "<member UUID>" }`; final V3 returns the updated Task in `data` and `{ "emailStatus": "pending" }` in `meta`.

An invalid title receives `400`, for example:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Check the submitted fields.",
    "fields": { "title": "Title is required." }
  }
}
```

### 9.9 User-flow walkthrough and acceptance

Use IDs returned by preceding requests. These are planned checks for implementation; no running API is claimed here.

1. **Authentication (Phase 1):** Sign up two users through Supabase; confirm email if required. Log in each, call `POST /auth/sync`, then `GET /me`. Refresh a page and check session restoration. Repeat a protected request without a token and expect `401`. Log out and confirm the frontend requires login again.
2. **Workspace (Phase 2):** As the owner, `POST /workspaces`, then `GET /workspaces` and `GET /workspaces/:workspaceId`. Add the second profile using `POST /workspaces/:workspaceId/members`; both should appear in the member list. Repeat the add and expect `409`. Rename as owner (`200`); rename as the other member (`403`).
3. **Project (Phase 3):** As a member, create a project under the workspace (`201`), list it and open it (`200`), then rename it (`200`). An unrelated third user's requests for that project receive `404`.
4. **Task and comment (Phase 4):** Create a task (`201`), open it, edit its description/date/status (`200`) and filter the project list by that status. Assign the second member (`200`), then post a comment (`201`) and reload comments. A nonmember assignee is rejected (`400`).
5. **Notifications and email (Phase 5):** Once the notification/email tasks are implemented, make a new assignment to another member. As its recipient, list notifications and mark it read (`200`). Another user's read attempt receives `404`. Check the test inbox; stop the provider and confirm saved assignment plus email failure/uncertainty is reported accurately.
6. **Deletion and removal:** Cancel a UI delete confirmation and confirm no DELETE request is sent. Confirm deletion of a task/project and expect `204` plus the ERD's cascading/nulling behavior. Remove a nonowner member (`204`) and confirm their workspace access becomes `404` and their assignments are cleared. Attempt owner removal and expect `409`.
7. **V2/V3:** Read the project dashboard with the same contract across versions. After membership removal, a previously cached response must remain inaccessible. In final V3, stop RabbitMQ, assign a task, and expect a saved Task with pending outbox delivery; after recovery the worker processes the event.

Task **0.4** is accepted when every planned user action maps to its provider call or application route, request/response shape, permission and failure behavior. Exact experiment commands and measurements are completed in task **0.6**.

**Interview explanation:** REST endpoints resources ko represent karte hain. Authentication user identify karti hai; authorization workspace mein permission check karti hai. Response saved task aur email delivery ka status clearly batata hai. Redis aur RabbitMQ internal processing change karte hain, jabke frontend ka main resource contract consistent rehta hai.

## 10. Architecture review and project structure

Task **0.7** brings together the [overview](../README.md), HLDs, ERD and API plan above, the [roadmap](roadmap.md), and the [experiment plan](experiments.md).

### 10.1 Setup decisions

- Use one Git repository and npm workspaces. `apps/web` is the Next.js application; `apps/api` is the Express application. Run them in two terminals during local development.
- The frontend uses the Next.js App Router, TypeScript and Tailwind CSS. The API uses Express, strict TypeScript and a small entry point. API feature modules are added when their tasks need them.
- Root npm commands provide `dev:web`, `dev:api`, `start:web`, `start:api`, `build` and `typecheck`. Keep one root lockfile for reproducible installs.
- Development defaults are frontend port 3000 and API port 3001. The setup page is a simple TeamFlow placeholder; application features begin with Phase 1.
- Task 0.10 added Prisma configuration, the initial `profiles` migration, a shared database client and a database-read command, plus the requested local environment file and its example. Task 0.11 added environment loading at API startup, optional `PORT` configuration and public `GET /health`, returning `200 { "status": "ok" }` without querying the database. Backend test tools remain task 0.12, and V1 Docker Compose 0.13.
- Add the seed/load scripts as their Phase 6 tasks are reached. Add Redis in V2 and `apps/worker` plus RabbitMQ in V3. Keep worker and API responsibilities within this application.

### 10.2 Structure after task 0.11

```text
TeamFlow/
|-- apps/
|   |-- web/
|   |   |-- src/app/
|   |   |   |-- globals.css
|   |   |   |-- layout.tsx
|   |   |   `-- page.tsx
|   |   |-- AGENTS.md
|   |   |-- package.json
|   |   |-- postcss.config.mjs
|   |   `-- tsconfig.json
|   `-- api/
|       |-- prisma/
|       |   |-- migrations/
|       |   `-- schema.prisma
|       |-- src/
|       |   |-- lib/prisma.ts
|       |   |-- scripts/check-db.ts
|       |   `-- index.ts
|       |-- .env.example
|       |-- package.json
|       |-- prisma.config.ts
|       `-- tsconfig.json
|-- docs/
|   |-- architecture.md
|   |-- experiments.md
|   `-- roadmap.md
|-- .gitignore
|-- package.json
|-- package-lock.json
|-- README.md
|-- checklist.md
`-- progress.md

prompt.md and apps/api/.env stay local and ignored.
Build output, generated Prisma Client and node_modules are ignored.
```

The folders were created in task 0.8 and populated in 0.9. Task 0.10 adds the Prisma files shown above; generated client files are local build support. Next.js-generated type files also stay ignored. Next.js maintains `apps/web/AGENTS.md` with guidance for the installed version; that guide is tracked so normal startup does not leave an uncommitted generated document. Future folders such as `experiments/k6` and `apps/worker` are introduced only when required.

### 10.3 Review outcome and authorization

The plan uses the requested stack and keeps the three version boundaries. The API owns permission checks and PostgreSQL writes; Redis is temporary state; RabbitMQ/worker processing is a later upgrade. The ERD, endpoint plan and experiment scenarios use the same workspace/task/notification relationships.

The user explicitly authorized continuing through task **0.9** without stopping for review, with commits after each task. That authorization covers this planning review and the basic folder/application scaffold above. Individual files and decisions remain reviewable in their commits; feature implementation and later setup tasks are reached through their own numbered tasks.

**Simple explanation:** Ek repository mein frontend aur backend alag folders mein honge. Root se npm commands chalengi aur har task ka progress, commit aur push hoga. Database, tests aur Docker apne next tasks mein add karenge.
