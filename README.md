<div align="center">

<img src="assets/zk-studio.png" alt="ZK Studio" width="280" />

# Vaultly — Self-Hosted Cloud Storage Platform

**Made by ZK STUDIO**

</div>

A complete, production-ready file hosting platform you run yourself: users get a
private drive with quotas, your visitors get fast public media URLs
(`/share/:token`, `/media/:token/file.png`, `/embed/video/:token`), and you get a
full admin console to manage users, quotas, branding and security.

Everything is real — Postgres for metadata, swappable object storage for bytes,
scrypt-hashed passwords, signed sessions, CSRF protection, content-sniffed
uploads and byte-range video streaming. Nothing is mocked.

```
Users ─────► Dashboard (quota, uploads, folders, sharing, trash)
         └──► Admin console (users, quotas, files, branding, settings, audit)
Visitors ──► /share/:token      branded share page (preview, password, expiry)
            /media/:token/name  direct URL for <img>/<video> (Range, ETag, CDN)
            /embed/video/:token iframe player for any external site
```

---

## Contents

1. [Feature overview](#feature-overview)
2. [Quick start (5 minutes)](#quick-start-5-minutes)
3. [Environment variables](#environment-variables)
4. [Storage drivers](#storage-drivers)
5. [Database & migrations](#database--migrations)
6. [Scripts](#scripts)
7. [REST API](#rest-api)
8. [Deployment](#deployment)
9. [Security model](#security-model)
10. [Architecture](#architecture)
11. [Troubleshooting](#troubleshooting)

---

## Feature overview

### User dashboard
- Live storage meter: allocated / used / available, file count, per-category breakdown.
- Drag-and-drop or picker uploads, multi-file, per-file progress, cancel and retry.
- Streamed uploads with size + quota validation and duplicate-name disambiguation.
- Every upload immediately gets a unique short share token.
- Grid/list layouts, folders, search, sort by name/size/date/type, filtered views
  for images, videos and shared links, plus a trash with restore.
- File actions: rename, move, delete (with confirmation), download, disable sharing,
  regenerate link, copy share/direct/embed code, view details and metadata.
- Sharing controls: private / link / public visibility, optional password, expiry
  date, view-only mode, download disabled, max-download counter.
- Account settings: password change, active sessions, personal API keys, dark mode.

### Public delivery
- `/share/:token` — branded page with inline preview (image, video, audio, PDF, text).
- `/media/:token/:filename` — direct binary URL with `Range`, `ETag`, `Last-Modified`
  and immutable caching; suitable for `<img>`/`<video>` and a CDN origin.
- `/embed/video/:token` — chromeless player, framable from any domain.
- `/video/:token` — redirects to the direct media URL.
- Guess-resistant 12-character base62 tokens; revoked or expired links 404.

### Admin console
- Dashboard: users, storage allocated vs used, files, videos, images, bandwidth,
  recent uploads, activity feed, top consumers, allocation donut.
- Users: search, filter by role/status, create (with generated password + copyable
  credentials), edit profile, change role, suspend/activate, reset password, set
  quota from presets or a custom value (blocked below current usage), view files,
  activity and quota history, delete with optional data purge.
- All files: platform-wide moderation with search, type filter, open/download and
  permanent delete with confirmation.
- Activity log: filterable audit trail of every sign-in, upload, share and admin action.
- Security: failed-login counts, locked accounts, active sessions, suspicious IPs,
  configuration checklist.
- Appearance: platform name, logo, favicon, login background, colour palette
  (auto-generates full light/dark token sets), copy for every major surface, footer,
  custom CSS, theme presets, and a live desktop/mobile preview before saving.
- Settings: General, Storage, Security, Sharing, Email (SMTP), System group-by-group
  saves with dirty tracking, plus maintenance tools (cache clear, session cleanup,
  log cleanup, storage probe, rate-limit sweep, background job run).

---

## One-command install

On a fresh Linux server (Debian/Ubuntu, RHEL/Fedora/Rocky, Arch, Alpine) or a Mac,
`install.sh` sets up everything and hosts the panel:

```bash
git clone https://github.com/SKYDO234/ZK-CSH-PANEL.git
cd ZK-CSH-PANEL
sudo bash install.sh
```

It installs Node.js 22 and PostgreSQL when they're missing, creates a dedicated
`zkstudio` service account, writes `.env` with a freshly generated `AUTH_SECRET`,
applies migrations, seeds roles/settings/the first admin, builds the app and
installs systemd services for the panel and the background worker.

When it finishes it prints the sign-in details **before** the server takes over the
terminal (so Codespaces, Docker and foreground runs all show them), and writes the
same details to `<install-dir>/CREDENTIALS.txt` — readable only by root and the
service account. Pass `--admin-password 'YourPassword'` to choose your own instead
of the generated `ZK…!9` password.

> **It only prints the password on the first install.** If `.env` already exists it
> is reused and no password is generated. To recover it: see `CREDENTIALS.txt`, read
> `ADMIN_PASSWORD` from `.env`, or force a reset with
> `npx tsx prisma/seed.ts --reset-admin` on the existing `ADMIN_PASSWORD`.

```bash
sudo bash install.sh --port 8080                    # custom port
sudo bash install.sh --domain files.example.com     # sets APP_URL to https://…
sudo bash install.sh --dir /srv/panel               # custom install location
sudo bash install.sh --no-systemd                   # run in the foreground (Docker)
bash install.sh --rootless                          # no root: installs into ~/zk-studio/vaultly
sudo bash install.sh --uninstall                    # stop services and remove the app
```

Useful flags: `--admin-email`, `--admin-password`, `--no-db` (use an external
`DATABASE_URL`), `--no-worker`. Run `sudo bash install.sh --help` for the full list.

**Notes**
- Re-running the installer is safe: it updates the code, re-applies migrations and
  leaves your `.env`, database and admin account untouched.
- If PostgreSQL can't be installed (no root, offline package repos, container), the
  installer automatically falls back to the bundled PostgreSQL that ships with this
  repo — no separate database server required. If port 5432 is already taken, the
  bundled server picks the next free port instead of failing, and the app's
  `DATABASE_URL` is written to match.
- Export `S3_BUCKET`, `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY` before running to
  use S3/R2/B2 instead of local disk.
- TCP ports only go up to **65535**, so `77777` is not a valid port; it is replaced
  with `8080` and a warning is printed. Pass `--port` to choose your own.
- The default port is **8080**. In GitHub Codespaces use `sudo bash install.sh --port 3000`
  and open the **Ports** tab to forward port 3000 — Codespaces only auto-forwards
  common ports.
- Run it with `sudo`. If your user has passwordless sudo (the Codespaces default)
  the script re-executes itself as root automatically, so you never get a password
  prompt in the middle of the install.
- **No usable root at all?** `setup_rootless()` takes over: when `sudo` is missing or
  cannot authenticate, or when you pass `--rootless`, everything is installed into
  `~/zk-studio/vaultly` as your own user, the port defaults to 3000, and the panel
  runs in the foreground. Nothing prompts for a password.

---

## Manual quick start (5 minutes)

**Requirements:** Node.js 20+, and either a Postgres 14+ server or nothing at all
for local development (an embedded Postgres is bundled for dev).

```bash
# 1. Install dependencies
npm install

# 2. Create your environment file
cp .env.example .env
#    then edit .env: set AUTH_SECRET, DATABASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD
#    generate a secret with:  openssl rand -base64 48

# 3. Start a database + migrate + seed + run the app
npm run db:local      # terminal 1: embedded Postgres on :5432 (dev only)
npm run setup         # terminal 2: migrate + create roles, settings, admin
npm run dev           # terminal 2: http://localhost:3000
```

Or the one-liner that does all of it (embedded DB + migrations + dev server):

```bash
./scripts/dev.sh
```

Then sign in with the `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env`.

Want demo content (three sample users, folders and files)?

```bash
npm run setup -- --demo
```

> The embedded database is for local development only. In production point
> `DATABASE_URL` at a real Postgres instance (Neon, Supabase, RDS, Railway, a
> self-hosted container — anything that speaks Postgres).

The background worker (thumbnails, trash purging, expired sessions) runs as a
separate process:

```bash
npm run worker            # loop every 60s
npm run worker -- --once  # one pass, handy in cron
```

On serverless hosts where no process can live, call
`POST /api/admin/worker` from a cron job instead (see [Deployment](#deployment)).

---

## Environment variables

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `DATABASE_URL` | ✅ | — | Postgres connection string. Append `?sslmode=require` for managed providers. |
| `AUTH_SECRET` | ✅ | — | Random 32+ char secret for CSRF and signed tokens. |
| `APP_URL` | ✅ prod | `http://localhost:3000` | Public origin used in share links, emails, cookies. Must be `https://` in production. |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` | ✅ first run | — | The first Super Admin created by `npm run setup`. |
| `STORAGE_DRIVER` | | `local` | `local` or `s3`. |
| `STORAGE_LOCAL_DIR` | | `./storage/uploads` | Where the local driver writes files. |
| `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | s3 | — | Credentials for S3-compatible storage. |
| `S3_ENDPOINT` | | AWS default | Set for R2, B2, MinIO, DigitalOcean Spaces, Wasabi. |
| `S3_FORCE_PATH_STYLE` | | `false` | `true` for MinIO and most B2 setups. |
| `S3_PUBLIC_BASE_URL` | | — | Use a public bucket URL instead of streaming through the app. |
| `CDN_BASE_URL` | | — | CDN hostname in front of the bucket. |
| `MAX_UPLOAD_BYTES` | | admin setting | Hard ceiling per file, overrides the admin setting. |
| `FFPROBE_PATH` | | — | Optional `ffprobe` binary for video duration/resolution metadata. |
| `TRUST_PROXY` | | auto in prod | Read client IPs from `X-Forwarded-For` behind a proxy. |
| `CRON_SECRET` | | — | Bearer token allowing a cron job to call `POST /api/admin/worker`. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD` | | — | Optional env-level SMTP; the admin UI settings take precedence. |

Secrets live only on the server. Nothing sensitive is ever serialised into the
browser bundle — the client receives a `toPublicBranding()` projection of settings.

---

## Storage drivers

Bytes never go into Postgres. Only metadata does (id, owner, name, MIME, size,
storage key, hash, dates, share token, visibility, folder).

### Local (default)

```env
STORAGE_DRIVER=local
STORAGE_LOCAL_DIR=./storage/uploads
```

Files land on disk under `<dir>/<ownerId>/<yyyy>/<mm>/<random>.<ext>`. Good for a
single server; mount a persistent volume in Docker. Paths are generated
server-side, so a user-supplied filename can never traverse the filesystem.

### S3-compatible (S3, R2, B2, MinIO, Spaces, Wasabi)

```env
STORAGE_DRIVER=s3
S3_BUCKET=vaultly
S3_REGION=auto                 # eu-west-1 for AWS
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com   # omit for AWS
S3_FORCE_PATH_STYLE=false
# CDN_BASE_URL=https://cdn.example.com
```

Objects are uploaded with `Content-Type` and long-lived `Cache-Control`; media is
streamed back with byte ranges, so seeking in long videos works. Adding a new
driver means implementing `src/lib/storage/types.ts` (`put`, `get`, `getStream`,
`getBuffer`, `delete`, `head`, `exists`) and registering it in
`src/lib/storage/index.ts`.

---

## Database & migrations

Drizzle ORM over Postgres. Schema: `src/db/schema.ts`, generated SQL in `drizzle/`.

Tables — `users`, `roles`, `sessions`, `folders`, `files`, `shares`,
`activity_logs`, `quota_changes`, `api_keys`, `password_reset_tokens`,
`login_attempts`, `settings` — with unique constraints on email, share tokens,
storage keys and session/API-key hashes, plus indexes on every hot lookup
(owner + deleted + date, category, token, expiry).

```bash
npm run setup                 # migrate + seed roles/settings/admin
npm run db:migrate            # apply pending migrations only
npm run db:generate           # generate a migration after editing the schema
npm run db:seed               # seed roles, settings, admin (idempotent)
npm run db:seed -- --demo     # ...plus demo users/content
npm run db:studio             # browse the database
```

---

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Next dev server on `:3000`. |
| `npm run build` / `npm start` | Production build / production server. |
| `npm run typecheck` | `tsc --noEmit` across the whole project. |
| `npm run setup` | Migrations + seed + first admin. |
| `npm run db:local` | Embedded Postgres for offline development. |
| `npm run worker` | Background jobs (thumbnails, purge, session cleanup). |
| `./scripts/dev.sh` | DB + migrations + dev server in one command. |
| `sudo bash install.sh` | One-command production install (see above). |

---

## REST API

Two styles, same handlers:

* **Session cookie** — used by the web UI. Requires the `vaultly_csrf` cookie to be
  echoed in an `x-csrf-token` header on mutating requests.
* **Bearer key** — `Authorization: Bearer vlt_...` for scripts and integrations.
  Keys are created in **Account → API keys**, are stored only as SHA-256 hashes,
  and carry explicit scopes (`files:read`, `files:write`, `shares:manage`,
  `files:delete`).

```bash
# list files
curl -H "Authorization: Bearer $VAULTLY_KEY" \
  "https://your-domain.com/api/v1/files?perPage=20&search=report&sort=date"

# upload (raw body + filename header)
curl -X POST -H "Authorization: Bearer $VAULTLY_KEY" \
  -H "x-file-name: report.pdf" -H "content-type: application/octet-stream" \
  --data-binary @report.pdf https://your-domain.com/api/v1/files

# file metadata / delete
curl -H "Authorization: Bearer $VAULTLY_KEY" https://your-domain.com/api/v1/files/$ID
curl -X DELETE -H "Authorization: Bearer $VAULTLY_KEY" https://your-domain.com/api/v1/files/$ID

# who am I + quota
curl -H "Authorization: Bearer $VAULTLY_KEY" https://your-domain.com/api/v1/me
```

### Endpoint map

| Method & path | Auth | Description |
| --- | --- | --- |
| `POST /api/auth/login` | public | Email + password → session cookie. Rate-limited, lockout after repeated failures. |
| `POST /api/auth/register` | public | Self sign-up (only when enabled in Settings → General). |
| `POST /api/auth/logout` | session | Revoke the current session. |
| `GET /api/auth/session` | any | Current user + CSRF token for the client. |
| `POST /api/auth/forgot-password` | public | Email a reset link (always returns success). |
| `POST /api/auth/reset-password` | public | Consume the token, set a password, revoke sessions. |
| `GET /api/files` | session/key | Paginated list (search, category, folder, sort, direction). |
| `POST /api/files/upload` | session/key | Streamed upload. Headers: `x-file-name`, `x-file-type`, optional `x-folder-id`. |
| `GET/PATCH/DELETE /api/files/:id` | owner | Read, rename/move/flags, delete (soft, to trash). |
| `GET /api/files/:id/raw` | owner | Private binary stream (`?download=1` to force attachment). |
| `GET /api/files/:id/thumbnail` | owner | Image thumbnail (WebP). |
| `GET/POST/PATCH /api/files/:id/share` | owner | Read or update share settings; regenerate token. |
| `GET /api/share/:token` | public | Share metadata for the public page (password gate aware). |
| `GET /api/media/:token`, `/api/media/:token/:path` | public | Bytes with Range support; password/expiry/max-download enforced. |
| `DELETE /api/trash`, `POST /api/trash` | session | Empty trash / restore a file. |
| `GET/POST /api/folders` | session | List and create folders. |
| `POST /api/account/password` | session | Change password (revokes other sessions). |
| `GET/DELETE /api/account/sessions` | session | List and revoke sessions. |
| `GET/POST/DELETE /api/account/api-keys` | session | Manage personal API keys. |
| `GET /api/admin/stats` | admin | Platform KPIs. |
| `GET/POST /api/admin/users` | admin | List / create users. |
| `PATCH/DELETE /api/admin/users/:id` | admin | Update role, status, quota, profile; delete with purge. |
| `GET /api/admin/files` | admin | Platform-wide file list; `DELETE ?id=` purges one. |
| `GET /api/admin/activity` | admin | Audit log with filters and pagination. |
| `GET/PATCH /api/admin/settings` | admin | Read/update a settings group. |
| `GET/POST /api/admin/appearance` | admin | Read/update branding (`?preview=1` to preview without saving). |
| `POST /api/admin/branding` | admin | Upload logo / favicon / login background. |
| `POST /api/admin/system` | admin | Maintenance actions; `GET` returns a health snapshot. |
| `POST /api/admin/worker` | admin or `CRON_SECRET` | Run one background maintenance pass. |
| `GET /api/v1/me`, `/api/v1/files`, `/api/v1/files/:id` | bearer key | Public integration API. |

Every response is `{ ok: true, data }` or
`{ ok: false, error: { message, code, details? } }`.

---

## Deployment

### Option A — Vercel + managed Postgres + object storage (recommended)

Vercel's filesystem is ephemeral, so object storage is mandatory:

1. Create a Postgres database (Neon, Supabase, or Vercel Postgres) and copy its
   connection string.
2. Create an S3-compatible bucket (Cloudflare R2 is the cheapest for egress;
   AWS S3, B2 and Spaces all work).
3. Import the repository into Vercel and set the environment variables from the
   table above, with `STORAGE_DRIVER=s3` and `APP_URL=https://your-domain.com`.
4. Set the build command to `npm run build` and add a one-off
   `npm run db:migrate && npm run db:seed` run (locally against the production
   `DATABASE_URL`, or as a deploy step) to create the schema and first admin.
5. Add your custom domain, then create a cron job (Vercel Cron, GitHub Actions,
   cron-job.org) hitting `POST https://your-domain.com/api/admin/worker` with
   `Authorization: Bearer $CRON_SECRET` once a minute or every five minutes.

`vercel.json` already raises the upload function's `maxDuration` so large files
have time to stream.

### Option B — Docker (single server, self-hosted)

```bash
docker build -t vaultly .
docker run -d --name vaultly -p 3000:3000 \
  -e DATABASE_URL="postgres://user:pass@db:5432/vaultly" \
  -e AUTH_SECRET="$(openssl rand -base64 48)" \
  -e APP_URL="https://files.example.com" \
  -e STORAGE_DRIVER=local \
  -v vaultly-storage:/app/storage \
  vaultly
```

The image applies migrations on boot (`scripts/migrate.ts` runs before
`next start`). Run the worker as a second container using the same image:

```bash
docker run -d --name vaultly-worker --env-file .env vaultly npx tsx scripts/worker.ts
```

### Option C — any Node host (Railway, Render, Fly.io, VPS)

`npm ci && npm run build && npm run db:migrate && npm start`, with the worker
started as a separate process. Use a persistent volume when
`STORAGE_DRIVER=local`.

### Post-deploy checklist

- [ ] `APP_URL` is the final `https://` domain (share links are absolute).
- [ ] `AUTH_SECRET` is 32+ random characters and unique per environment.
- [ ] `STORAGE_DRIVER=s3` for multi-instance or serverless deployments.
- [ ] SMTP configured in **Admin → Settings → Email**, then send a test email —
      password reset is unusable without it.
- [ ] TLS terminated at the proxy/CDN; the session cookie is `Secure` in production.
- [ ] Admin → Security shows all green checks.
- [ ] A cron job hits `POST /api/admin/worker`.
- [ ] First admin password changed after the first sign-in.
- [ ] Backups: database dump **and** bucket replication. The DB alone cannot
      reconstruct files, and the bucket alone cannot reconstruct metadata.

### CDN & CORS

Media URLs are public and token-scoped, so a CDN can cache them safely. Set
`CDN_BASE_URL` (or `S3_PUBLIC_BASE_URL`) to serve bytes directly from the edge and
take the app out of the hot path. Embedding on third-party sites needs no CORS
configuration for `<img>`/`<video>`/`<iframe>`; the API adds permissive
`Access-Control-Allow-Origin` to public media responses only, never to
authenticated ones.

---

## Security model

| Area | Implementation |
| --- | --- |
| Passwords | `scrypt` (N=16384) with a 16-byte per-user salt, stored as `scrypt$N$r$p$salt$hash`, compared with `timingSafeEqual`. |
| Sessions | 32-byte random token; only its SHA-256 hash is stored. HTTP-only, `SameSite=Lax`, `Secure` in production, absolute expiry, per-device revocation. |
| Brute force | Per-IP in-memory rate limits on login/register/reset; per-account failed-login counter with temporary lockout; every attempt logged. |
| CSRF | Double-submit cookie (`vaultly_csrf`) verified on every mutating request, plus an `Origin`/`Host` cross-site check that rejects foreign origins. Bearer-key requests are exempt. |
| Authorisation | Server-side permission checks on every route; ownership verified per file; admin routes additionally guarded in middleware *and* in the layout *and* in the API handler. |
| Uploads | Extension allow-list + hard blocklist, magic-byte sniffing (`file-type`) plus custom signatures for Office/text, and a family check so a `.png` must really be an image. Size limits from settings. Files stream to storage; nothing is buffered fully in memory. |
| XSS | Uploaded HTML/SVG/archives are forced to `Content-Disposition: attachment`; all media responses carry `Content-Security-Policy: default-src 'none'; sandbox`, so nothing uploaded can execute on your origin. |
| SQL injection | Drizzle parameterises every query; no string-built SQL. |
| Clickjacking | `X-Frame-Options: SAMEORIGIN` everywhere except `/embed/*`, which is deliberately framable and locked to `default-src 'self'`. |
| Transport | `nosniff`, strict referrer policy, permissions policy, no `X-Powered-By`; HSTS at the proxy. |
| Tokens | Share tokens are 12-char base62 from `crypto.randomBytes`; API keys are `vlt_` + 48 random chars, stored hashed with a visible prefix for identification. |
| Secrets | Server-only. The client receives a whitelisted branding projection; no token, hash or SMTP credential reaches the browser. |
| Malware scanning | Hook point in the upload pipeline (`ContentScanHook` in `src/lib/upload-service.ts`) — wire it to ClamAV or a cloud scanning API without touching routes. |

---

## Architecture

```
src/
├─ app/
│  ├─ (auth)/            login · register · forgot-password · reset-password
│  ├─ dashboard/         files · upload · images · videos · links · trash · settings
│  ├─ admin/             overview · users · files · activity · security · appearance · settings
│  ├─ share/[token]/     public share page
│  ├─ media/[token]/     direct byte stream (Range, ETag, caching)
│  ├─ embed/video/       framable player
│  └─ api/               route handlers (REST + session endpoints)
├─ components/           branding · layout · files · share · upload · account · admin · ui
├─ db/                   schema.ts · index.ts (pool + drizzle client)
├─ lib/
│  ├─ storage/           types.ts · local.ts · s3.ts · index.ts · validation.ts
│  ├─ auth.ts session.ts crypto.ts csrf.ts rate-limit.ts permissions.ts
│  ├─ files.ts upload-service.ts media.ts admin-stats.ts settings.ts
│  └─ format.ts file-types.ts theme.ts mailer.ts activity.ts api.ts
├─ middleware.ts         edge auth redirects, CSRF cookie issuing
drizzle/                 generated SQL migrations
scripts/                 setup · migrate · seed · local-db · worker · dev.sh
```

**Request flow for an upload:** middleware → `/api/files/upload` auth + CSRF →
quota and size check → peek first 4 KB (magic bytes) → stream to the storage
driver → insert row + share token → log activity → respond with the share,
direct and embed URLs → background job generates the thumbnail.

**Request flow for a public view:** `/media/:token/file.png` → token lookup →
visibility/expiry/password/max-download checks → range request forwarded to the
driver → response with `Accept-Ranges`, `Content-Range`, `ETag` and immutable
caching → download counter incremented asynchronously.

---

## Troubleshooting

**`DATABASE_URL is required` / connection refused** — the database isn't running.
For local work start `npm run db:local`; otherwise check the host, port and
`sslmode` in `DATABASE_URL`.

**Migrations were already applied** — `scripts/migrate.ts` is idempotent and
records applied files; use `npm run db:generate` after schema changes.

**Uploads fail with 413** — your reverse proxy or host limits the body. Raise
`client_max_body_size` (nginx), the function size limit (Vercel: 4.5 MB per
request on Hobby) or use the S3 driver with presigned uploads for very large files.

**Share images 404 on another domain** — use the `/embed/video/:token` URL for
iframes and `/media/:token/:file` for `<img>`/`<video>`; `/share/:token` is an HTML
page and cannot be embedded.

**Video seeks restart from zero** — the storage driver must support ranges. The
local and S3 drivers do; a custom driver must forward the `Range` header.

**Password reset emails don't arrive** — SMTP isn't configured, or the provider
blocks the sender. Check **Admin → Settings → Email**, then the activity log for
mail errors.

**Thumbnails never appear** — the worker isn't running. Start `npm run worker`, or
call `POST /api/admin/worker`.

---

Built with Next.js 15 (App Router), React 19, TypeScript, Drizzle ORM, Postgres,
Tailwind CSS, sharp and the AWS SDK for S3.

---

<div align="center">

<img src="assets/zk-studio.png" alt="ZK Studio logo" width="140" />

### Made by ZK STUDIO

</div>
