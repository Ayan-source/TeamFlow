# TeamFlow — V1/V2/V3 implementation roadmap

This is the full roadmap for task **0.5**, based on [checklist.md](../checklist.md). It keeps the same phases, task IDs, order, tests and acceptance criteria. [progress.md](../progress.md) records short updates and the next task.

## How we work

- Complete one checkbox task, run its relevant checks, update the checklist, this roadmap and progress, then review the diff, commit and push. Stop for review before the next checkbox.
- Existing IDs stay stable. When adding a task, give it the next unused number within its phase and update both task lists in the same change.
- Partial or blocked tasks stay unchecked. A successful check is required for completion; a failed push leaves delivery incomplete and must be reported.
- Planning approval is task **0.7**. Reviewing an individual planning task does not approve application setup. Complete the planning documents and architecture/file-structure review before setup tasks **0.8–0.13**.
- Use Next.js, TypeScript and Tailwind CSS for the frontend; Express and TypeScript for the API; Supabase PostgreSQL with Prisma and Supabase Auth for persistence/authentication.
- Docker Compose runs approved local processes. Redis begins in V2; RabbitMQ and the separate worker begin in V3. Build the same application across all three versions.
- Keep code readable, dependencies necessary and scope within the checklist. Use English identifiers and commits, and easy Roman Urdu mixed with English when explaining concepts.
- Keep secrets out of Git. Local project instructions in `prompt.md` remain ignored.

## Version milestones

| Milestone | Phases | Expected result |
| --- | --- | --- |
| Planning and setup | 0 | Reviewed overview, HLDs, ERD, API contract, roadmap and experiment plan; approved local setup afterward. |
| V1 — PostgreSQL application | 1–6 | Working auth, workspaces, projects, tasks, comments, notifications and synchronous email, with measured performance/failure baselines. |
| V2 — Redis | 7–8 | Measured cache-aside improvement, TTL/invalidation, rate limiting, stampede handling, isolation and graceful fallback. |
| V3 — RabbitMQ | 9–10 | Background email with routing, acknowledgements, retries, dead-letter handling, idempotency, confirms, outbox recovery and worker scaling. |
| Final verification | 11 | Passing user flows and permissions, comparable measurements, documented trade-offs, a demo and verified deployment. |

## Design and experiment references

- [Project overview and scope](../README.md).
- [Architecture diagrams](architecture.md#2-versioned-high-level-design).
- [Database ERD](architecture.md#8-postgresql-database-erd).
- [API endpoints and user flows](architecture.md#9-api-endpoints-and-user-flows).
- [Experiment plan](experiments.md) defines planned reproduction commands, observations, measurements and results records; scripts become runnable in their listed implementation tasks.

Before V2, reproduce the repeated-read problem in V1. Before V3, reproduce synchronous email delays and unavailable-provider outcomes. In early V3, demonstrate event loss and redelivery risks before introducing the reliability fixes. Infrastructure choices need measured benefits and explained trade-offs.

The checks below describe each task's acceptance; unchecked tasks have not been completed.

## Phase 0 — Planning & setup
Planning comes first. Complete the planning tasks and obtain approval before the setup tasks below; no feature implementation in this phase.

**Phase goal:** Prepare and review the planning documents, then complete the approved local setup. Tasks 0.1–0.7 are planning; tasks 0.8–0.13 are setup after approval. GitHub initialization is already done, but task 0.8 stays unchecked until the approved folders are ready.

- [x] **0.1** Write a simple project overview and MVP scope
  - Test: Read the overview as a new user. Acceptance: README.md explains what users can do and the V1 scope.
- [x] **0.2** Create HLD diagrams for V1, V2 and V3
  - Test: Read the three boxed text HLD diagrams and trace request, cache, email and failure/recovery paths. Acceptance: docs/architecture.md explains component ownership and shows V1 PostgreSQL, V2 Redis and V3 RabbitMQ with a separate worker, using numbered architecture sections.
- [x] **0.3** Create a simple database ERD
  - Test: Trace a workspace, project, task, comment and notification through the ERD. Acceptance: Relationships, keys and Supabase Auth user references are clear.
- [x] **0.4** Define API endpoints and user flows
  - Test: Walk through signup to assignment, comment and notification using the endpoint plan. Acceptance: Methods, paths, auth, permissions, request/response examples and error cases are documented in docs/architecture.md.
- [x] **0.5** Write the complete V1/V2/V3 roadmap in docs/roadmap.md
  - Test: Compare the roadmap against all checklist phases. Acceptance: Every task has a small scope, a simple test and acceptance criteria.
- [x] **0.6** Plan reproducible Redis and RabbitMQ experiments in docs/experiments.md
  - Test: Review commands, inputs, expected observations and metrics for each experiment. Acceptance: The plan demonstrates caching problems, synchronous email delays and unreliable operations before infrastructure changes.
- [ ] **0.7** Present the architecture and proposed file structure for planning approval
  - Test: Review README.md and the three planned docs files together. Acceptance: The user approves planning before setup or implementation starts.
- [ ] **0.8** Set up GitHub repository and project folders
  - Test: Inspect the remote, branch, folder structure and ignore rules. Acceptance: The approved structure exists and credentials are excluded from Git.
- [ ] **0.9** Set up Next.js, Express and TypeScript
  - Test: Start frontend and backend using documented commands. Acceptance: Both start successfully with TypeScript and Tailwind CSS configured for the frontend.
- [ ] **0.10** Connect Supabase PostgreSQL
  - Test: Apply the initial Prisma migration and perform a database read. Acceptance: Prisma connects to Supabase PostgreSQL and the schema can be recreated with documented commands.
- [ ] **0.11** Add environment example and basic health check
  - Test: Start from the example configuration and call the health endpoint. Acceptance: Required variables are documented without secrets and the endpoint returns its documented status.
- [ ] **0.12** Set up Vitest and Supertest for backend checks
  - Test: Run a small health-endpoint test and a simple unit test. Acceptance: Both tools run using documented commands and report failures correctly.
- [ ] **0.13** Add Docker Compose for the approved V1 local processes
  - Test: Start and stop the configured V1 processes using the documented Compose commands. Acceptance: V1 uses Supabase PostgreSQL and includes no Redis or RabbitMQ services.

## Phase 1 — Authentication
V1 · Normal application

**Phase goal:** Let users register, sign in, restore a session and sign out. Include profile synchronization during registration/login, and verify Supabase tokens in Express before protected application features.

- [ ] **1.1** Create signup form
  - Test: Submit empty, invalid and valid form values. Acceptance: Validation is clear and valid input can be submitted.
- [ ] **1.2** Register user using Supabase Auth
  - Test: Register a new address and retry an existing address. Acceptance: A valid user is created and duplicate or invalid signup errors are shown clearly.
- [ ] **1.3** Create login form
  - Test: Submit missing and valid credentials. Acceptance: Fields validate and the form can submit valid input.
- [ ] **1.4** Implement login
  - Test: Try correct and incorrect credentials. Acceptance: Valid credentials open the authenticated app and invalid credentials show an error.
- [ ] **1.5** Implement logout
  - Test: Log out and attempt to revisit a protected page. Acceptance: The session is cleared and protected content requires login.
- [ ] **1.6** Keep user logged in after refresh
  - Test: Refresh an authenticated page and exercise session expiry or refresh. Acceptance: A valid session persists and an expired session is handled safely.
- [ ] **1.7** Protect dashboard routes
  - Test: Open a dashboard while signed out and while signed in. Acceptance: Only authenticated users can view protected pages.
- [ ] **1.8** Validate Supabase access tokens in the Express API
  - Test: Call a protected endpoint with missing, invalid, expired and valid tokens. Acceptance: The backend accepts only valid tokens and derives the authenticated user from the verified session.
- [ ] **1.9** Show auth errors clearly
  - Test: Trigger invalid credentials and a failed auth request. Acceptance: Useful errors appear without exposing credentials or internal details.
- [ ] **1.10** Test signup, login and logout
  - Test: Run the authentication checks and follow the manual auth flow. Acceptance: Signup, session persistence, login and logout pass.

## Phase 2 — Workspaces
V1 · Normal application

**Phase goal:** Let users work inside their own workspaces. Enforce owner permissions for workspace renaming and membership changes, and keep membership checks consistent with the ERD and API plan.

- [ ] **2.1** Create workspace
  - Test: Create a workspace and submit an invalid name. Acceptance: A valid workspace is saved with its creator as a member; invalid input is rejected.
- [ ] **2.2** Display user's workspaces
  - Test: List workspaces for users with different memberships. Acceptance: Only the current user's workspaces appear.
- [ ] **2.3** Open workspace dashboard
  - Test: Open a joined workspace and attempt another user's workspace. Acceptance: The dashboard loads authorized data and denies unauthorized access.
- [ ] **2.4** Rename workspace
  - Test: Rename as an allowed member and as a user without permission. Acceptance: The valid rename persists and unauthorized changes fail.
- [ ] **2.5** Invite existing user by email
  - Test: Invite an existing user, repeat the invitation and try an unknown address. Acceptance: Membership follows the documented flow without duplicates; unknown users receive a clear result.
- [ ] **2.6** List workspace members
  - Test: Compare the member list with stored memberships. Acceptance: Only authorized users can see the correct workspace members.
- [ ] **2.7** Remove member with permission checks
  - Test: Remove a member with and without the required permission. Acceptance: Authorized removal succeeds and removed members lose workspace access.
- [ ] **2.8** Test workspace permissions
  - Test: Run member and nonmember API scenarios. Acceptance: Workspace reads, changes, invitations and removal enforce the planned permissions.

## Phase 3 — Projects
V1 · Normal application

**Phase goal:** Let workspace members manage projects and open project details/dashboard reads. Follow the project contracts in architecture section 9.4; keep unauthorized users outside the workspace boundary.

- [ ] **3.1** Create project inside workspace
  - Test: Create in a joined workspace and attempt creation outside it. Acceptance: Valid projects belong to the intended workspace and unauthorized creation fails.
- [ ] **3.2** List projects
  - Test: List projects for two workspaces with different memberships. Acceptance: Only projects in an accessible workspace are returned.
- [ ] **3.3** Open project details
  - Test: Open an accessible project and an inaccessible project. Acceptance: Correct project details load only for authorized users.
- [ ] **3.4** Rename project
  - Test: Rename with a permitted account and an unauthorized account. Acceptance: Valid changes persist and unauthorized changes fail.
- [ ] **3.5** Delete project with confirmation
  - Test: Cancel deletion, then confirm it. Acceptance: Cancel preserves the project; confirmed authorized deletion follows the documented relationship rules.
- [ ] **3.6** Prevent unauthorized access
  - Test: Request project endpoints directly using another workspace's project ID. Acceptance: The API rejects unauthorized reads and writes.
- [ ] **3.7** Test project CRUD
  - Test: Run project creation, read, rename and deletion cases. Acceptance: Project CRUD and its permission checks pass.

## Phase 4 — Tasks
V1 · Normal application

**Phase goal:** Let members manage tasks, assignments, due dates, statuses, filters and comments. Coordinate assignment and member removal as described in the ERD. Notification and email side effects are added in Phase 5.

- [ ] **4.1** Create task with title and description
  - Test: Create a valid task and submit a missing title. Acceptance: Valid tasks persist in the project and invalid input is rejected.
- [ ] **4.2** List tasks in a project
  - Test: List tasks in two different projects. Acceptance: The response contains only the selected authorized project's tasks.
- [ ] **4.3** Open task details
  - Test: Open a valid task and request an inaccessible task. Acceptance: Authorized users see the correct task and others are denied.
- [ ] **4.4** Edit task
  - Test: Change task details and reload them. Acceptance: Authorized changes persist and validation rejects invalid input.
- [ ] **4.5** Assign task to workspace member
  - Test: Assign a member and attempt to assign a nonmember. Acceptance: Only members of the task's workspace can be assigned.
- [ ] **4.6** Set due date
  - Test: Set, change and clear a due date; submit an invalid date. Acceptance: Valid dates persist consistently and invalid dates are rejected.
- [ ] **4.7** Change status: Todo, In Progress, Done
  - Test: Save each supported status and attempt an unknown status. Acceptance: Only the three planned statuses are accepted and displayed correctly.
- [ ] **4.8** Filter tasks by status
  - Test: Filter a project containing tasks in all statuses. Acceptance: Each filter returns only matching tasks.
- [ ] **4.9** Add comments to tasks
  - Test: Post and reload a comment, then attempt posting without access. Acceptance: Authorized comments persist with their author and task; unauthorized comments fail.
- [ ] **4.10** Delete task with confirmation
  - Test: Cancel deletion, then confirm it with an authorized account. Acceptance: Cancel preserves the task and confirmation removes it according to the documented relationship rules.
- [ ] **4.11** Test task CRUD and permissions
  - Test: Run CRUD, assignment, status, due-date, filter and comment cases. Acceptance: Task features pass and workspace boundaries are enforced.

## Phase 5 — Basic notifications
V1 · No queue yet

**Phase goal:** Create in-app assignment notifications and synchronous test-provider email. Distinguish a saved assignment from email failure or an uncertain provider outcome, and record the synchronous baseline before queues are introduced.

- [ ] **5.1** Create notifications table
  - Test: Apply the migration and insert a valid notification. Acceptance: Notifications have a recipient, assignment reference, read state and required relationships.
- [ ] **5.2** Save notification when task is assigned
  - Test: Assign a task and inspect the recipient's notifications. Acceptance: The intended recipient receives the persisted assignment notification.
- [ ] **5.3** Display notification list
  - Test: Open notifications as two different users. Acceptance: Each user sees only their own notifications.
- [ ] **5.4** Mark notification as read
  - Test: Mark an owned notification, then attempt another user's notification. Acceptance: Read state persists only for the authorized recipient.
- [ ] **5.5** Add basic synchronous email sending using a test provider
  - Test: Assign a task and inspect the test provider's inbox. Acceptance: The request waits for email sending and the expected message reaches the test inbox.
- [ ] **5.6** Measure request time with and without email sending
  - Test: Repeat the same assignment workload with email enabled and disabled. Acceptance: Recorded timings show the synchronous email cost under comparable conditions.
- [ ] **5.7** Record failure when email provider is unavailable
  - Test: Disable or fail the provider and submit an assignment. Acceptance: The HTTP result, saved task/notification state and email outcome are recorded with reproduction steps.

## Phase 6 — Baseline measurements
V1 · Identify actual problems

**Phase goal:** Build a repeatable baseline using a fixed dataset and workload. Measure authorized dashboard/task reads, repeated PostgreSQL queries, p50/p95 latency, errors, throughput and database load; record evidence for the Redis experiment.

- [ ] **6.1** Seed realistic sample projects and tasks
  - Test: Run the seed process and inspect generated relationships. Acceptance: A documented, repeatable dataset includes multiple workspaces, members, projects and tasks.
- [ ] **6.2** Add request-duration logging
  - Test: Call successful and failing API requests. Acceptance: Logs identify route, status and duration without exposing secrets.
- [ ] **6.3** Measure dashboard and task-list latency
  - Test: Repeat dashboard and task-list requests with a fixed dataset. Acceptance: Baseline samples, environment and workload are recorded.
- [ ] **6.4** Inspect repeated PostgreSQL queries
  - Test: Repeat the measured reads and inspect Prisma query logging or database statistics. Acceptance: Query counts and durations identify actual repeated database work.
- [ ] **6.5** Run basic load test with k6
  - Test: Run a documented k6 workload against authorized endpoints. Acceptance: The run completes and records concurrency, duration, errors and latency.
- [ ] **6.6** Record p50/p95 latency and database load
  - Test: Review the load-test output alongside database metrics. Acceptance: p50, p95, error rate, throughput and available database-load metrics are recorded with their collection method.
- [ ] **6.7** Document observed bottlenecks and decide whether caching is justified
  - Test: Reproduce the suspected bottleneck using the recorded commands. Acceptance: Measured evidence and trade-offs justify a V2 caching experiment.
- [ ] **6.8** Demonstrate the repeated-read problem before adding Redis
  - Test: Follow the baseline commands for repeated dashboard reads under load. Acceptance: Observed PostgreSQL work and latency are recorded with a measurable goal for the Redis experiment.

## Phase 7 — Redis caching
V2 · First infrastructure upgrade

**Phase goal:** Introduce Redis only after reproducing the repeated-read problem. Implement cache-aside, TTL and invalidation for authorized dashboard reads; compare cold/warm cache results and verify fallback and recovery.

- [ ] **7.1** Run Redis using Docker Compose
  - Test: Start the Redis service and check connectivity. Acceptance: Redis starts with documented configuration in V2.
- [ ] **7.2** Connect Express API to Redis
  - Test: Connect with valid settings and exercise an unavailable Redis endpoint. Acceptance: Connection errors are bounded and handled clearly.
- [ ] **7.3** Define workspace-scoped cache keys and authorization order
  - Test: Review keys for two workspaces and request a cached resource without access. Acceptance: Keys distinguish resources and relevant query parameters; authorization runs before cached data is returned.
- [ ] **7.4** Cache project dashboard reads
  - Test: Request the same authorized dashboard on a cold cache and then a warm cache. Acceptance: Cache-aside reads populate on a miss and reuse cached data on a hit.
- [ ] **7.5** Log cache hit and cache miss
  - Test: Request cold and warm cache keys. Acceptance: Logs distinguish hits and misses for the measured route.
- [ ] **7.6** Set cache TTL
  - Test: Populate a key, inspect its TTL and request it after expiry. Acceptance: Entries expire and the next read reloads current PostgreSQL data.
- [ ] **7.7** Invalidate cache after task changes
  - Test: Create, edit, assign, change status and delete a task, then reread affected dashboards. Acceptance: Affected cached views show current data after each mutation.
- [ ] **7.8** Compare before/after performance
  - Test: Repeat the V1 workload and dataset with cold and warm Redis caches. Acceptance: Comparable latency, query counts, errors and database load show the measured impact.
- [ ] **7.9** Stop Redis and test fallback to PostgreSQL
  - Test: Stop Redis during reads and writes, then restart it. Acceptance: Authorized requests fall back within bounded time and recovery does not serve stale affected data.
- [ ] **7.10** Document when Redis helped and when it did not
  - Test: Review cold, warm and unavailable-cache results. Acceptance: Measured benefits, overhead, limitations and operating trade-offs are explained.

## Phase 8 — Redis advanced basics
V2 · Beyond caching

**Phase goal:** Add shared rate limiting and investigate stampedes. Check concurrent counters, workspace isolation and the chosen outage behavior; choose a simple mitigation from the experiment results.

- [ ] **8.1** Add API rate limiting using Redis
  - Test: Send requests below and above the chosen limit. Acceptance: Allowed traffic succeeds and excess traffic receives the documented rate-limit response.
- [ ] **8.2** Test rate-limit reset and concurrent requests
  - Test: Send concurrent requests and repeat after the limit window resets. Acceptance: Counts remain consistent and requests are allowed again after reset.
- [ ] **8.3** Create a cache-stampede experiment
  - Test: Expire a popular key and send simultaneous requests. Acceptance: Logs and query counts demonstrate the resulting burst of database work.
- [ ] **8.4** Implement a simple stampede mitigation
  - Test: Repeat the same experiment after the chosen mitigation. Acceptance: Database work decreases and waiting requests complete without an indefinite lock.
- [ ] **8.5** Test cache isolation between workspaces
  - Test: Request similarly shaped resources across two workspaces and attempt unauthorized reads. Acceptance: Cache keys cannot mix workspace data and authorization applies on cache hits.
- [ ] **8.6** Document Redis failure behavior
  - Test: Interrupt Redis during cache reads, invalidation and rate limiting. Acceptance: Timeouts, fallback, recovery and the chosen rate-limit failure policy are documented.

## Phase 9 — RabbitMQ basics
V3 · Async processing

**Phase goal:** Introduce RabbitMQ and a separate Node.js worker after the synchronous email problem has been recorded. Start with direct publication to demonstrate routing and asynchronous processing, then reproduce reliability gaps before Phase 10.

- [ ] **9.1** Run RabbitMQ using Docker Compose
  - Test: Start the RabbitMQ service and check connectivity. Acceptance: RabbitMQ starts with documented V3 configuration.
- [ ] **9.2** Configure an exchange, queue, routing key and binding
  - Test: Publish with matching and nonmatching routing keys and inspect the queue. Acceptance: Exchange and routing behavior match the documented event flow; queue durability and message persistence choices are explicit.
- [ ] **9.3** Open RabbitMQ management dashboard
  - Test: Open the dashboard and locate the planned exchange and queue. Acceptance: The documented local dashboard exposes queue depth and consumer state.
- [ ] **9.4** Create a small Node.js worker
  - Test: Start and stop the worker independently of the Express process. Acceptance: A separate worker process connects and shuts down cleanly.
- [ ] **9.5** Publish task-assigned event
  - Test: Assign a task and inspect the published event. Acceptance: The producer emits the planned event with an event ID and required data.
- [ ] **9.6** Consume event in worker
  - Test: Publish a known event and inspect worker output. Acceptance: The consumer receives the expected payload through the configured route.
- [ ] **9.7** Send email from worker
  - Test: Assign a task while the worker and test provider are running. Acceptance: The worker sends the expected email and HTTP processing no longer waits for email delivery.
- [ ] **9.8** Compare synchronous vs asynchronous request latency
  - Test: Repeat the synchronous baseline workload with the worker-based flow. Acceptance: Comparable request latency and separate email completion time are recorded.
- [ ] **9.9** Test broker connection failure
  - Test: Stop RabbitMQ before publishing and while the producer or worker is connected. Acceptance: Observed API behavior, event outcome and recovery limitations are recorded honestly.
- [ ] **9.10** Demonstrate event loss and duplicate-delivery risks before reliability fixes
  - Test: Crash the API or worker around database commit, publish and email processing. Acceptance: Reproducible observations show why ACK/NACK, retries, idempotency, confirms and an outbox are needed.

## Phase 10 — RabbitMQ reliability
V3 · Failure handling

**Phase goal:** Make asynchronous work recoverable using ACK/NACK, bounded retries, dead-letter handling, idempotency, publisher confirms and a transactional outbox. Coordinate multiple workers and document external email duplication limits.

- [ ] **10.1** Add message acknowledgements
  - Test: Process a valid message and a deliberately failing message. Acceptance: ACK occurs after success and NACK/reject follows the documented failure policy.
- [ ] **10.2** Test worker crash before ACK
  - Test: Terminate the worker after receipt but before acknowledgement, then restart it. Acceptance: The unacknowledged message is redelivered and the outcome is recorded.
- [ ] **10.3** Add retry with bounded backoff
  - Test: Use a transiently failing email provider. Acceptance: Retries are delayed, bounded and stop after success or the attempt limit.
- [ ] **10.4** Create dead-letter queue
  - Test: Exhaust retries for a message. Acceptance: The message reaches the configured dead-letter queue with diagnostic context.
- [ ] **10.5** Test permanently failing jobs
  - Test: Submit a job that will never succeed. Acceptance: Retries terminate, the message reaches the dead-letter queue and healthy jobs can proceed.
- [ ] **10.6** Make notification processing idempotent
  - Test: Deliver the same event repeatedly and concurrently. Acceptance: Database notification effects occur once per event; external email duplication limits and any provider idempotency support are documented.
- [ ] **10.7** Configure publisher confirms
  - Test: Publish while healthy and interrupt the broker before confirmation. Acceptance: Confirmed and unconfirmed publishes are distinguished and uncertain outcomes can be retried safely.
- [ ] **10.8** Add PostgreSQL transactional outbox
  - Test: Commit an assignment and its event together, then exercise rollback. Acceptance: Business data and the outbox row commit atomically; a dispatcher publishes pending events and records confirmed progress.
- [ ] **10.9** Test database commit versus broker failure
  - Test: Commit while RabbitMQ is down, recover it and simulate a dispatcher crash after publish. Acceptance: Committed events remain recoverable and redelivery is handled without duplicate database effects.
- [ ] **10.10** Run multiple workers and compare throughput
  - Test: Repeat a fixed workload with one worker and then multiple workers. Acceptance: Throughput, queue depth and delivery correctness are recorded under provider limits.

## Phase 11 — Final verification
Portfolio and interview readiness

**Phase goal:** Check the complete application, compare versions using the same workload, and prepare the demo and interview explanation. Deploy supported components and document actual hosting limits and verified behavior.

- [ ] **11.1** Run full end-to-end user flow
  - Test: Complete signup, workspace, project, task, assignment, comment and notification flows. Acceptance: The complete planned experience works with the chosen version's email flow.
- [ ] **11.2** Run regression and permission tests
  - Test: Run the available Vitest and Supertest suites, including cross-workspace access cases. Acceptance: Feature, authentication and permission regressions pass.
- [ ] **11.3** Repeat load tests across V1/V2/V3
  - Test: Run comparable workloads using documented version configurations or Git revisions. Acceptance: p50/p95, errors, throughput and relevant database, cache and queue measurements are comparable.
- [ ] **11.4** Write architecture decisions and trade-offs
  - Test: Review each infrastructure choice against experiment evidence. Acceptance: docs/architecture.md explains the chosen design, alternatives and limitations.
- [ ] **11.5** Document failure experiments and results
  - Test: Follow the Redis, broker, worker and provider failure instructions. Acceptance: docs/experiments.md contains reproducible commands, observations and recovery results.
- [ ] **11.6** Add setup guide and screenshots
  - Test: Follow README.md from a clean checkout. Acceptance: Documented setup works and screenshots show the supported user flows without secrets.
- [ ] **11.7** Prepare interview questions and demo walkthrough
  - Test: Walk through the demo and explain the design decisions aloud. Acceptance: The existing docs support a practical demo and clear explanations of measured trade-offs.
- [ ] **11.8** Deploy supported components and verify production behavior
  - Test: Run the documented health, auth and main-user-flow checks against the deployment. Acceptance: Supported components work with environment configuration; hosting constraints and unsupported components are documented.
