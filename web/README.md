# Get Vaulted

Next.js marketplace app with listings, offers, auctions, checkout placeholders, and live rooms.

## Local setup

1. **Node** — use a current LTS version compatible with the `package.json` engines if specified.

2. **Install**

   ```bash
   npm install
   ```

   `postinstall` runs `prisma generate`.

3. **Environment** — copy the example file and adjust:

   ```bash
   cp .env.example .env
   ```

4. **Database** — Prisma uses **PostgreSQL** via `DATABASE_URL` in `.env` or `.env.local`. Use your Supabase project’s Postgres URI (see `.env.example`). The app does **not** use SQLite or `file:` database URLs.

5. **Migrations (development)**

   ```bash
   npm run db:migrate
   ```

   This runs `prisma migrate dev` (creates/applies migrations interactively).

6. **Run the app**

   ```bash
   npm run dev
   ```

## Environment variables

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | **PostgreSQL** connection string (`postgres://` or `postgresql://`). **Required** for the app, Prisma CLI, migrations, and Netlify builds. Use Supabase → Project Settings → Database → Connection string → URI. |
| `NEXTAUTH_SECRET` | Secret for signing JWTs and sessions. **Required in production**; without it, auth is insecure. |
| `NEXTAUTH_URL` | Canonical public URL of the app (e.g. `https://yourdomain.com`). **Required in production** for correct callbacks and OAuth-style redirects. |
| `SUPABASE_URL` | Supabase project URL (Dashboard → Settings → API). **Required in production** for listing image uploads. |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase **service_role** secret (server-only). **Required in production**; never expose to the browser or use a `NEXT_PUBLIC_` prefix. |
| `SUPABASE_STORAGE_BUCKET` | Storage bucket name for listing images. Defaults to **`listing-images`** if unset. |
| `NEXT_PUBLIC_SUPABASE_URL` | Same project URL as `SUPABASE_URL`; used in the browser for Realtime subscriptions. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase **anon** key for Realtime only (not the service role). |
| `NEXT_PUBLIC_SUPABASE_ENABLE_POSTGRES_REALTIME` | Set to `true` only when using Supabase Postgres + Realtime on app tables (see README → Supabase Realtime). |

On **`next start`** with `NODE_ENV=production`, the app fails fast if any of the production-required variables above are missing or blank, with a message pointing here and to `.env.example`.

**Local development without Supabase:** omit `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (or leave them blank). `POST /api/uploads/listing-image` then writes to `public/uploads/listings/` as before. Production requires Supabase so uploads survive deploys and scale-out.

## Migrations in production / CI

Apply existing migrations without prompts:

```bash
npm run db:migrate:deploy
```

(`prisma migrate deploy`)

The build script runs **`prisma generate`** before `next build`, so the client is generated on each build.

## Seed (demo data only)

```bash
ALLOW_DEMO_SEED=true npm run db:seed
```

Demo marketplace rows, fixture sellers, and demo live rooms run **only** when `ALLOW_DEMO_SEED=true` (see `prisma/seed.ts`). The command is also **skipped** when `NODE_ENV=production` unless you set `ALLOW_PRODUCTION_SEED=true` (not recommended). The app does not auto-seed on startup.

## Promote the first admin

Admin UI is under `/admin` (middleware + server layout enforce `role === admin` on the database user).

After you can sign in as a normal user (e.g. via signup), promote that user in the database:

**Option A — Prisma Studio**

```bash
npx prisma studio
```

Open the `User` model, set `role` to `admin` for your user, save.

**Option B — SQL** (any Postgres client, including Supabase SQL editor)

```sql
UPDATE "User" SET role = 'admin' WHERE lower(email) = lower('you@example.com');
```

Replace the email with yours. Postgres table names are quoted as `"User"` because the model name matches a reserved word.

Then sign out and sign in again so the JWT picks up the new role.

## Supabase Storage (listing images)

Listing photos from **Create listing** go to **Supabase Storage** in production. The API route `POST /api/uploads/listing-image` returns `{ url }` with a **public object URL** when Supabase env vars are set, or a relative `/uploads/listings/...` URL in local dev. Existing rows that already store `/uploads/...` paths keep working as long as those files exist under `public/`.

### One-time setup

1. In [Supabase](https://supabase.com/) → your project → **Storage** → **New bucket**.
2. Name it **`listing-images`** (or set `SUPABASE_STORAGE_BUCKET` to match).
3. For marketplace `<img>` tags without auth, turn the bucket **public** (bucket settings → “Public bucket”), or configure **Storage policies** so `anon` can `SELECT` objects in that bucket. Uploads use the **service role** on the server only; the service role key must **never** ship to the client.
4. Copy **Project URL** → `SUPABASE_URL`, and **service_role** key → `SUPABASE_SERVICE_ROLE_KEY` (Dashboard → **Settings** → **API**).
5. Set `SUPABASE_STORAGE_BUCKET=listing-images` if you use a non-default name.
6. Rebuild the app so `next.config.ts` picks up `SUPABASE_URL` and allows `next/image` optimization for your project host (`/storage/v1/object/public/...`).

Validation on upload is unchanged: JPEG/PNG/WebP only, max 8MB, magic-byte check, randomized filenames.

## Supabase Realtime (live rooms, bids, notifications)

The app uses **Supabase Realtime broadcast** from the server (service role, after Prisma writes) so clients get instant updates **without** requiring your primary database to be on Supabase. Polling stays as a fallback.

1. In Supabase Dashboard → **Project Settings** → **API**, copy the **anon public** key and project URL into:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
2. Ensure **Realtime** is enabled for the project (Realtime section / defaults).
3. Server env `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (same as storage) are used to **publish** broadcast events on channels `gv-room-{liveRoomId}`, `gv-listing-bids-{listingId}`, and `gv-user-{userId}`.

**Optional — Postgres changes:** If you migrate the app database to **Supabase Postgres** and add tables `LiveRoomMessage`, `BreakSpot`, `Bid`, and `Notification` to the Realtime publication, set `NEXT_PUBLIC_SUPABASE_ENABLE_POSTGRES_REALTIME=true`. The client will then also subscribe to `INSERT` / `UPDATE` on those tables (in addition to broadcast). With local SQLite, leave this `false`.

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Next.js dev server |
| `npm run build` | `prisma generate` + `next build` |
| `npm start` | Production server (`next start`) |
| `npm run db:migrate` | `prisma migrate dev` |
| `npm run db:migrate:deploy` | `prisma migrate deploy` |
| `npm run db:seed` | Run seed (guarded in production) |

## License

Private project — see repository owner.
