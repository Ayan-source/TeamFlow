# TeamFlow — Architecture and data flow plan

This Phase 0 design contains the HLD for task **0.2** and the database ERD for task **0.3**. It describes planned components, data relationships, request paths and failure recovery. PostgreSQL owns application data; Redis holds temporary copies; RabbitMQ delivers background work.

HLD mein hum system ke main parts, unki responsibility aur unke connections samajhte hain. Section 8 contains the ERD; API endpoints will be added in task **0.4**.

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

These are design checks; no live database or migration has been created. Implementation tasks will run database and permission tests against these rules.

**Interview explanation:** Users aur workspaces ka many-to-many relation membership table se banta hai. Task ka workspace project ke through milta hai. PK/FK data integrity protect karte hain; membership authorization API transaction check karti hai. Redis speed improve kar sakta hai aur outbox email events recover karta hai, lekin dono permission checks ki jagah nahi lete.
