# Database schema

MongoDB (Atlas M0 in production). The Mongoose models live in `server/src/models/`. Indexes, including TTL indexes, are built at startup (`Model.init()`), so there are no manual migration steps.

All timestamps are stored as UTC `Date`s. Converting to the user's time zone happens only in the UI, in emails, and in chart bucketing (`$dateTrunc` with `timezone`).

## Why these collections

| Collection | What it holds | Why it is separate (or not) |
|---|---|---|
| `users` | Account, Argon2id hash, **settings embedded** | Settings are 1:1 with the user and always read together, so they are embedded rather than kept in a separate `settings` collection. |
| `sessions` | Server-side sessions | Allows instant revocation (logout, password change, "sign out everywhere"). Expired sessions are removed by a TTL index. |
| `websites` | Projects with **environments embedded** | An environment has no meaning outside its project and is always shown with it. Embedding avoids duplicating project details for every environment. |
| `websiteCovers` | One card background image per website (bytes) | Image data is kept out of `websites` so listing websites never loads it. |
| `monitors` | One document per environment × type (`HEALTH_CHECK`, `WAKE_UP`) | The scheduler must atomically claim individual monitors (`findOneAndUpdate` on `nextRunAt`/`lockedUntil`), which cannot be done cleanly for array elements inside `websites`. Future check types (SSL expiry, keyword, …) become new `type` values. |
| `monitoringLogs` | One document per request | Grows quickly, so it needs its own indexes and TTL retention. |
| `notifications` | Email outbox and history | Delivery is retried by the scheduler; the outbox decouples sending from checking. |
| `system` | Singleton documents: `scheduler` (last tick) and `setup` (race-safe first-admin lock) | — |

## `users`
```ts
{
  _id, name, email /* unique, lowercase */,
  passwordHash /* Argon2id, select:false */, role: 'admin' | 'member',
  settings: {
    timezone: 'Asia/Kolkata', dateFormat, timeFormat: '24h'|'12h', theme: 'system'|'light'|'dark',
    logRetentionDays: 7|30|90|365|0,
    monitoringDefaults: { intervalSeconds, timeoutMs, failureThreshold, degradedThresholdMs },
    notifications: { emailEnabled, recipient?, onDown, onRecovery, onWakeUpFailure }
  },
  failedLoginAttempts, lockUntil, lastLoginAt, passwordChangedAt, createdAt, updatedAt
}
```
Index: `email` (unique).

## `sessions`
```ts
{ _id, userId, tokenHash /* SHA-256 of the cookie value */, createdAt, lastSeenAt,
  expiresAt /* sliding 7 days, capped at absoluteExpiresAt */, absoluteExpiresAt /* 30 days */, userAgent }
```
Indexes: `tokenHash` (unique), `userId`, `expiresAt` (TTL, `expireAfterSeconds: 0`).

## `websites`
```ts
{
  _id, userId, name, description?, lifecycleStatus: 'ACTIVE'|'IN_DEVELOPMENT'|'MAINTENANCE'|'PAUSED'|'ARCHIVED',
  tags: string[],
  repository: { provider?, customProvider?, url?, defaultBranch? },
  notes?,
  coverUpdatedAt?,   // set when a card image exists; also its cache-busting version
  environments: [{
    _id, type: 'PRODUCTION'|'STAGING'|'TESTING'|'DEVELOPMENT'|'OTHER', label?,
    websiteUrl?, backendUrl?, branch?,
    frontendHosting: { provider?, customProvider?, url?, region? },
    backendHosting:  { provider?, customProvider?, url?, region? },
    database: { provider?, customProvider?, databaseName?, projectName?, cluster?, region?,
                accountProvider?, accountIdentifier?, dashboardUrl?, notes? }
  }],
  createdAt, updatedAt
}
```
Indexes: `{userId, name}`, `{userId, tags}`, `{userId, updatedAt:-1}`.

**No secrets are stored.** Only metadata (provider, account email, names, URLs) is accepted, and free-text fields are screened for secret-like content.

## `websiteCovers`
```ts
{ _id, userId, websiteId /* unique */, contentType: 'image/jpeg'|'image/png'|'image/webp', data: Buffer, updatedAt }
```
Index: `websiteId` (unique). The browser resizes pictures to at most 1280 px and about 100–400 KB before upload and the server caps them at 600 KB, so 100 websites with images use roughly 10–40 MB. Deleting a website deletes its image. Writes to this collection also set or clear `websites.coverUpdatedAt` without touching `websites.updatedAt`.

## `monitors`
```ts
{
  _id, userId, websiteId, environmentId, type: 'HEALTH_CHECK'|'WAKE_UP',
  enabled, url, method: 'GET'|'HEAD'|'POST', intervalSeconds, timeoutMs, failureThreshold,
  degradedThresholdMs /* health only */, expectedStatus: '2xx'|'2xx-3xx' /* health only */,
  state: { status: 'UP'|'DEGRADED'|'DOWN'|'UNKNOWN'|'PAUSED', degradedReason: 'SLOW'|'FAILING'|null,
           consecutiveFailures, consecutiveSuccesses, lastRunAt, lastSuccessAt, lastFailureAt,
           lastStatusCode, lastResponseMs, lastErrorCode, lastErrorMessage, statusChangedAt },
  nextRunAt /* null when disabled */, lockedUntil /* lease held by an in-flight run */,
  createdAt, updatedAt
}
```
Indexes:
- `{websiteId, environmentId, type}` (unique)
- `{enabled:1, nextRunAt:1}`, partial on `enabled:true`. This is the scheduler's claim query.
- `userId`

## `monitoringLogs`
```ts
{ _id, userId, websiteId, environmentId, monitorId, type, trigger: 'SCHEDULED'|'MANUAL',
  url, method, startedAt, completedAt, responseMs, statusCode, success, errorCode, errorMessage,
  expiresAt? /* startedAt + retention; absent = keep forever */ }
```
Indexes: `{userId, startedAt:-1, _id:-1}`, `{websiteId, startedAt:-1, _id:-1}`, `{monitorId, startedAt:-1, _id:-1}`, and `expiresAt` (TTL, `expireAfterSeconds: 0`).

**Retention.** Each log carries its own `expiresAt`, computed from the owner's setting, and the TTL index deletes it after that time. MongoDB's TTL monitor runs about once a minute. Logs without `expiresAt` ("Unlimited") are never deleted. Changing the setting rewrites `expiresAt` on existing logs with one pipeline update. A per-document expiry is used instead of a collection-wide `expireAfterSeconds` so that retention can be a per-user setting.

**Size.** One log is roughly 0.5 KB including indexes. 10 monitors every 5 minutes produce about 3 MB per day, so 30 days is about 90 MB. The Settings page shows this estimate for your actual monitors against the 512 MB Atlas M0 limit.

## `notifications`
```ts
{ _id, userId, websiteId, monitorId, event: 'MONITOR_DOWN'|'MONITOR_RECOVERED'|'WAKE_UP_FAILING',
  channel: 'EMAIL', recipient, subject, text, status: 'PENDING'|'SENDING'|'SENT'|'FAILED',
  attempts, lastError, nextAttemptAt, sentAt, createdAt, updatedAt }
```
Indexes: `{status, nextAttemptAt}`, `{userId, createdAt:-1}`, and `createdAt` (TTL, 90 days).

## `system`
- `{ _id: 'scheduler', lastTickAt, lastTickSource, lastTickCompletedAt, lastTickDurationMs, lastTickJobs, lastTickErrors }`
- `{ _id: 'setup', completedAt }`: inserting this document is how the first-admin setup is made race-safe.

## Transactions

Creating, updating and deleting a website changes `websites` and `monitors` together inside a transaction, which is why MongoDB must run as a replica set. Atlas always does; locally, use `npm run dev:db`. Bulk log deletion runs after the transaction commits to stay within transaction size and time limits.
