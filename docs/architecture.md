# TeamFlow architecture

Task **0.2**: High-Level Design (HLD) diagrams for the three versions of the same application, written as plain text in Markdown. These are planned designs; infrastructure is introduced only in its assigned version.

HLD ka matlab hai system ke main parts aur unke connections dekhna. Detailed database relationships and API endpoints will be added in tasks **0.3** and **0.4**.

## Shared design

- Next.js, TypeScript and Tailwind CSS provide the user interface.
- Supabase Auth handles signup, login and sessions. The frontend sends its access token with protected API requests.
- The Express API verifies the token and checks workspace membership and permissions before accessing application data. A cache hit must also pass these checks.
- Prisma runs application database queries against Supabase PostgreSQL. Database credentials stay on the backend.
- PostgreSQL stores users' application data: workspaces, memberships, projects, tasks, comments and notifications. Supabase Auth owns authentication identities.
- The same application grows through V1, V2 and V3. The worker is a separate Node.js process in the same project, with shared event definitions and database schema.
- Docker Compose will run the approved local processes. Supabase PostgreSQL and Auth remain hosted services. Redis joins in V2; RabbitMQ and the worker join in V3.

## V1 — Working application and baseline

```text
[Team member]
      |
      v
[Next.js frontend] <---- signup / login ----> [Supabase Auth]
      |
      | HTTPS request with access token
      v
[Express API: verify token, check permissions, use Prisma]
      |
      +---- reads / writes ----> [Supabase PostgreSQL]
      |
      +---- synchronous email -> [Test email provider]
                                 Request waits for email attempt.
```

**Request flow:** A member signs in, opens a project and assigns a task. The API checks access, saves the assignment and notification in PostgreSQL, and attempts the email synchronously. The request waits for the email attempt to finish.

**Simple explanation:** V1 mein har read PostgreSQL se hoti hai. Assignment email bhejne ka wait bhi request ke andar hota hai. Provider slow ho to user ko response late mil sakta hai.

**Limits to observe:** Repeated dashboard reads may repeat expensive database queries. A slow or unavailable email provider affects the request; an application crash after saving an assignment can leave its email unsent. We will record the actual response and database state during failures.

**Measurements:** Record request p50/p95 latency, errors, throughput, database query counts and database load. Compare assignment requests with and without synchronous email sending.

## V2 — Redis caching and rate limiting

```text
[Team member]
      |
      v
[Next.js frontend] <---- signup / login ----> [Supabase Auth]
      |
      | HTTPS request with access token
      v
[Express API: verify token, check permissions, use Prisma]
      |
      +---- cache lookup / populate ------> [Redis]
      |     TTL, invalidation, rate limits
      |
      +---- writes / cache miss ----------> [Supabase PostgreSQL]
      |     Also used when cache is unavailable.
      |
      +---- synchronous email ------------> [Test email provider]
```

**Cache-aside flow:** After checking permission, the API looks for the workspace-scoped dashboard key in Redis. On a hit, it returns the cached result. On a miss, it reads PostgreSQL and caches the result with a TTL. Task changes invalidate affected dashboard entries after the database write succeeds.

**Simple explanation:** Redis frequently read data ki temporary copy rakhta hai. Cache miss par PostgreSQL se data lete hain; TTL batata hai copy kitni der valid rahegi. PostgreSQL application data ka source of truth rehta hai.

**Failure behavior:** Cache operations have bounded timeouts. If Redis is unavailable, dashboard reads fall back to PostgreSQL. Recovery must avoid serving entries made stale by writes during the outage. Rate limiting needs its own documented failure policy; database fallback alone does not replace a rate limiter.

**Limits to observe:** Invalidation adds work, cached data can become stale, and many simultaneous misses can overload PostgreSQL. Test isolation between workspaces and a stampede mitigation before judging the result.

**Measurements:** Repeat the V1 dataset and workload with cold and warm caches. Compare p50/p95 latency, errors, database query counts/load and cache hits/misses. Test TTL expiry, invalidation, Redis outages and recovery.

## V3 — RabbitMQ and reliable background email

This diagram shows the final V3 design after the reliability tasks. In Phase 9, the API first publishes directly to RabbitMQ so we can observe the gap between saving data and publishing an event. In Phase 10, the transactional outbox replaces that direct publication path. The publisher and consumer run in a separate Node.js worker process; we can later run multiple instances.

```text
[Team member]
      |
      v
[Next.js frontend] <---- signup / login ----> [Supabase Auth]
      |
      | HTTPS request with access token
      v
[Express API: verify token, check permissions, use Prisma]
      |
      +---- cache / rate limits ----------> [Redis]
      |     Invalidate affected cache after database writes.
      |
      | Prisma reads and writes; cache miss or cache failure fallback
      v
[Supabase PostgreSQL]
  Assignment + notification + outbox event saved in one transaction.
      ^
      | Read pending events; mark published after broker confirmation.
      v
[Outbox publisher - separate worker process]
      |
      | Publish event and wait for broker confirmation.
      v
[RabbitMQ exchange] -- routing key + binding --> [Email queue]
                                                     |
                                                     | Delivery
                                                     v
                              [Email consumer - worker process]
                                    |
                                    +--> [Test email provider]
                                    |
                                    +--> [PostgreSQL processed event IDs]
                                    |    Guard against duplicate effects.
                                    |
                                    +--> [Retry queue] --> [Email queue]
                                    |    Bounded retries with backoff.
                                    |
                                    +--> [Dead-letter queue]
                                         Permanent / exhausted failures.

Consumer sends ACK after success, or safely handles failure using NACK
or a confirmed retry / dead-letter handoff. Unacknowledged work can return.
```

**Request flow:** The API checks access and saves the assignment, in-app notification and outbox event in one PostgreSQL transaction. It returns after the database work and bounded cache handling, without waiting for email delivery. Notifications remain available in the app while email processing catches up.

**Outbox flow:** A publisher loop in the separate worker reads pending outbox events, publishes them with routing information, waits for broker confirmation, and records publication progress. If RabbitMQ is down, the event stays pending for a later attempt. Multiple publisher loops must coordinate claims so worker scaling does not create uncontrolled publication races.

**Consumer flow:** The email consumer processes the event, uses its event ID to guard database effects, and acknowledges successful work. Transient failures use bounded retries with backoff; permanent or exhausted failures go to a dead-letter queue. A failure is acknowledged only after its retry or dead-letter handoff is safely confirmed, or it is NACKed/rejected using configured broker routing. A worker crash before acknowledgement allows redelivery.

**Simple explanation:** Queue mein email ka kaam rakh dete hain, worker usay baad mein karta hai. Outbox database mein pending event save karta hai, taa ke database commit ke baad broker unavailable ho to event recover ho sake. ACK ka matlab processing successful; NACK ka matlab failure ko retry ya rejection policy ke mutabiq handle karna.

**Delivery limits:** Redelivery and duplicate publication are possible, including a crash after broker confirmation but before outbox progress is saved. Processing must be idempotent. An email provider may accept an email just before the worker crashes; a database record alone cannot guarantee exactly one external email. Use provider idempotency if available and document remaining duplicate-email risk.

**Measurements:** Compare HTTP request latency against synchronous V1/V2 email processing using the same workload. Also measure email completion time, queue depth, retry/dead-letter counts and worker throughput. Run broker outages, worker crashes and duplicate deliveries; then compare one worker with multiple workers under the same provider limits.

## How to review this task

Open this file in a text editor, a Markdown preview or GitHub. The three text diagrams should be readable with their spacing preserved. Trace login, authorized database reads and assignment email delivery through each version. Confirm that V1 uses PostgreSQL, V2 adds Redis, and V3 adds RabbitMQ with a separate worker and the final outbox flow.

**Interview explanation:** Pehle working PostgreSQL app banayi aur baseline measure ki. Repeated reads costly hon to Redis evaluate karenge. Slow ya unreliable email processing ke liye RabbitMQ worker use karenge, aur retries, idempotency aur outbox se failure handling improve karenge. Har addition ka benefit measurements se explain karna hai.
