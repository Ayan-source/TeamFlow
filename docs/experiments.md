# TeamFlow — Experiments and measurements

Task **0.6** defines how we will reproduce problems, introduce infrastructure and compare results. This is a plan: the application, fixtures, k6 scripts and infrastructure commands below become runnable in their listed implementation tasks. No performance or failure experiment has been run yet.

**Learning approach:** Pehle problem reproduce karenge, phir solution add karenge, aur same workload se difference measure karenge. Expected observations are hypotheses to check, not measured results.

## 1. Prerequisites and planned command interfaces

Run commands in PowerShell from the repository root. Use the same machine, dataset, API build, account permissions, pagination, concurrency and duration when comparing versions. Record differences such as provider/network conditions. Performance runs use the API's production build rather than a hot-reloading process.

| Tool or interface | Added in task | Purpose |
| --- | --- | --- |
| Root npm scripts and `apps/web`, `apps/api` | 0.9 | Build/start the frontend and Express API. |
| Prisma setup and environment examples | 0.10–0.11 | Connect Supabase PostgreSQL with local credentials kept out of Git. |
| Docker Compose `api` and `web` services | 0.13 | Start the approved local application processes. |
| Auth/profile sync and resource endpoints | Phases 1–5 | Obtain valid tokens and exercise the documented user flow. |
| Test email adapter controls | 5.5–5.7 | Normal delivery, disabled delivery, controlled delay, definite failure and uncertain timeout. |
| `npm run db:seed --workspace @teamflow/api` | 6.1 | Create a repeatable dataset tied to real test Auth profiles. |
| Request/query logs | 6.2–6.4 | Route/status/duration plus database query counts and timings. |
| `experiments/k6/reads.js`, `assignments.js` | 6.5 | Authorized read and assignment workloads. |
| Compose `redis`, cache configuration | 7.1–7.7 | Cache-aside, expiry, invalidation and outage tests. |
| `experiments/k6/rate-limit.js` | 8.1–8.2 | Concurrent rate-limit and reset checks. |
| Compose `rabbitmq` and scalable `worker` | 9.1, 9.4 | Broker/worker lifecycle and queue measurements. |
| Worker crash, duplicate and outbox harnesses | 10.2, 10.6, 10.8–10.9 | Deterministically reproduce reliability boundaries. |

The email adapter's planned lab controls are `TF_EMAIL_MODE=normal|disabled|delay|unavailable|timeout` and `TF_EMAIL_DELAY_MS`. Fault modes are explicitly enabled for the local experiment environment. Normal measurements use actual provider timings; synthetic delay/failure runs are labeled separately. Do not add artificial database delays to manufacture a caching problem.

Before implementing the scripts, maintain the names and inputs below, or update these instructions in the same task that changes them. Test harnesses must wait for/log the named fault boundary before killing their own worker or simulating a failure.

### Session configuration

Replace placeholders locally using IDs returned by the API. Use short-lived tokens; scripts must not print tokens or credentials.

```powershell
$env:TF_API_BASE = 'http://localhost:3001/api/v1'
$env:TF_TOKEN = '<owner access token>'
$env:TF_MEMBER_TOKEN = '<member access token>'
$env:TF_OUTSIDER_TOKEN = '<unrelated workspace user access token>'
$env:TF_OWNER_ID = '<owner profile UUID>'
$env:TF_MEMBER_ID = '<member profile UUID>'
$env:TF_OUTSIDER_ID = '<outsider profile UUID>'
$env:TF_WORKSPACE_ID = '<workspace UUID>'
$env:TF_PROJECT_ID = '<project UUID>'
$env:TF_TASK_ID = '<task UUID>'
$env:TF_EMAIL_MODE = 'normal'
New-Item -ItemType Directory -Force .tmp/experiments | Out-Null
$headers = @{ Authorization = "Bearer $env:TF_TOKEN" }
```

The seed task creates two isolated workspaces, 20 projects and 500 tasks per project, with all three statuses, assignments and comments. It uses the three synchronized test profiles above, never invented Auth IDs. It prints the fixture IDs used by the scripts. Re-running it resets only fixtures owned by the experiment. Record the actual row counts and seed settings.

```powershell
npm run db:seed --workspace @teamflow/api
docker compose up -d api web
Invoke-RestMethod "$env:TF_API_BASE/projects/$env:TF_PROJECT_ID/dashboard" -Headers $headers
```

`.tmp/experiments` holds local raw outputs and stays ignored. Record concise results in this document; keep load-generator tokens valid for each run and record auth failures separately from application bottlenecks.

## 2. V1 repeated-read baseline — before Redis

**Tasks:** 6.1–6.8. **Problem:** The same authorized dashboard and task list may repeat costly PostgreSQL work.

1. Seed the fixed dataset and start V1 with query/request logging. Redis and RabbitMQ are absent.
2. Run dashboard and paginated task-list workloads separately. Repeat each run three times, keeping the same filter and page size.
3. Inspect API logs and available Supabase PostgreSQL metrics during each run.

```powershell
k6 run --vus 20 --duration 30s --summary-export .tmp/experiments/v1-dashboard.json -e TARGET=dashboard experiments/k6/reads.js
k6 run --vus 20 --duration 30s --summary-export .tmp/experiments/v1-tasks.json -e TARGET=tasks -e STATUS=todo -e PAGE=1 -e LIMIT=20 experiments/k6/reads.js
docker compose logs --since 5m api
```

**Inspect:** HTTP p50/p95, request/error counts, requests per second, database query count/duration and available CPU/connection/load data. The k6 scripts must explicitly include p50 and p95 in their summary output and distinguish valid `200` responses from unexpected statuses.

**Expected observation:** Repeated requests can repeat the dashboard's expensive aggregate queries even though the data has not changed. It is also possible PostgreSQL is already fast enough that Redis adds little value.

**Decision:** Record the actual bottleneck and a measurable goal before task 7.1. If queries are inefficient or missing the planned indexes, fix that first and establish a new baseline. Explain the remaining reason to evaluate caching; do not claim Redis is needed without evidence.

## 3. V1 synchronous email baseline — before RabbitMQ

**Tasks:** 5.5–5.7, 6.5. **Problem:** Assignment requests wait for email, and a committed assignment can survive while its email fails or is lost.

The assignment workload alternates each fixture task between two valid workspace members; repeatedly assigning its current assignee would be a no-op and would not measure email. Tasks are separated across virtual users so unrelated assignment races do not distort this baseline.

```powershell
$env:TF_EMAIL_MODE = 'disabled'
docker compose up -d --force-recreate api
k6 run --vus 5 --duration 30s --summary-export .tmp/experiments/v1-email-disabled.json experiments/k6/assignments.js
$env:TF_EMAIL_MODE = 'normal'
docker compose up -d --force-recreate api
k6 run --vus 5 --duration 30s --summary-export .tmp/experiments/v1-email-normal.json experiments/k6/assignments.js
$env:TF_EMAIL_MODE = 'delay'
$env:TF_EMAIL_DELAY_MS = '1500'
docker compose up -d --force-recreate api
k6 run --vus 5 --duration 30s --summary-export .tmp/experiments/v1-email-delayed.json experiments/k6/assignments.js
```

The adapter's `disabled` mode is a benchmark bypass of the provider attempt, not a user-visible email feature. Restore `normal` mode after comparisons.

**Inspect:** Assignment request p50/p95, actual provider duration, saved task/notification state and inbox acceptance. Record normal provider latency separately from the 1500 ms controlled delay. Expect synchronous request time to include provider time.

### Provider failure and uncertain timeout

```powershell
$env:TF_EMAIL_MODE = 'unavailable'
docker compose up -d --force-recreate api
Invoke-RestMethod "$env:TF_API_BASE/tasks/$env:TF_TASK_ID/assignee" -Method Put -Headers $headers -ContentType 'application/json' -Body (@{ assigneeId = $env:TF_MEMBER_ID } | ConvertTo-Json)
Invoke-RestMethod "$env:TF_API_BASE/tasks/$env:TF_TASK_ID" -Headers $headers
docker compose logs --since 5m api
```

Before the call, ensure the task is assigned to someone else or unassigned. Repeat using `TF_EMAIL_MODE=timeout` and a new assignment. The timeout fixture must distinguish an unknown provider outcome from a definite rejection.

**Expected observation:** Once the assignment transaction commits, the API returns the saved task plus `meta.emailStatus=failed|unknown` and a warning. There is no automatic V1 email recovery. A `200` for the saved assignment does not mean the email succeeded; record provider failures separately from HTTP errors.

The task 9.10/10.9 harness will also pause after database commit but before publication/email, terminate the owning process, and show the missing work. This proves the durability gap independently of a slow provider. Restore `TF_EMAIL_MODE=normal` and recreate the API after this experiment.

## 4. V2 cache-aside, TTL and invalidation

**Tasks:** 7.1–7.8. **Prerequisite:** Section 2 has measured V1 results. The planned dashboard key format is `teamflow:cache:workspace:<workspaceId>:project:<projectId>:dashboard:v1`.

```powershell
docker compose up -d redis api
$dashboardKey = 'teamflow:cache:workspace:{0}:project:{1}:dashboard:v1' -f $env:TF_WORKSPACE_ID, $env:TF_PROJECT_ID
docker compose exec -T redis redis-cli DEL $dashboardKey
Invoke-RestMethod "$env:TF_API_BASE/projects/$env:TF_PROJECT_ID/dashboard" -Headers $headers
docker compose exec -T redis redis-cli TTL $dashboardKey
Invoke-RestMethod "$env:TF_API_BASE/projects/$env:TF_PROJECT_ID/dashboard" -Headers $headers
k6 run --vus 20 --duration 30s --summary-export .tmp/experiments/v2-dashboard-warm.json -e TARGET=dashboard experiments/k6/reads.js
docker compose logs --since 5m api
```

**Inspect:** First read misses and populates Redis; second read hits. Logs show that permission checks still occur, while the expensive aggregate query is reduced. Record cold-request latency separately from the warm load test. Compare against the same V1 baseline with unchanged auth checks and indexes.

**TTL check:** Record the configured TTL, wait that number of seconds plus one, and repeat the read. Expect expiry followed by a miss and repopulation.

**Invalidation check:** Warm the dashboard, then create/edit/assign/change status/delete a task using the API routes in architecture section 9. After each mutation, reread the dashboard and compare counts against PostgreSQL/API task data. Expect affected keys to be invalidated and current data returned. Include a write concurrent with a cache refill to investigate stale-refill races.

**Trade-offs:** Record latency/query savings alongside cache round trips, invalidation work, staleness limits and Redis operation cost.

## 5. V2 Redis outage, recovery and rate limiting

**Tasks:** 7.9–7.10, 8.1–8.2, 8.5–8.6.

```powershell
docker compose stop redis
k6 run --vus 20 --duration 30s --summary-export .tmp/experiments/v2-redis-down.json -e TARGET=dashboard experiments/k6/reads.js
docker compose logs --since 5m api
docker compose start redis
```

While Redis is down, change a task's status. After recovery, compare the dashboard with PostgreSQL so an entry made stale during the outage is not trusted. Observe bounded cache timeouts, error logs, database load and time to recover. Decide the rate limiter's outage policy explicitly; dashboard fallback does not automatically make rate limiting available.

**Isolation check:** Warm the project dashboard as its owner, then make the identical request with `TF_OUTSIDER_TOKEN`. Expect `404`, including on a warm cache. Repeat with a member removed after warming the cache. Check similarly shaped resources in the other workspace for key collisions.

**Rate-limit check:** Task 8.1 provides lab-configurable `TF_RATE_LIMIT_MAX=10` and `TF_RATE_LIMIT_WINDOW_SECONDS=10`, using an atomic per-user window counter. Use a fresh window, then:

```powershell
k6 run --vus 50 --iterations 50 --summary-export .tmp/experiments/v2-rate-limit.json experiments/k6/rate-limit.js
Start-Sleep -Seconds 11
k6 run --vus 1 --iterations 1 experiments/k6/rate-limit.js
```

Expect at most 10 accepted requests in the same fresh window, with remaining requests receiving `429` and `Retry-After`. After reset, the next valid request is accepted. Run one user's requests concurrently and check another user's limit independently. Restore normal limit settings afterward.

## 6. V2 cache stampede

**Tasks:** 8.3–8.4. Use the same dashboard, expired/missing key, dataset and concurrency before and after mitigation.

```powershell
docker compose exec -T redis redis-cli DEL $dashboardKey
k6 run --vus 50 --iterations 50 --summary-export .tmp/experiments/v2-stampede-before.json -e TARGET=dashboard -e SCENARIO=cold-burst experiments/k6/reads.js
docker compose logs --since 5m api
```

Inspect timestamps and aggregate-query counts during overlapping misses. Introduce a small mitigation such as a bounded single-flight mechanism or expiring lock, chosen in task 8.4, then repeat with output `v2-stampede-after.json`. If the mitigation has only process-local scope, document that limit. Simulate its owner's crash and confirm waiters can recover instead of waiting indefinitely.

**Success evidence:** Less duplicate aggregate work under the same cold burst, bounded request latency and correct results. Compare normal warm reads too, to expose mitigation overhead.

## 7. V3 queue routing and asynchronous email

**Tasks:** 9.1–9.9. **Prerequisite:** Record normal, delayed and failed synchronous email outcomes first.

```powershell
$env:TF_EMAIL_MODE = 'normal'
docker compose up -d rabbitmq worker api
k6 run --vus 5 --duration 30s --summary-export .tmp/experiments/v3-email-async.json experiments/k6/assignments.js
docker compose exec -T rabbitmq rabbitmqctl list_queues name messages_ready messages_unacknowledged consumers
docker compose logs --since 5m worker
```

Task 9.2 configures a task-events exchange, routing key, binding and email queue. Publish a matching and a nonmatching routing key with the task's producer fixture; only the intended route should enqueue email work. Inspect broker durability/persistence configuration and record its actual guarantees.

**Inspect:** Request p50/p95, separate assignment-commit-to-email completion time, queue depth, errors and worker consumption. Early direct publication without confirms must not be reported as confirmed durable delivery. Stop the worker, assign another task and observe waiting work; restarting the worker should resume the intended delivery flow.

**Broker outage:** Stop `rabbitmq`, perform a new assignment and inspect the saved task, response metadata and producer logs. Restart the broker and check whether that event was lost in the early direct-publish implementation. Record the gap before adding the outbox.

## 8. V3 acknowledgements, retries and idempotency

**Tasks:** 9.10, 10.1–10.7. The following planned commands invoke deterministic local harnesses added in these tasks.

```powershell
npm run experiment:worker-crash --workspace @teamflow/worker -- --point before-ack
npm run experiment:idempotency --workspace @teamflow/worker -- --deliveries 5 --concurrency 5
npm run experiment:retry --workspace @teamflow/worker -- --failures 2
npm run experiment:retry --workspace @teamflow/worker -- --permanent
```

- **Crash before ACK:** The harness logs the event ID at its pause boundary, kills its worker, restarts it and observes redelivery. Do not infer redelivery from an unrelated new message.
- **Duplicate delivery:** Submit one event ID five times concurrently. Inspect unique processing records and notification effects. Record external email acceptance separately; provider idempotency or its absence affects duplicate-email guarantees.
- **Transient failure:** Fail the first two attempts, then succeed. Inspect bounded backoff timings, ACK after success and no remaining retry job.
- **Permanent failure:** Always reject the email. After the configured attempt bound, inspect the dead-letter queue and ensure healthy jobs still progress. Confirm retry/dead-letter handoff before ACKing the original, or use the chosen safe NACK/reject policy.
- **Publisher confirms:** Interrupt the connection around publication with the task 10.7 fixture. Record confirmed, rejected and uncertain publications without treating socket writes as broker confirmation.

Record retry limits/delays, event IDs, timing, queue counters, ACK/NACK behavior and provider outcomes. These checks verify failure handling; they do not establish exactly-once external email delivery.

## 9. V3 transactional outbox and worker scaling

**Tasks:** 10.8–10.10.

```powershell
npm run experiment:outbox --workspace @teamflow/api -- --case rollback
npm run experiment:outbox --workspace @teamflow/api -- --case crash-after-commit
docker compose stop rabbitmq
npm run experiment:outbox --workspace @teamflow/api -- --case broker-down
docker compose start rabbitmq
npm run experiment:outbox --workspace @teamflow/api -- --case crash-after-confirm
```

**Inspect:** A rolled-back assignment has no notification/outbox row. After a committed assignment, the outbox event survives an API crash or broker outage. Final V3 returns the saved assignment with `emailStatus=pending`; after recovery, the publisher confirms delivery and records progress. A crash after confirm but before progress can republish the same ID, so the consumer's idempotency checks still matter. Inspect claim coordination when publishers overlap.

Worker throughput uses the same fixed job batch and provider conditions, with the producer finished before timing the backlog drain:

```powershell
docker compose up -d --scale worker=1 worker
npm run experiment:worker-throughput --workspace @teamflow/worker -- --jobs 100
docker compose up -d --scale worker=3 worker
npm run experiment:worker-throughput --workspace @teamflow/worker -- --jobs 100
docker compose up -d --scale worker=1 worker
```

The harness uses new event IDs for each batch and reports confirmed publication, job completion and provider acceptance counts. Record jobs/second, total completion time, ready/unacknowledged queue depth and failures. Do not mix these events with an earlier backlog. Record provider limits and worker prefetch/concurrency; more workers may hit a different bottleneck.

## 10. Results record and cleanup

For every run, record date, Git SHA, version/configuration, dataset/row counts, provider mode, scenario, concurrency/duration, repeat count, exact command and output location. Capture the observed behavior before deciding whether the acceptance condition passed.

| Scenario | Result status | Evidence to fill in |
| --- | --- | --- |
| V1 repeated reads | Not run | p50/p95, errors, throughput, query count/time and database load |
| V1 synchronous email | Not run | Disabled/normal/delayed timings, provider failures and saved state |
| V2 caching | Not run | Cold/warm metrics, hit/miss ratio, TTL and invalidation results |
| V2 failures and limits | Not run | Redis outage/recovery, isolation, counters and reset |
| V2 stampede | Not run | Concurrent-miss database work before/after mitigation |
| V3 asynchronous email | Not run | Request latency, delivery latency and queue depth |
| V3 reliability | Not run | Crash/redelivery, retries, dead letters, duplicates and confirms |
| V3 outbox/scaling | Not run | Commit/publish recovery and one-versus-three-worker throughput |

Latency improvement, when applicable: `(baseline latency - new latency) / baseline latency * 100`. Include the actual values and variation across repeats. Query reductions, throughput and delivery guarantees are separate outcomes; do not collapse them into one success claim.

After each failure experiment, restore the email adapter to `normal`, start stopped services, return to one worker and inspect queues/outbox state. Reset only the owned fixture data/keys when another scenario requires it. Repeat comparable tests across version Git revisions in task 11.3 and document improvements and costs honestly.

**Interview explanation:** Baseline aur upgraded version ko same conditions mein compare karte hain. p95 slow requests ko samajhne mein help karta hai. Queue se request fast ho sakti hai, lekin email completion alag measure hoti hai. Failure experiments dikhate hain ke saved data aur pending work recover hota hai ya nahi.
