# API reference

Base path: `/api`. All request and response bodies are JSON. Timestamps are ISO-8601 UTC strings.

- **Success:** `{ "data": … }` (or `204 No Content`)
- **Error:** `{ "error": { "code": "VALIDATION_ERROR", "message": "…", "fields": { "environments.0.healthCheck.url": "…" } } }`

`fields` is present on validation errors and uses dot paths that match the request body.

## Conventions

| Topic | Behaviour |
|---|---|
| Authentication | Session cookie (`__Host-wt_session` in production, `wt_session` in development). `httpOnly`, `Secure`, `SameSite=Strict`. Obtained from `/auth/login` or `/auth/setup`. |
| CSRF | `POST`/`PUT`/`PATCH`/`DELETE` must carry an `Origin` (or `Referer`) header listed in `FRONTEND_URL`, otherwise `403`. Browsers send it automatically. |
| Ownership | Every resource is scoped to the signed-in user. Another user's ids return `404`, never `403`, so their existence is not revealed. |
| Ids | 24-character hex ObjectIds. Malformed ids return `404`. |
| Body limit | 100 KB (`413` above that). |
| Rate limits | Login/setup/register/password: 10 failed attempts per 15 min per IP. API: 1,500 requests per 15 min per IP. Manual runs: 20/min per user. Test email: 10/hour per user. Scheduler tick: 30/min. Exceeding a limit returns `429` with `RateLimit` headers. |
| Account lockout | 10 consecutive wrong passwords lock the account for 15 minutes (`429 ACCOUNT_LOCKED`). |

### Common status codes

`200` OK · `201` created · `202` accepted (scheduler) · `204` no content · `400` validation · `401` not signed in · `403` forbidden/origin/setup token · `404` not found · `409` conflict · `413` body too large · `429` rate limited · `500` unexpected error (details are logged server-side, never returned) · `502` email provider rejected a test email · `503` scheduler not configured / database down.

---

## Health

### `GET /api/health`
Liveness probe for Render. No authentication. Returns `200 {"status":"ok","database":"up"}`, or `503` if MongoDB is disconnected.

---

## Auth & account

### `GET /auth/setup-status`
`{ needsSetup: boolean, setupEnabled: boolean, registrationOpen: boolean }`. `needsSetup` is true while no user exists. `setupEnabled` is true when `SETUP_TOKEN` is configured.

### `POST /auth/setup`
Creates the first **admin**. Only works while there are no users, and requires the server's `SETUP_TOKEN`.
```json
{ "setupToken": "…", "name": "Aayush", "email": "me@example.com", "password": "at-least-12-chars" }
```
Returns `201` with the user and sets the session cookie. Returns `403` if the token is wrong or setup is disabled, and `409` if setup is already done.

### `POST /auth/register`
Same body without `setupToken`. Returns `403` unless `ALLOW_REGISTRATION=true`.

### `POST /auth/login`
`{ "email", "password" }` → `200` with the user, and sets the cookie. `401` for any wrong email/password combination (same message either way). `429` when rate-limited or locked.

### `POST /auth/logout` → `204`
Deletes the session server-side and clears the cookie.

### `POST /auth/logout-all` → `204` *(auth)*
Revokes every session of the current user.

### `GET /auth/me` *(auth)*
`{ id, name, email, role, createdAt }`

### `PUT /auth/password` *(auth)*
`{ "currentPassword", "newPassword" }` → `204`. Revokes all sessions and issues a new cookie for the caller.

### `PATCH /account` *(auth)*
`{ "name", "email", "currentPassword"? }`. `currentPassword` is required only when the email changes.

---

## Websites *(auth)*

A **website** is a project. It holds shared details (name, description, repository, tags, notes) and 1–10 **environments**. Each environment has its own URLs, hosting, database metadata, and two monitors: `healthCheck` and `wakeUp`.

### `GET /websites`
Query parameters (all optional):

| Param | Values |
|---|---|
| `q` | Free text. Matches name, description, notes, tags, every URL, hosting/database/repository provider names, database name/project/cluster and account email. All words must match. |
| `health` | `UP` · `DEGRADED` · `DOWN` · `UNKNOWN` · `PAUSED` (worst status across environments) |
| `environment` | `PRODUCTION` · `STAGING` · `TESTING` · `DEVELOPMENT` · `OTHER` |
| `lifecycle` | `ACTIVE` · `IN_DEVELOPMENT` · `MAINTENANCE` · `PAUSED` · `ARCHIVED` |
| `tags` | Comma-separated. Every tag must be present; case-insensitive. |
| `monitoring` / `wakeUp` | `enabled` · `disabled` |
| `sort` | `name` (default) · `-name` · `status` · `responseTime` · `updatedAt` · `-updatedAt` |
| `page`, `pageSize` | Default 1 / 25, max page size 100. |

Response: `{ items: WebsiteSummary[], total, page, pageSize }`. Each summary contains `coverVersion` (see *Card image*), the primary environment (Production, else the first), its providers, the worst health status, the last response time, whether monitoring/wake-up are enabled, and the primary monitor ids (used by the list's toggles).

### `GET /websites/tags`
Distinct tags, sorted.

### `POST /websites` → `201`
### `PUT /websites/:id` → `200`
Full replacement. To keep an existing environment and its history, include its `id`. An environment omitted from the array is deleted, along with its monitors and logs.

```jsonc
{
  "name": "Expense Tracker",
  "description": "Personal expense tracking",
  "lifecycleStatus": "ACTIVE",
  "tags": ["Personal", "MERN"],
  "repository": { "provider": "github", "url": "https://github.com/me/expense", "defaultBranch": "main" },
  "notes": "",
  "environments": [
    {
      "id": "665f…",                       // omit for a new environment
      "type": "PRODUCTION",
      "label": "",
      "websiteUrl": "https://expense.example.com",
      "backendUrl": "https://expense-api.onrender.com",
      "branch": "main",
      "frontendHosting": { "provider": "vercel", "url": "", "region": "" },
      "backendHosting":  { "provider": "render", "url": "", "region": "Singapore" },
      "database": {
        "provider": "supabase",            // or "other" + "customProvider"
        "databaseName": "expense_tracker",
        "projectName": "Expense Tracker",
        "cluster": "",
        "region": "ap-south-1",
        "accountProvider": "google",
        "accountIdentifier": "myproject@gmail.com",
        "dashboardUrl": "https://supabase.com/dashboard/project/abc",
        "notes": "Production database"
      },
      "healthCheck": {
        "enabled": true,
        "url": "https://expense-api.onrender.com/health",
        "method": "GET",                   // GET | HEAD | POST
        "intervalSeconds": 600,            // 60–86400
        "timeoutMs": 30000,                // 1000–60000
        "failureThreshold": 3,             // 1–20 consecutive failures → DOWN
        "degradedThresholdMs": 2000,       // slower successful responses → DEGRADED
        "expectedStatus": "2xx"            // "2xx" | "2xx-3xx"
      },
      "wakeUp": {
        "enabled": true,
        "url": "https://expense-api.onrender.com/health",
        "method": "GET",
        "intervalSeconds": 600,
        "timeoutMs": 30000,
        "failureThreshold": 3              // consecutive failures before a "wake-up failing" email
      }
    }
  ]
}
```

**Validation rules**

- Empty strings are treated as "not set".
- Every URL must be `http(s)` and must not contain `user:password@`.
- **Monitor URLs** must also point at a public host. These are rejected: `localhost`, `*.local`, `*.internal`, single-label names, private/loopback/link-local/reserved IP literals, and cloud metadata addresses. Metadata URLs such as `websiteUrl` *may* be `http://localhost:3000`, which is useful for recording a development environment.
- Free-text fields (`description`, `notes`, `database.notes`, `database.accountIdentifier`) are rejected if they contain anything that looks like a secret: connection strings with passwords, private keys, AWS/Stripe/GitHub/Slack/OpenAI/Google keys, JWTs, or `password=…`-style assignments.
- Provider values come from `GET /meta/providers`. Use `other` plus `customProvider` for anything unlisted.

**How saving affects monitors**

| Change | Result |
|---|---|
| Enabled for the first time, re-enabled, or `url`/`method` changed | State resets to `UNKNOWN`; the first check is due immediately. |
| Only interval/thresholds changed | State is kept and the status is re-evaluated against the new thresholds; `nextRunAt` is pulled earlier if the new interval is shorter. |
| Disabled | Status becomes `PAUSED`; nothing is scheduled. |

Response: the full website (see below).

### `GET /websites/:id`
The full website. Every environment includes `healthCheck` and `wakeUp` monitor objects:
```jsonc
{
  "id": "…", "type": "HEALTH_CHECK", "enabled": true, "url": "…", "method": "GET",
  "intervalSeconds": 600, "timeoutMs": 30000, "failureThreshold": 3,
  "degradedThresholdMs": 2000, "expectedStatus": "2xx",
  "nextRunAt": "2026-10-04T15:10:00.000Z",
  "state": {
    "status": "UP", "degradedReason": null, "consecutiveFailures": 0,
    "lastRunAt": "…", "lastSuccessAt": "…", "lastFailureAt": null,
    "lastStatusCode": 200, "lastResponseMs": 412,
    "lastErrorCode": null, "lastErrorMessage": null, "statusChangedAt": "…"
  }
}
```
The website's `healthStatus` is the worst health-check status across its environments.

### `DELETE /websites/:id` → `204`
Deletes the website, its monitors, all logs, its notifications and its card image.

### Card image

Each website can have one background image for its card on the Home page. Images are stored separately from the website, so website responses only carry `coverVersion` (an ISO timestamp, or `null` when there is no image). Use it to cache-bust the image URL.

#### `PUT /websites/:id/cover`
The request body is the **raw image bytes** (not JSON), with `Content-Type: image/jpeg`, `image/png` or `image/webp`. Returns `200 { coverVersion }`.

| Status | When |
|---|---|
| `400` | The bytes are not really a JPEG/PNG/WebP, whatever the `Content-Type` says. |
| `413` | Larger than 600 KB. The web app resizes pictures to about 1280 px wide JPEG first, so this should not happen in normal use. |
| `415` | Any other content type (including SVG) or an empty body. |
| `404` | Unknown website, or one that belongs to someone else. |

Saving an image does not change the website's own `updatedAt`, and editing the website later does not remove the image.

#### `GET /websites/:id/cover`
Returns the image. Sent with `Cache-Control: private, max-age=31536000, immutable` and `X-Content-Type-Options: nosniff`; request it as `/api/websites/:id/cover?v=<coverVersion>` so a new image is always a new URL. `404` if there is no image.

#### `DELETE /websites/:id/cover` → `204`
Removes the image. Safe to repeat.

---

## Monitors *(auth)*

### `GET /monitors/:id`
### `PATCH /monitors/:id`
`{ "enabled": boolean }`. Quick on/off toggle. Enabling a monitor that has no URL returns `400`.

### `POST /monitors/:id/run`
**Run health check now / Wake up now.** The server performs the request, stores the log, and updates state (only if the monitor is enabled, so a disabled monitor can be test-run without affecting it). Returns `{ log, monitor }`. Rate-limited to 20 per minute per user.

---

## Logs, stats & dashboard *(auth)*

### `GET /logs`
| Param | Notes |
|---|---|
| `websiteId`, `monitorId` | Optional filters. |
| `type` | `HEALTH_CHECK` · `WAKE_UP` |
| `result` | `success` · `failure` |
| `from`, `to` | ISO timestamps; `from` is inclusive, `to` exclusive. |
| `limit` | 1–100, default 25. |
| `cursor` | The `nextCursor` value from the previous page. |

Response: `{ items: Log[], nextCursor: string | null }`. Results are newest first. Pagination is keyset-based on `(startedAt, _id)`, so deep pages cost the same as the first.

Each log contains: `{ id, websiteId, websiteName, environmentLabel, monitorId, type, trigger: "SCHEDULED"|"MANUAL", url, method, startedAt, responseMs, statusCode, success, errorCode, errorMessage }`.

`errorCode` is one of: `TIMEOUT`, `DNS_FAILURE`, `CONNECTION_REFUSED`, `CONNECTION_RESET`, `CONNECTION_FAILED`, `TLS_ERROR`, `HTTP_STATUS`, `TOO_MANY_REDIRECTS`, `BLOCKED_TARGET`, `INVALID_URL`, `UNKNOWN`.

### `GET /stats/summary`
Parameters: `websiteId`, `monitorId`, `type` (default `HEALTH_CHECK`), `result`, `from` (default: 24 h before `to`), `to` (default: now). The range can be at most 400 days.

Response: `{ total, successes, failures, successRate, avgResponseMs, minResponseMs, maxResponseMs, p95ResponseMs, from, to }`. Rates and averages are `null` when there were no checks.

### `GET /stats/timeseries`
Same parameters. The response is `{ bucketUnit, bucketSize, points: [{ bucket, total, successes, successRate, avgResponseMs, maxResponseMs }] }`.

Bucket size grows with the range: 5 min (≤3 h), 15 min (≤12 h), 1 h (≤2 d), 6 h (≤14 d), 1 day (≤120 d), 1 week. Buckets align to the **user's time zone**; for example, Asia/Kolkata days start at 18:30 UTC.

### `GET /dashboard`
```jsonc
{
  "counts": { "websites": 12, "up": 9, "degraded": 1, "down": 2, "unknown": 0, "paused": 0,
              "monitoringEnabled": 10, "wakeUpEnabled": 7 },
  "last24h": { "checks": 1440, "successRate": 0.997, "avgResponseMs": 420 },
  "websites": [ { "id", "name", "environmentLabel", "status", "degradedReason", "lastResponseMs", "lastCheckedAt" } ],
  "recentActivity": [ /* 10 most recent logs */ ],
  "scheduler": { "lastTickAt": "…", "lastTickSource": "cron-job.org", "stale": false },
  "warnings": { "renderAlwaysOnWakeUps": 1 }
}
```
`scheduler.stale` is true when monitors are enabled but no tick has run for 3 minutes.

---

## Settings & notifications *(auth)*

### `GET /settings`
```jsonc
{
  "settings": {
    "timezone": "Asia/Kolkata", "dateFormat": "DD MMM YYYY", "timeFormat": "24h", "theme": "system",
    "logRetentionDays": 30,                 // 7 | 30 | 90 | 365 | 0 (unlimited)
    "monitoringDefaults": { "intervalSeconds": 600, "timeoutMs": 30000, "failureThreshold": 3, "degradedThresholdMs": 2000 },
    "notifications": { "emailEnabled": false, "recipient": "", "onDown": true, "onRecovery": true, "onWakeUpFailure": true }
  },
  "server": { "emailDeliveryConfigured": true, "emailProvider": "resend" },
  "storage": { "logCount": 15230, "enabledMonitorIntervals": [600, 300] }
}
```

### `PUT /settings`
Send the complete `settings` object. Changing `logRetentionDays` also re-applies the new retention to existing logs.

### `POST /settings/notifications/test`
Sends a test email to the configured recipient (or the account email). Returns `400 EMAIL_NOT_CONFIGURED` if the server has no email provider, or `502 EMAIL_SEND_FAILED` if the provider refused the message.

### `GET /notifications`
The 50 most recent notifications: `{ id, websiteId, event, status: PENDING|SENDING|SENT|FAILED, recipient, subject, attempts, lastError, createdAt, sentAt }`.

### `GET /meta/providers`
The provider catalogs (`database`, `hosting`, `repository`, `account`), each a list of `{ value, label }`.

---

## Scheduler (machine endpoint)

### `POST /api/internal/scheduler/tick`
Header: `Authorization: Bearer <SCHEDULER_SECRET>`. Optional `?source=cron-job.org` (shown on the dashboard).

The endpoint returns `202 { accepted: true, started: boolean }` immediately and runs due checks in the background. `started: false` means a tick was already running in this process; it is safe to ignore. Returns `401` for a wrong or missing token, and `503` if `SCHEDULER_SECRET` is not configured. No cookie or Origin header is involved.
