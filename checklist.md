# TeamFlow implementation checklist

Keep the existing phase and task division. Build three versions of the same application, with small tasks and beginner-friendly explanations.

## Stack and working rules

- Frontend: Next.js, TypeScript and Tailwind CSS.
- Backend: Node.js, Express and TypeScript.
- Database: Supabase PostgreSQL; ORM: Prisma. Authentication: Supabase Auth.
- Infrastructure: Docker Compose. Add Redis only in V2 and RabbitMQ only in V3, with a separate Node.js worker.
- Tests and measurements: Vitest, Supertest and k6. Version control: Git and GitHub.
- Follow the existing folder structure. Prefer simple, readable code and the simplest correct implementation; avoid unnecessary dependencies, files and abstractions.
- Stay within the roadmap, introduce no microservices, and never generate the entire application at once.
- Use English for code, identifiers and commit messages. Explain new concepts in easy Roman Urdu mixed with English.
- Never commit secrets or environment credentials.
- Save overview and setup in `README.md`, HLD diagrams and ERD in `docs/architecture.md`, the full checkbox roadmap in `docs/roadmap.md`, and experiment instructions and results in `docs/experiments.md`. Do not add documentation files unless genuinely needed.
- Use this checklist as the source for the roadmap. Keep task order and completion status aligned when updating either file.

## Completion rules for every task

The test and acceptance checks below describe future work; their presence does not mean a task has passed.

1. Prepare and present the planning files, proposed architecture and file structure; obtain planning approval before application setup or feature implementation.
2. After planning approval, implement only one checkbox task at a time.
3. Run its relevant checks and tests. Do not mark the task complete when tests fail.
4. Explain the change and, for important features, the problem, simple solution, manual test steps, limitations, possible future need for Redis or RabbitMQ, measurement method and interview explanation.
5. Inspect the diff and exclude unrelated changes before committing.
6. Create a Git commit and push it to the configured GitHub branch. Report the actual hash and push status; report a failed push honestly.
7. Update the roadmap checkbox after successful checks, and keep checklist status aligned.
8. STOP and wait for approval before starting the next checkbox, including small tasks within the same phase.

After every task, respond with:

**Task:** What was implemented

**Files changed:** Short list

**How to test:** Simple instructions

**What I learned:** Plain-English explanation, with new concepts explained in easy Roman Urdu mixed with English

**Git commit:** Actual commit hash and push status

**Next task:** Name only; do not implement it

**Status:** Waiting for my review

Every experiment must include exact prerequisites, commands, expected observations, what to inspect, measurements, results and trade-offs in `docs/experiments.md`. Reproduce the actual problem before introducing Redis or RabbitMQ; do not add a technology solely because it appears on the roadmap.

## Phase 0 — Planning & setup
Planning comes first. Complete the planning tasks and obtain approval before the setup tasks below; no feature implementation in this phase.

- [ ] Write a simple project overview and MVP scope
  - Test: Read the overview as a new user. Acceptance: README.md explains what users can do and the V1 scope.
- [ ] Create HLD diagrams for V1, V2 and V3
  - Test: Render all three Mermaid diagrams. Acceptance: docs/architecture.md shows V1 PostgreSQL, V2 Redis and V3 RabbitMQ with a separate worker.
- [ ] Create a simple database ERD
  - Test: Trace a workspace, project, task, comment and notification through the ERD. Acceptance: Relationships, keys and Supabase Auth user references are clear.
- [ ] Define API endpoints and user flows
  - Test: Walk through signup to assignment, comment and notification using the endpoint plan. Acceptance: Methods, paths, auth, permissions, request/response examples and error cases are documented in docs/architecture.md.
- [ ] Write the complete V1/V2/V3 roadmap in docs/roadmap.md
  - Test: Compare the roadmap against all checklist phases. Acceptance: Every task has a small scope, a simple test and acceptance criteria.
- [ ] Plan reproducible Redis and RabbitMQ experiments in docs/experiments.md
  - Test: Review commands, inputs, expected observations and metrics for each experiment. Acceptance: The plan demonstrates caching problems, synchronous email delays and unreliable operations before infrastructure changes.
- [ ] Present the architecture and proposed file structure for planning approval
  - Test: Review README.md and the three planned docs files together. Acceptance: The user approves planning before setup or implementation starts.
- [ ] Set up GitHub repository and project folders
  - Test: Inspect the remote, branch, folder structure and ignore rules. Acceptance: The approved structure exists and credentials are excluded from Git.
- [ ] Set up Next.js, Express and TypeScript
  - Test: Start frontend and backend using documented commands. Acceptance: Both start successfully with TypeScript and Tailwind CSS configured for the frontend.
- [ ] Connect Supabase PostgreSQL
  - Test: Apply the initial Prisma migration and perform a database read. Acceptance: Prisma connects to Supabase PostgreSQL and the schema can be recreated with documented commands.
- [ ] Add environment example and basic health check
  - Test: Start from the example configuration and call the health endpoint. Acceptance: Required variables are documented without secrets and the endpoint returns its documented status.
- [ ] Set up Vitest and Supertest for backend checks
  - Test: Run a small health-endpoint test and a simple unit test. Acceptance: Both tools run using documented commands and report failures correctly.
- [ ] Add Docker Compose for the approved V1 local processes
  - Test: Start and stop the configured V1 processes using the documented Compose commands. Acceptance: V1 uses Supabase PostgreSQL and includes no Redis or RabbitMQ services.

## Phase 1 — Authentication
V1 · Normal application

- [ ] Create signup form
  - Test: Submit empty, invalid and valid form values. Acceptance: Validation is clear and valid input can be submitted.
- [ ] Register user using Supabase Auth
  - Test: Register a new address and retry an existing address. Acceptance: A valid user is created and duplicate or invalid signup errors are shown clearly.
- [ ] Create login form
  - Test: Submit missing and valid credentials. Acceptance: Fields validate and the form can submit valid input.
- [ ] Implement login
  - Test: Try correct and incorrect credentials. Acceptance: Valid credentials open the authenticated app and invalid credentials show an error.
- [ ] Implement logout
  - Test: Log out and attempt to revisit a protected page. Acceptance: The session is cleared and protected content requires login.
- [ ] Keep user logged in after refresh
  - Test: Refresh an authenticated page and exercise session expiry or refresh. Acceptance: A valid session persists and an expired session is handled safely.
- [ ] Protect dashboard routes
  - Test: Open a dashboard while signed out and while signed in. Acceptance: Only authenticated users can view protected pages.
- [ ] Validate Supabase access tokens in the Express API
  - Test: Call a protected endpoint with missing, invalid, expired and valid tokens. Acceptance: The backend accepts only valid tokens and derives the authenticated user from the verified session.
- [ ] Show auth errors clearly
  - Test: Trigger invalid credentials and a failed auth request. Acceptance: Useful errors appear without exposing credentials or internal details.
- [ ] Test signup, login and logout
  - Test: Run the authentication checks and follow the manual auth flow. Acceptance: Signup, session persistence, login and logout pass.

## Phase 2 — Workspaces
V1 · Normal application

- [ ] Create workspace
  - Test: Create a workspace and submit an invalid name. Acceptance: A valid workspace is saved with its creator as a member; invalid input is rejected.
- [ ] Display user's workspaces
  - Test: List workspaces for users with different memberships. Acceptance: Only the current user's workspaces appear.
- [ ] Open workspace dashboard
  - Test: Open a joined workspace and attempt another user's workspace. Acceptance: The dashboard loads authorized data and denies unauthorized access.
- [ ] Rename workspace
  - Test: Rename as an allowed member and as a user without permission. Acceptance: The valid rename persists and unauthorized changes fail.
- [ ] Invite existing user by email
  - Test: Invite an existing user, repeat the invitation and try an unknown address. Acceptance: Membership follows the documented flow without duplicates; unknown users receive a clear result.
- [ ] List workspace members
  - Test: Compare the member list with stored memberships. Acceptance: Only authorized users can see the correct workspace members.
- [ ] Remove member with permission checks
  - Test: Remove a member with and without the required permission. Acceptance: Authorized removal succeeds and removed members lose workspace access.
- [ ] Test workspace permissions
  - Test: Run member and nonmember API scenarios. Acceptance: Workspace reads, changes, invitations and removal enforce the planned permissions.

## Phase 3 — Projects
V1 · Normal application

- [ ] Create project inside workspace
  - Test: Create in a joined workspace and attempt creation outside it. Acceptance: Valid projects belong to the intended workspace and unauthorized creation fails.
- [ ] List projects
  - Test: List projects for two workspaces with different memberships. Acceptance: Only projects in an accessible workspace are returned.
- [ ] Open project details
  - Test: Open an accessible project and an inaccessible project. Acceptance: Correct project details load only for authorized users.
- [ ] Rename project
  - Test: Rename with a permitted account and an unauthorized account. Acceptance: Valid changes persist and unauthorized changes fail.
- [ ] Delete project with confirmation
  - Test: Cancel deletion, then confirm it. Acceptance: Cancel preserves the project; confirmed authorized deletion follows the documented relationship rules.
- [ ] Prevent unauthorized access
  - Test: Request project endpoints directly using another workspace's project ID. Acceptance: The API rejects unauthorized reads and writes.
- [ ] Test project CRUD
  - Test: Run project creation, read, rename and deletion cases. Acceptance: Project CRUD and its permission checks pass.

## Phase 4 — Tasks
V1 · Normal application

- [ ] Create task with title and description
  - Test: Create a valid task and submit a missing title. Acceptance: Valid tasks persist in the project and invalid input is rejected.
- [ ] List tasks in a project
  - Test: List tasks in two different projects. Acceptance: The response contains only the selected authorized project's tasks.
- [ ] Open task details
  - Test: Open a valid task and request an inaccessible task. Acceptance: Authorized users see the correct task and others are denied.
- [ ] Edit task
  - Test: Change task details and reload them. Acceptance: Authorized changes persist and validation rejects invalid input.
- [ ] Assign task to workspace member
  - Test: Assign a member and attempt to assign a nonmember. Acceptance: Only members of the task's workspace can be assigned.
- [ ] Set due date
  - Test: Set, change and clear a due date; submit an invalid date. Acceptance: Valid dates persist consistently and invalid dates are rejected.
- [ ] Change status: Todo, In Progress, Done
  - Test: Save each supported status and attempt an unknown status. Acceptance: Only the three planned statuses are accepted and displayed correctly.
- [ ] Filter tasks by status
  - Test: Filter a project containing tasks in all statuses. Acceptance: Each filter returns only matching tasks.
- [ ] Add comments to tasks
  - Test: Post and reload a comment, then attempt posting without access. Acceptance: Authorized comments persist with their author and task; unauthorized comments fail.
- [ ] Delete task with confirmation
  - Test: Cancel deletion, then confirm it with an authorized account. Acceptance: Cancel preserves the task and confirmation removes it according to the documented relationship rules.
- [ ] Test task CRUD and permissions
  - Test: Run CRUD, assignment, status, due-date, filter and comment cases. Acceptance: Task features pass and workspace boundaries are enforced.

## Phase 5 — Basic notifications
V1 · No queue yet

- [ ] Create notifications table
  - Test: Apply the migration and insert a valid notification. Acceptance: Notifications have a recipient, assignment reference, read state and required relationships.
- [ ] Save notification when task is assigned
  - Test: Assign a task and inspect the recipient's notifications. Acceptance: The intended recipient receives the persisted assignment notification.
- [ ] Display notification list
  - Test: Open notifications as two different users. Acceptance: Each user sees only their own notifications.
- [ ] Mark notification as read
  - Test: Mark an owned notification, then attempt another user's notification. Acceptance: Read state persists only for the authorized recipient.
- [ ] Add basic synchronous email sending using a test provider
  - Test: Assign a task and inspect the test provider's inbox. Acceptance: The request waits for email sending and the expected message reaches the test inbox.
- [ ] Measure request time with and without email sending
  - Test: Repeat the same assignment workload with email enabled and disabled. Acceptance: Recorded timings show the synchronous email cost under comparable conditions.
- [ ] Record failure when email provider is unavailable
  - Test: Disable or fail the provider and submit an assignment. Acceptance: The HTTP result, saved task/notification state and email outcome are recorded with reproduction steps.

## Phase 6 — Baseline measurements
V1 · Identify actual problems

- [ ] Seed realistic sample projects and tasks
  - Test: Run the seed process and inspect generated relationships. Acceptance: A documented, repeatable dataset includes multiple workspaces, members, projects and tasks.
- [ ] Add request-duration logging
  - Test: Call successful and failing API requests. Acceptance: Logs identify route, status and duration without exposing secrets.
- [ ] Measure dashboard and task-list latency
  - Test: Repeat dashboard and task-list requests with a fixed dataset. Acceptance: Baseline samples, environment and workload are recorded.
- [ ] Inspect repeated PostgreSQL queries
  - Test: Repeat the measured reads and inspect Prisma query logging or database statistics. Acceptance: Query counts and durations identify actual repeated database work.
- [ ] Run basic load test with k6
  - Test: Run a documented k6 workload against authorized endpoints. Acceptance: The run completes and records concurrency, duration, errors and latency.
- [ ] Record p50/p95 latency and database load
  - Test: Review the load-test output alongside database metrics. Acceptance: p50, p95, error rate, throughput and available database-load metrics are recorded with their collection method.
- [ ] Document observed bottlenecks and decide whether caching is justified
  - Test: Reproduce the suspected bottleneck using the recorded commands. Acceptance: Measured evidence and trade-offs justify a V2 caching experiment.
- [ ] Demonstrate the repeated-read problem before adding Redis
  - Test: Follow the baseline commands for repeated dashboard reads under load. Acceptance: Observed PostgreSQL work and latency are recorded with a measurable goal for the Redis experiment.

## Phase 7 — Redis caching
V2 · First infrastructure upgrade

- [ ] Run Redis using Docker Compose
  - Test: Start the Redis service and check connectivity. Acceptance: Redis starts with documented configuration in V2.
- [ ] Connect Express API to Redis
  - Test: Connect with valid settings and exercise an unavailable Redis endpoint. Acceptance: Connection errors are bounded and handled clearly.
- [ ] Define workspace-scoped cache keys and authorization order
  - Test: Review keys for two workspaces and request a cached resource without access. Acceptance: Keys distinguish resources and relevant query parameters; authorization runs before cached data is returned.
- [ ] Cache project dashboard reads
  - Test: Request the same authorized dashboard on a cold cache and then a warm cache. Acceptance: Cache-aside reads populate on a miss and reuse cached data on a hit.
- [ ] Log cache hit and cache miss
  - Test: Request cold and warm cache keys. Acceptance: Logs distinguish hits and misses for the measured route.
- [ ] Set cache TTL
  - Test: Populate a key, inspect its TTL and request it after expiry. Acceptance: Entries expire and the next read reloads current PostgreSQL data.
- [ ] Invalidate cache after task changes
  - Test: Create, edit, assign, change status and delete a task, then reread affected dashboards. Acceptance: Affected cached views show current data after each mutation.
- [ ] Compare before/after performance
  - Test: Repeat the V1 workload and dataset with cold and warm Redis caches. Acceptance: Comparable latency, query counts, errors and database load show the measured impact.
- [ ] Stop Redis and test fallback to PostgreSQL
  - Test: Stop Redis during reads and writes, then restart it. Acceptance: Authorized requests fall back within bounded time and recovery does not serve stale affected data.
- [ ] Document when Redis helped and when it did not
  - Test: Review cold, warm and unavailable-cache results. Acceptance: Measured benefits, overhead, limitations and operating trade-offs are explained.

## Phase 8 — Redis advanced basics
V2 · Beyond caching

- [ ] Add API rate limiting using Redis
  - Test: Send requests below and above the chosen limit. Acceptance: Allowed traffic succeeds and excess traffic receives the documented rate-limit response.
- [ ] Test rate-limit reset and concurrent requests
  - Test: Send concurrent requests and repeat after the limit window resets. Acceptance: Counts remain consistent and requests are allowed again after reset.
- [ ] Create a cache-stampede experiment
  - Test: Expire a popular key and send simultaneous requests. Acceptance: Logs and query counts demonstrate the resulting burst of database work.
- [ ] Implement a simple stampede mitigation
  - Test: Repeat the same experiment after the chosen mitigation. Acceptance: Database work decreases and waiting requests complete without an indefinite lock.
- [ ] Test cache isolation between workspaces
  - Test: Request similarly shaped resources across two workspaces and attempt unauthorized reads. Acceptance: Cache keys cannot mix workspace data and authorization applies on cache hits.
- [ ] Document Redis failure behavior
  - Test: Interrupt Redis during cache reads, invalidation and rate limiting. Acceptance: Timeouts, fallback, recovery and the chosen rate-limit failure policy are documented.

## Phase 9 — RabbitMQ basics
V3 · Async processing

- [ ] Run RabbitMQ using Docker Compose
  - Test: Start the RabbitMQ service and check connectivity. Acceptance: RabbitMQ starts with documented V3 configuration.
- [ ] Configure an exchange, queue, routing key and binding
  - Test: Publish with matching and nonmatching routing keys and inspect the queue. Acceptance: Exchange and routing behavior match the documented event flow; queue durability and message persistence choices are explicit.
- [ ] Open RabbitMQ management dashboard
  - Test: Open the dashboard and locate the planned exchange and queue. Acceptance: The documented local dashboard exposes queue depth and consumer state.
- [ ] Create a small Node.js worker
  - Test: Start and stop the worker independently of the Express process. Acceptance: A separate worker process connects and shuts down cleanly.
- [ ] Publish task-assigned event
  - Test: Assign a task and inspect the published event. Acceptance: The producer emits the planned event with an event ID and required data.
- [ ] Consume event in worker
  - Test: Publish a known event and inspect worker output. Acceptance: The consumer receives the expected payload through the configured route.
- [ ] Send email from worker
  - Test: Assign a task while the worker and test provider are running. Acceptance: The worker sends the expected email and HTTP processing no longer waits for email delivery.
- [ ] Compare synchronous vs asynchronous request latency
  - Test: Repeat the synchronous baseline workload with the worker-based flow. Acceptance: Comparable request latency and separate email completion time are recorded.
- [ ] Test broker connection failure
  - Test: Stop RabbitMQ before publishing and while the producer or worker is connected. Acceptance: Observed API behavior, event outcome and recovery limitations are recorded honestly.
- [ ] Demonstrate event loss and duplicate-delivery risks before reliability fixes
  - Test: Crash the API or worker around database commit, publish and email processing. Acceptance: Reproducible observations show why ACK/NACK, retries, idempotency, confirms and an outbox are needed.

## Phase 10 — RabbitMQ reliability
V3 · Failure handling

- [ ] Add message acknowledgements
  - Test: Process a valid message and a deliberately failing message. Acceptance: ACK occurs after success and NACK/reject follows the documented failure policy.
- [ ] Test worker crash before ACK
  - Test: Terminate the worker after receipt but before acknowledgement, then restart it. Acceptance: The unacknowledged message is redelivered and the outcome is recorded.
- [ ] Add retry with bounded backoff
  - Test: Use a transiently failing email provider. Acceptance: Retries are delayed, bounded and stop after success or the attempt limit.
- [ ] Create dead-letter queue
  - Test: Exhaust retries for a message. Acceptance: The message reaches the configured dead-letter queue with diagnostic context.
- [ ] Test permanently failing jobs
  - Test: Submit a job that will never succeed. Acceptance: Retries terminate, the message reaches the dead-letter queue and healthy jobs can proceed.
- [ ] Make notification processing idempotent
  - Test: Deliver the same event repeatedly and concurrently. Acceptance: Database notification effects occur once per event; external email duplication limits and any provider idempotency support are documented.
- [ ] Configure publisher confirms
  - Test: Publish while healthy and interrupt the broker before confirmation. Acceptance: Confirmed and unconfirmed publishes are distinguished and uncertain outcomes can be retried safely.
- [ ] Add PostgreSQL transactional outbox
  - Test: Commit an assignment and its event together, then exercise rollback. Acceptance: Business data and the outbox row commit atomically; a dispatcher publishes pending events and records confirmed progress.
- [ ] Test database commit versus broker failure
  - Test: Commit while RabbitMQ is down, recover it and simulate a dispatcher crash after publish. Acceptance: Committed events remain recoverable and redelivery is handled without duplicate database effects.
- [ ] Run multiple workers and compare throughput
  - Test: Repeat a fixed workload with one worker and then multiple workers. Acceptance: Throughput, queue depth and delivery correctness are recorded under provider limits.

## Phase 11 — Final verification
Portfolio and interview readiness

- [ ] Run full end-to-end user flow
  - Test: Complete signup, workspace, project, task, assignment, comment and notification flows. Acceptance: The complete planned experience works with the chosen version's email flow.
- [ ] Run regression and permission tests
  - Test: Run the available Vitest and Supertest suites, including cross-workspace access cases. Acceptance: Feature, authentication and permission regressions pass.
- [ ] Repeat load tests across V1/V2/V3
  - Test: Run comparable workloads using documented version configurations or Git revisions. Acceptance: p50/p95, errors, throughput and relevant database, cache and queue measurements are comparable.
- [ ] Write architecture decisions and trade-offs
  - Test: Review each infrastructure choice against experiment evidence. Acceptance: docs/architecture.md explains the chosen design, alternatives and limitations.
- [ ] Document failure experiments and results
  - Test: Follow the Redis, broker, worker and provider failure instructions. Acceptance: docs/experiments.md contains reproducible commands, observations and recovery results.
- [ ] Add setup guide and screenshots
  - Test: Follow README.md from a clean checkout. Acceptance: Documented setup works and screenshots show the supported user flows without secrets.
- [ ] Prepare interview questions and demo walkthrough
  - Test: Walk through the demo and explain the design decisions aloud. Acceptance: The existing docs support a practical demo and clear explanations of measured trade-offs.
- [ ] Deploy supported components and verify production behavior
  - Test: Run the documented health, auth and main-user-flow checks against the deployment. Acceptance: Supported components work with environment configuration; hosting constraints and unsupported components are documented.
