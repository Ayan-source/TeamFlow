# TeamFlow — Architecture and data flow plan

This is the Phase 0 HLD for task **0.2**. It describes the planned components, their responsibilities, how requests move, and how failures recover. PostgreSQL owns application data; Redis holds temporary copies; RabbitMQ delivers background work.

HLD mein hum system ke main parts, unki responsibility aur unke connections samajhte hain. Database ERD is task **0.3**; API endpoints are task **0.4**.

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
