# Website Tracker

A private dashboard for everything you have deployed: where each website runs, which database it uses and which account owns that database, and whether it is healthy right now.

It also runs server-side **health checks** and separate **wake-up requests** on a schedule, keeps their history, and emails you when a site goes down or comes back.

It is built to run on **Render's free tier with MongoDB Atlas M0**, and is designed around their limits (see [Scheduler architecture](#scheduler-architecture)).

---

## Contents

- [Features](#features)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Local development](#local-development)
- [MongoDB setup](#mongodb-setup)
- [Environment variables](#environment-variables)
- [Running the backend](#running-the-backend)
- [Running the frontend](#running-the-frontend)
- [Running tests](#running-tests)
- [Render deployment](#render-deployment)
- [MongoDB Atlas deployment](#mongodb-atlas-deployment)
- [Scheduler architecture](#scheduler-architecture)
- [Health-check architecture](#health-check-architecture)
- [Wake-up architecture](#wake-up-architecture)
- [Notifications](#notifications)
- [Security considerations](#security-considerations)
- [Troubleshooting](#troubleshooting)
- Reference: [API](docs/API.md) · [Database schema](docs/DATABASE.md)

---

## Features

**Inventory**
- A website is a project with shared details (name, description, project status, tags, repository, notes) and 1–10 **environments** (Production, Staging, Testing, Development, Other).
- Each environment records its website and backend URLs, deployed branch, frontend and backend hosting provider and region, and **database metadata**: provider, database name, project, cluster, region, the account provider used to sign in (Google/GitHub/…), the account email, and the dashboard URL.
- The provider lists are extensible (`shared/src/providers.ts`); anything unlisted can be recorded as "Other" with a custom name.
- **Metadata only.** Passwords, keys, tokens and connection strings are refused, both client- and server-side.

**Monitoring**
- **Health monitoring** per environment answers "is it healthy?". You choose the URL, method (GET/HEAD/POST), interval (1 min – 24 h, with presets or a custom value), timeout, failure threshold, slow-response threshold and accepted status codes.
- **Wake-up** per environment answers "send it traffic". It is configured, scheduled and logged independently, and its results never change health status.
- **Run health check now** and **Wake up now** buttons perform the request on the server and show the result.
- Statuses are **Healthy**, **Degraded** (slow, or failing below the threshold), **Down** (N consecutive failures), **Unknown** (no check yet) and **Monitoring off**.
- Every request is logged with its timestamps, response time, status code, result and a classified failure reason (timeout, DNS, connection refused/reset, TLS, unexpected status, redirect loop, blocked target, invalid URL).
- **SSRF protection:** requests to localhost, private networks, link-local and cloud metadata endpoints are blocked, including after DNS resolution and on every redirect.

**Views**
- **Home (default page after sign-in):** a launchpad of your websites as image cards. Tap a card to open the site in a new tab. Each card has a name, background image (or a colour placeholder when there is none) and a small health indicator when monitoring is on. Add and edit with a quick dialog (name, URL, image; phone photos are resized in the browser), and use the "⋯" menu for Edit, Details & monitoring, and Delete. It is a responsive grid: 1 column at 320 px, 2 on phones, more on tablets and desktops.
- **Dashboard:** totals, healthy/degraded/down counts, monitoring and wake-up counts, 24-hour uptime and average response time, a per-website health table, and recent activity. It refreshes every 30 seconds and warns when the scheduler has stalled or a wake-up is using up Render's free hours.
- **Inventory** (the full website table at `/websites`): search across names, URLs, providers and accounts; filter by health, environment, project status, tags, monitoring and wake-up; sort; paginate; toggle monitoring and wake-up inline.
- **Website details:** overview, repository, hosting, database, both monitors (last and next run, 7-day average response and uptime), a 24-hour response-time chart and recent logs.
- **Monitoring:** availability and response-time history by website, check type, result and date range. Shows total/successful/failed counts, uptime, and average/minimum/maximum/p95 response time, with charts and a table view.
- **Logs:** every request, filterable and paginated (keyset pagination, so deep pages stay fast).
- **Settings:** profile, password change, sign out everywhere; monitoring defaults; log retention (7/30/90/365 days or unlimited) with a storage estimate; email notifications with a test button and delivery history; theme, time zone (default Asia/Kolkata), date and time format.

**Notifications**
- Emails are sent when a site goes down, when it recovers, and when wake-ups keep failing. They are triggered by status changes only, never once per failed request.

---

## Architecture

```
                 ┌──────────────────────────────┐
  Browser ──────▶│ Render Static Site (free)    │  React SPA on Render's CDN
                 │   /api/*  ── rewrite ──┐     │  (one origin → first-party cookies)
                 └────────────────────────┼─────┘
                                          ▼
 cron-job.org (every 1 min) ──┐   ┌──────────────────────────────┐     outbound checks
 GitHub Actions (every 5 min) ┼──▶│ Render Web Service (free)    │ ──▶ (SSRF-guarded HTTP client)
 [paid] Render Cron Job ──────┘   │ Express API + scheduler tick │ ──▶ Resend (email over HTTPS)
                                  └──────────────┬───────────────┘
                                                 ▼
                                        MongoDB Atlas M0 (free)
```

The repository is an npm-workspaces monorepo with three packages:

```
shared/   validation schemas (Zod), types, provider lists, status rules, secret detection
server/   Express API · src/{config,controllers,middleware,models,routes,services,jobs,utils}
client/   React SPA   · src/{components,pages,layouts,hooks,services,context,types,utils}
```

Validation and status rules live in `shared` and are used by both the API and the UI, so the two can never disagree. Route handlers are thin; the logic lives in `server/src/services`.

**Key decisions**

| Decision | Why |
|---|---|
| The static site proxies `/api/*` to the API (Render rewrite) | `*.onrender.com` is on the Public Suffix List, so the site and the API on two subdomains are *different sites*. A cookie set by the API would be a third-party cookie, which Safari and other browsers block. Rewriting makes the browser see one origin, so the session cookie is first-party and `SameSite=Strict`, and no CORS is needed. |
| Opaque server-side sessions, not JWTs | Sessions can be revoked instantly (logout, password change, "sign out everywhere"). Only a SHA-256 hash of the token is stored. There is no signing secret to manage, which is why there is no `JWT_SECRET`/`SESSION_SECRET`. |
| One project with embedded environments | Avoids repeating project details for each environment, while every environment still gets its own hosting, database and monitors. |
| Monitors in their own collection | The scheduler claims monitors atomically one at a time, and new check types can be added later. See [docs/DATABASE.md](docs/DATABASE.md). |
| Mantine UI | One library covers components, dark mode, forms, toasts, dialogs and charts. |
| Card images live in their own collection and are served from the API's own origin | List responses stay small (they carry only a version string), the images work with the static site's strict CSP (`img-src 'self'`), and the URL changes whenever the image does, so browsers can cache it forever. See [docs/DATABASE.md](docs/DATABASE.md). |

---

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | React 19, Vite 8, TypeScript, React Router, TanStack Query, Mantine 9 (+ charts / dates / notifications / modals), Day.js |
| Backend | Node.js 22.12+ (24 recommended), Express 5, TypeScript, Mongoose 9, Zod 4, undici, Argon2, Helmet, express-rate-limit, Pino, Nodemailer |
| Database | MongoDB 7+ (Atlas M0 in production) |
| Tests | Vitest, Supertest, mongodb-memory-server, Testing Library |
| Hosting | Render Static Site + Render Web Service, MongoDB Atlas, cron-job.org, GitHub Actions |

---

## Local development

Requirements: **Node.js 22.12 or newer** (`.nvmrc` pins 24) and npm 10+. You do not need Docker or a local MongoDB install.

```bash
npm install                         # all workspaces
cp server/.env.example server/.env  # then edit it (see below)
```

In `server/.env`, set at least:
```ini
SETUP_TOKEN=any-string-of-16+-chars
# Optional: lets you monitor http://localhost services while developing
ALLOW_PRIVATE_TARGETS=true
```

Then run each of these in its own terminal:

```bash
npm run dev:db       # 1. local MongoDB replica set on :27018 (data persists in server/.dev-db)
npm run dev:server   # 2. API on http://localhost:4100 (auto-restarts on change)
npm run worker       # 3. scheduler loop — runs due checks every 15 s
npm run dev:client   # 4. UI on http://localhost:5173 (proxies /api to :4100)
```

Open http://localhost:5173. The first visit redirects to **/setup**: enter your `SETUP_TOKEN` and create the admin account.

> If you edit `shared/`, run `npm run dev:shared` (TypeScript watch) or `npm run build:shared` so the server and client see the change.
> If port 4100 is taken, set `PORT` in `server/.env` and start the client with `API_PROXY_TARGET=http://localhost:<port> npm run dev:client`.

---

## MongoDB setup

The app uses multi-document **transactions**, so MongoDB must run as a **replica set**. Atlas clusters always do. Locally, choose one of:

1. **`npm run dev:db`** (recommended). This starts a single-node replica set using `mongodb-memory-server`. The MongoDB binary is downloaded once (~80 MB) and data persists in `server/.dev-db/`. The URI is `mongodb://127.0.0.1:27018/website_tracker?replicaSet=rs0` (the default in `.env.example`).
2. **A free Atlas cluster.** Follow [MongoDB Atlas deployment](#mongodb-atlas-deployment) and put the `mongodb+srv://…` URI in `server/.env`.
3. **Docker:**
   ```bash
   docker run -d --name wt-mongo -p 27017:27017 mongo:8 --replSet rs0
   docker exec wt-mongo mongosh --eval 'rs.initiate({_id:"rs0",members:[{_id:0,host:"localhost:27017"}]})'
   # MONGODB_URI=mongodb://localhost:27017/website_tracker?replicaSet=rs0
   ```

Collections and indexes, including TTL indexes, are created automatically on startup.

---

## Environment variables

### API (`server/.env`, or the Render service's environment)

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `MONGODB_URI` | ✅ | — | `mongodb://` or `mongodb+srv://` connection string. |
| `NODE_ENV` | | `development` | `production` enables secure `__Host-` cookies and stricter config checks. |
| `PORT` | | `4100` | HTTP port. Render sets this automatically. |
| `FRONTEND_URL` | ✅ in prod | `http://localhost:5173` | Allowed browser origin(s), comma-separated. Used for CORS, the CSRF origin check and links in emails. |
| `SCHEDULER_SECRET` | ✅ in prod | — | Bearer token for `/api/internal/scheduler/tick` (≥32 chars). Generate with `openssl rand -base64 48`. |
| `SETUP_TOKEN` | first run | — | Required to create the first admin at `/setup` (≥16 chars). Remove it afterwards. |
| `ALLOW_REGISTRATION` | | `false` | Allow additional self-registered accounts. |
| `TRUST_PROXY` | | `1` | Reverse proxies in front of the API (Render: 1). Used to determine client IPs for rate limiting. |
| `COOKIE_SAMESITE` | | `strict` | `strict` / `lax` / `none`. Use `none` only if you serve the UI and API from unrelated domains without the rewrite (HTTPS only). |
| `ALLOW_PRIVATE_TARGETS` | | `false` | **Development only.** Lets monitors target localhost/private IPs. The server refuses to start with it in production. |
| `SCHEDULER_CONCURRENCY` | | `10` | Checks run in parallel per tick. |
| `SCHEDULER_MAX_JOBS_PER_TICK` | | `500` | Upper bound on checks per tick. |
| `EMAIL_PROVIDER` | | `none` | `resend`, `smtp` or `none`. |
| `EMAIL_FROM` | if email | — | e.g. `Website Tracker <alerts@yourdomain.com>` |
| `RESEND_API_KEY` | if resend | — | From resend.com. |
| `SMTP_HOST` `SMTP_PORT` `SMTP_SECURE` `SMTP_USER` `SMTP_PASSWORD` | if smtp | 587 | Not usable on Render's free plan, which blocks SMTP ports. |
| `LOG_LEVEL` | | `info` | Pino level. |

If any value is invalid, the server refuses to start and lists *which variables* are wrong, without printing their values.

### Client (`client/.env`, optional)

| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_URL` | *(empty)* | Leave empty to use same-origin `/api` (the Render rewrite or the Vite proxy). Set it only if the API is on another origin; you then also need `COOKIE_SAMESITE` and CSP adjustments. |

`.env` files are git-ignored. Only the `.env.example` files, which contain placeholders, are committed.

---

## Running the backend

```bash
npm run dev:server            # development (tsx watch, reads server/.env)
npm run worker                # development scheduler loop

npm run build:server          # compile shared + server to server/dist
npm run start -w server       # production server
npm run tick -w server        # run one scheduler tick and exit (cron-style)
npm run worker:prod -w server # production worker loop
```

## Running the frontend

```bash
npm run dev:client            # http://localhost:5173
npm run build:client          # production build → client/dist
npm run preview -w client     # serve the production build locally
```

## Running tests

```bash
npm test             # shared + server + client
npm run lint         # ESLint (TypeScript, React hooks)
npm run typecheck    # all packages
```

The server tests start an **in-memory MongoDB replica set** and a **local HTTP test server** whose behaviour (status codes, delays, hangs, redirects, resets) is chosen by path, so nothing depends on the internet. They cover:

- **Auth:** setup token, Argon2id storage, session cookies, logout revocation, password change, lockout, rate limiting (429), CSRF origin check, CORS, body limits, operator injection.
- **Websites:** create (201), read, update, delete (204), environment removal cascade, validation (400) including secrets and private monitor targets, cross-user isolation (404), search, filters, sorting, pagination.
- **Probe:** HTTP 200/201/204/301/302/303/307/308/400/401/403/404/429/500/503, timeouts, connection refused and reset, DNS failure, TLS failure, invalid URLs, redirect loops.
- **SSRF:** every blocked range, decimal/hex/octal IPs, IPv6-mapped addresses, DNS rebinding, mixed DNS answers, redirects to the metadata endpoint.
- **Status logic, wake-up semantics, threshold notifications and email rendering.**
- **Scheduler:** atomic claiming, leases, overlapping ticks never double-running a monitor, crash isolation, `maxJobs`, the tick endpoint.
- **Logs and stats:** cursor pagination, filters, uptime and p95, time-zone bucketing, retention and the TTL index, settings validation, dashboard counts.

---

## Render deployment

The repository includes a [`render.yaml`](render.yaml) Blueprint that creates both services.

1. **Prepare MongoDB Atlas** ([below](#mongodb-atlas-deployment)) and copy the connection string.
2. Push this repository to GitHub/GitLab.
3. In Render, go to **New → Blueprint**, select the repository and apply. This creates:
   - `website-tracker-api`: a free Web Service (Node, Singapore region, health check at `/api/health`).
   - `website-tracker`: a free Static Site with the `/api/*` rewrite, SPA fallback and security headers.
4. When prompted for the `sync: false` variables, set:
   - `MONGODB_URI` to the Atlas connection string.
   - `FRONTEND_URL` to the static site's URL, e.g. `https://website-tracker.onrender.com`.
   - `EMAIL_FROM` and `RESEND_API_KEY` if you want email (and change `EMAIL_PROVIDER` to `resend`).
   `SCHEDULER_SECRET` and `SETUP_TOKEN` are generated for you.
5. **Check the API's URL.** If Render changed the service name (e.g. `website-tracker-api-ab12.onrender.com`), edit the rewrite `destination` in `render.yaml` to match, commit and push.
6. Open the static site and go to **/setup**. Copy `SETUP_TOKEN` from the API service's Environment tab, create your admin account, then **delete `SETUP_TOKEN`** from the environment.
7. **Configure the scheduler trigger** ([next section](#configure-the-scheduler-trigger)).

### Configure the scheduler trigger

**cron-job.org** (free, primary):
1. Create a free account and add a new cron job.
2. Set the URL to `https://website-tracker-api.onrender.com/api/internal/scheduler/tick?source=cron-job.org`.
3. Set the schedule to **every 1 minute**.
4. Under *Advanced*, set the request method to **POST** and add the header `Authorization: Bearer <SCHEDULER_SECRET>`.
5. Enable failure notifications if you want cron-job.org to tell you when the API is unreachable.

**GitHub Actions** (free, backup; the workflow is already included):
- In your repository settings, add the secrets `TICK_URL` (the full tick URL above) and `SCHEDULER_SECRET`. The workflow runs every 5 minutes, but GitHub often delays scheduled runs, which is why it is only the backup.

Within a minute or two the dashboard's "Scheduled checks are not running" warning should disappear.

### CORS

With the rewrite, the browser only ever talks to the static site's origin, so CORS is not involved. `FRONTEND_URL` is still required: it drives the CSRF origin check and email links. If you call the API directly from another origin, add that origin to `FRONTEND_URL`, which enables credentialed CORS for it.

### Custom domain

1. Add your domain (e.g. `tracker.example.com`) to the **static site** under Settings → Custom Domains and create the DNS record Render shows.
2. Add the new origin to the API's `FRONTEND_URL`, for example `https://tracker.example.com,https://website-tracker.onrender.com`.
3. Optionally give the API its own domain (e.g. `api.example.com`). If you do, update the rewrite `destination` in `render.yaml` and the cron `TICK_URL`s. The browser keeps using `/api` on the site's domain either way.

### Email

Render's free web services **cannot use SMTP ports 25, 465 or 587**, so use **Resend** (free tier: 3,000 emails per month):
1. Sign up at resend.com and verify a sending domain. Without one, Resend only delivers to your own address.
2. Create an API key. Set `EMAIL_PROVIDER=resend`, `RESEND_API_KEY=…` and `EMAIL_FROM="Website Tracker <alerts@yourdomain.com>"`.
3. In the app, open **Settings → Notifications**, enable email and use **Send test email**.

SMTP (`EMAIL_PROVIDER=smtp`) works on paid Render instances and locally.

---

## MongoDB Atlas deployment

1. **Create an account** at mongodb.com/atlas.
2. **Create a free cluster.** Choose *M0 Free*, preferably in the same region as the API (e.g. AWS Mumbai/Singapore for a Singapore Render service).
3. **Create a database user.** Go to Security → Database Access → Add New Database User → password authentication with a long generated password. For least privilege, choose *Specific Privileges* → `readWrite` on database `website_tracker`.
4. **Configure network access.** Go to Security → Network Access → Add IP Address.
   - Best: add your Render service's **outbound IP ranges** (Render dashboard → the API service → *Connect* → *Outbound*).
   - Simplest: `0.0.0.0/0` (allow from anywhere). The database is then protected only by its credentials, so keep the password long and random.
5. **Get the connection string.** Go to Database → Connect → Drivers → copy the `mongodb+srv://…` string. Insert the password (URL-encode special characters) and add the database name before the `?`:
   `mongodb+srv://tracker:<password>@cluster0.xxxxx.mongodb.net/website_tracker?retryWrites=true&w=majority`
6. **Add it to Render** as `MONGODB_URI` on the API service.
7. **Create the database and collections.** You don't have to do anything here: on first start the API connects, and Mongoose creates the collections and indexes (including TTL indexes) automatically.

**M0 limits to keep in mind:** 512 MB of storage, a shared CPU with operation-rate throttling, and 500 connections (the API's pool is capped at 10). Keep log retention reasonable; Settings shows the expected storage.

---

## Scheduler architecture

**The constraint.** Render's free web service spins down after 15 minutes without inbound traffic, and Render's Background Workers and Cron Jobs are paid. So the web service cannot schedule work itself: a `setInterval` inside it stops whenever the service sleeps, restarts, or runs as more than one instance.

**The design.** The *state* of the schedule lives in MongoDB, and anything can *trigger* a tick:

1. Each monitor document has `nextRunAt` and `lockedUntil`.
2. `runTick()` repeatedly claims the most overdue monitor with a single atomic `findOneAndUpdate`. The claim:
   - matches `enabled && nextRunAt ≤ now && lockedUntil not in the future`;
   - in the same update, sets `nextRunAt = now + interval` and `lockedUntil = now + timeout + 30 s`.
3. Up to `SCHEDULER_CONCURRENCY` claims run in parallel. Each slot claims a new monitor only when it is free, so a slow target never holds work hostage.
4. After each run the lease is released. If the process dies mid-check, the lease expires and the next tick retries that monitor.
5. Missed runs are **skipped, not replayed**. After an outage each monitor runs once, not once per missed interval.
6. Each tick also delivers queued notifications, and records `lastTickAt` so the dashboard can warn when the scheduler stalls.

Because claiming is atomic, **any number of triggers can run concurrently without double-checking a site**. The triggers are:

| Trigger | Cost | Notes |
|---|---|---|
| **cron-job.org → `POST /api/internal/scheduler/tick`** every minute | Free | **Default.** The endpoint replies `202` immediately and runs the tick in the background, so the caller's timeout doesn't matter. These calls also keep the tracker's own API awake. |
| **GitHub Actions** (`.github/workflows/scheduler-tick.yml`) every 5 minutes | Free | Backup only. GitHub scheduled runs are often delayed. |
| **Render Cron Job** (`npm run tick -w server`, commented in `render.yaml`) | ~$1+/month | Runs the tick directly against MongoDB; no HTTP endpoint involved. |
| **Background worker** (`npm run worker:prod -w server`) | Starter plan | A separate process polling every 15 s. This is also what `npm run worker` does locally. |

**Timing accuracy:** with a 1-minute trigger, a check runs within about a minute of when it is due. Intervals are durations, not wall-clock times, so they are unaffected by time zones; time zones only matter for display, email timestamps and chart buckets.

**Render free hours.** The tracker's API is kept awake by the minute-by-minute ticks, so it uses about 744 of the workspace's **750 free hours per month**. If you also keep *another* free Render service in the same workspace awake around the clock (with a wake-up interval under 15 minutes), the workspace runs out of hours and Render suspends its free services until the month resets. The app warns you about this on the dashboard and in the wake-up form. Options: put the tracker or your apps in different workspaces, use longer wake-up intervals, or move one service to a paid plan.

---

## Health-check architecture

Each request (`server/src/services/probe/httpProbe.ts`) works like this:

1. The URL is checked before any network activity: only `http`/`https`, no embedded credentials, no local/internal hostnames, and IP literals must be public.
2. The request goes through a fresh `undici` agent whose **DNS lookup validates every resolved address**. Connection-time validation defeats DNS rebinding.
3. Redirects (301/302/303/307/308) are followed manually, up to 5. **Each hop is re-validated.**
4. A single deadline (`timeoutMs`) covers the whole chain. At most 64 KB of the body is read and nothing is stored.
5. Failures are classified as `TIMEOUT`, `DNS_FAILURE`, `CONNECTION_REFUSED`, `CONNECTION_RESET`, `CONNECTION_FAILED`, `TLS_ERROR`, `TOO_MANY_REDIRECTS`, `BLOCKED_TARGET` or `INVALID_URL`. The probe **never throws** for target behaviour, so a broken website cannot crash the tracker.

Then `checkService.runMonitor`:
- decides success: a health check succeeds on 2xx (or 2xx–3xx if configured);
- writes a log with its retention expiry;
- atomically updates the failure/success counters, skipping the update if the monitor was disabled or re-pointed mid-request;
- recomputes the status;
- queues a notification if the status crossed a threshold.

**Status rules** (`shared/src/status.ts`, used by both server and UI):

| Status | Rule |
|---|---|
| **Healthy** (`UP`) | Latest check succeeded within `degradedThresholdMs`. |
| **Degraded** (`DEGRADED`) | Latest check succeeded but was slower than `degradedThresholdMs` (*slow*), **or** it failed but fewer than `failureThreshold` times in a row (*failing*). |
| **Down** (`DOWN`) | `failureThreshold` consecutive failures. |
| **Unknown** | Enabled, but no check has run yet (or the URL just changed). |
| **Monitoring off** (`PAUSED`) | Disabled. |

A website's overall status is the worst status among its environments. Thresholds are configurable per monitor, with defaults in Settings.

**Free-tier tip:** a sleeping Render service can take 30–60 s to respond to its first request. Use a timeout of 45–60 s for health checks against free services, or pair them with a wake-up.

## Wake-up architecture

Wake-ups use the same scheduler, lease, probe and SSRF protections, but they are **independent monitors** with their own URL, method, interval, timeout and history.

- A wake-up **succeeds if the server answered with any status below 500**. A 404 still means the instance is awake; a 5xx or no response is a failure.
- Wake-up results **never change health status**. The UI labels them *Delivered / Failing / Pending* rather than *Healthy / Down*, and explains that a delivered wake-up does not mean the site is healthy.
- After `failureThreshold` consecutive failures, a single "wake-up failing" email is sent (if enabled). This usually means the service is suspended, out of free hours, or broken.
- If health monitoring already requests the same URL at least as often, the form tells you the wake-up adds nothing.

---

## Notifications

Notifications are **edge-triggered**: one email per status *change*, never one per failed request.

| Event | When |
|---|---|
| Website down | A health monitor reaches `failureThreshold` consecutive failures (the transition to Down). |
| Website recovered | A health monitor that was Down gets a successful response. The email includes approximate downtime. |
| Wake-up failing | A wake-up monitor reaches its failure threshold. |

Messages are written to the `notifications` outbox and delivered by the scheduler, with up to 3 attempts and backoff, so a provider outage does not lose them. Delivery goes through an `EmailSender` interface (Resend over HTTPS, or SMTP). Slack, Discord or Telegram could be added as further senders without changing how monitoring works.

---

## Security considerations

**Authentication and sessions**
- Passwords are hashed with **Argon2id** (19 MiB memory, 2 iterations, OWASP-recommended) and never stored or logged in plaintext. Hashes are rehashed automatically if parameters change. Unknown emails go through a dummy verification so response times don't reveal which accounts exist.
- Sessions are random 256-bit tokens. Only their **SHA-256 hash** is stored. The cookie is `httpOnly`, `Secure` and `SameSite=Strict`, with the `__Host-` prefix in production.
- Sessions expire after 7 days idle, 30 days maximum. A password change revokes all sessions, and "sign out everywhere" is available.
- The first admin can only be created with `SETUP_TOKEN`, so a freshly deployed instance cannot be claimed by someone else. Concurrent setup attempts are prevented by a unique lock document. Registration is closed by default.
- Brute-force protection: per-IP rate limiting on authentication endpoints, plus a 15-minute account lockout after 10 consecutive failures.

**Authorization**
- Every query is scoped to the signed-in user's id. Other users' resources return 404, so their existence isn't revealed. The `role` field is in place for future teams/RBAC.

**Request hardening**
- **CSRF:** `SameSite=Strict` cookies, plus an `Origin`/`Referer` allow-list check on every state-changing request.
- **CORS:** allow-list from `FRONTEND_URL`, credentials only for those origins.
- **Validation:** every body and query string is parsed with strict Zod schemas (unknown fields are stripped and types enforced), so `{ "$ne": … }`-style **operator injection** cannot reach MongoDB. Mongoose `strictQuery` drops unknown filter paths, and search uses no user-built regex. (`express-mongo-sanitize` is not used; it is unmaintained and incompatible with Express 5.)
- 100 KB body limit, Helmet security headers on the API, and a strict CSP plus `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` and HSTS on the static site.
- **Image uploads:** the browser re-encodes every picture to a small JPEG (this also strips camera metadata such as GPS). The server still never trusts that: it accepts only JPEG/PNG/WebP, **verifies the real format from the file's first bytes** (not the declared type), rejects SVG and anything else, caps the size at 600 KB with a limit applied only to that route, scopes images to their owner (404 for anyone else), and serves them with `X-Content-Type-Options: nosniff`.
- **XSS:** React escapes all output and `dangerouslySetInnerHTML` is never used. Stored URLs are rendered as links only if they are `http(s)`, so `javascript:` links are impossible. Emails are plain text.
- Errors: clients get generic messages for 500s, and details go only to the server log. The logger redacts cookies, authorization headers, passwords and token hashes. Configuration errors never print values.

**SSRF (outbound requests)**
- Only globally routable unicast addresses are allowed. Loopback, RFC 1918, link-local (including `169.254.169.254` metadata), carrier-grade NAT, multicast, reserved and documentation ranges, IPv6 unique-local, and IPv6 forms that embed IPv4 (mapped, NAT64, 6to4, Teredo) are all blocked.
- Checked at save time (literal IPs and hostnames like `localhost`, `*.internal`, `metadata.google.internal`) **and** at connect time (every DNS answer, every redirect hop). Decimal/hex/octal IP tricks are normalised by the URL parser before checking.
- "Run now" is rate-limited per user so the server can't be used to flood a target.
- `ALLOW_PRIVATE_TARGETS` exists only for local development, and the server refuses to start with it in production.

**Secrets**
- The app stores **metadata only**. Free-text fields are screened for connection strings with passwords, private keys, cloud/API keys, JWTs and `password=…` patterns, and URL fields refuse embedded credentials.
- A credential vault was deliberately not built. Keeping secrets in each provider's own secret manager is safer than concentrating them in a dashboard. If one is ever added, it should use envelope encryption with a key held outside MongoDB (e.g. a KMS), with re-authentication before reveal and an access log.

**Operational**
- `.env` files are git-ignored; only placeholder `.env.example` files are committed.
- With the rewrite, all client IPs reach the API through Render's proxies. If rate limiting seems to group all users together, adjust `TRUST_PROXY`.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Dashboard: "Scheduled checks are not running" | The external cron isn't reaching the tick endpoint. Check the cron-job.org execution history. `401` means the bearer token doesn't match `SCHEDULER_SECRET`; `503` means `SCHEDULER_SECRET` isn't set on the API. Make sure the method is **POST**. |
| Login works but you are immediately signed out (production) | The static site isn't proxying `/api/*`. Check the rewrite destination matches the API's actual URL, and that requests go to `/api/...` on the site's own domain (`VITE_API_URL` empty). |
| `403 Request origin not allowed` | Add the exact site origin (scheme + host, no trailing slash) to `FRONTEND_URL`, comma-separated if there are several. |
| `/setup` says setup is locked | Set `SETUP_TOKEN` on the API service and redeploy. Remove it after creating the admin. |
| API fails to start: "Invalid environment configuration" | The message lists each offending variable. In production `SCHEDULER_SECRET` is required, and `ALLOW_PRIVATE_TARGETS` must be off. |
| `MongoServerSelectionError` / timeouts | Check Atlas *Network Access* (Render outbound IPs or `0.0.0.0/0`), the user's password (URL-encode special characters) and that the cluster isn't paused. |
| "Transaction numbers are only allowed on a replica set" | Local MongoDB is standalone. Use `npm run dev:db` or the Docker command above. |
| Monitor URL rejected: "Local and internal hostnames cannot be monitored" / "resolves to a private … address" | This is SSRF protection working as intended. Production monitors must target public addresses. For local testing, set `ALLOW_PRIVATE_TARGETS=true` (development only). |
| Health checks on a Render free service time out | The service is cold-starting. Raise the timeout to 45–60 s, or add a wake-up. |
| Render free services suspended mid-month | The workspace ran out of 750 free hours. See [Render free hours](#scheduler-architecture). |
| Test email: `EMAIL_SEND_FAILED` | The provider rejected the message. Usually the `EMAIL_FROM` domain isn't verified in Resend. |
| SMTP email works locally but not on Render free | Render's free plan blocks SMTP ports. Use `EMAIL_PROVIDER=resend`. |
| Atlas storage nearly full | Lower log retention or lengthen intervals in Settings. Expired logs are deleted within about a minute by the TTL monitor. |
| `EADDRINUSE` on startup | Another program uses the port. Set `PORT` (and `API_PROXY_TARGET` for the Vite dev server). |
| First `npm test` is slow | `mongodb-memory-server` downloads a MongoDB binary once (~80 MB). |
