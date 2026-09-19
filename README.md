# BookMyDayOut

A directory / marketplace website where visitors browse and discover **dayouts
and villas** to stay at in Sri Lanka. The platform does **not** process any
payments or bookings — users contact vendors directly via phone/WhatsApp/SMS.

> **Disclaimer shown across the site:** BookMyDayOut is a listing platform only.
> We do not process bookings or payments for stays. Please contact the vendor
> directly to confirm availability.

There are three interfaces (built over the phases below): the **public website**,
the **vendor dashboard**, and the **admin panel**.

---

## Tech stack

| Layer     | Choice                                                             |
| --------- | ----------------------------------------------------------------- |
| Backend   | Node.js + Express (**TypeScript**)                                 |
| Database  | PostgreSQL (Railway-managed) via **Prisma** ORM + migrations      |
| Auth      | Firebase Authentication (email/password + Google), verified by the Firebase Admin SDK on the backend |
| Images    | Firebase Storage (Postgres stores the resulting URLs)             |
| Hosting   | Railway (backend + Postgres)                                      |

The whole backend lives in **one folder** (this repo). The schema is a single
`prisma/schema.prisma` file.

---

## Project structure

```
.
├── prisma/
│   ├── schema.prisma      # the entire data model (one file)
│   └── seed.ts            # baseline categories, amenities, plans
├── src/
│   ├── index.ts           # server bootstrap + graceful shutdown
│   ├── app.ts             # Express app wiring (cors, helmet, routes)
│   ├── config/env.ts      # env var loading + validation
│   ├── lib/
│   │   ├── prisma.ts      # shared PrismaClient
│   │   ├── firebase.ts    # Firebase Admin init + token verification
│   │   └── http-error.ts  # typed HTTP errors
│   ├── middleware/
│   │   ├── auth.ts        # requireAuth / optionalAuth / requireRole
│   │   └── error.ts       # 404 + central error handler
│   └── routes/
│       ├── index.ts       # /api router
│       ├── health.routes.ts
│       └── listings.routes.ts   # public, approved-only reads
├── .env.example
├── package.json
└── tsconfig.json
```

---

## Local setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env
   # edit .env — at minimum set DATABASE_URL
   ```

3. **Run the database migration** (needs a reachable Postgres in `DATABASE_URL`)
   ```bash
   npm run prisma:migrate       # creates tables from schema.prisma
   npm run db:seed              # optional: seed categories/amenities/plans
   ```

4. **Start the API**
   ```bash
   npm run dev                  # http://localhost:8080/api
   ```

### Useful scripts

| Script                    | What it does                                  |
| ------------------------- | --------------------------------------------- |
| `npm run dev`             | Start API with hot reload (tsx watch)         |
| `npm run build`           | Compile TypeScript to `dist/`                 |
| `npm start`               | Run the compiled server                       |
| `npm run typecheck`       | Type-check without emitting                   |
| `npm run prisma:migrate`  | Create/apply a dev migration                  |
| `npm run prisma:deploy`   | Apply migrations in production (Railway)      |
| `npm run prisma:studio`   | Open Prisma Studio (DB browser)               |
| `npm run db:seed`         | Seed reference data                           |

---

## Frontend

The frontend is plain HTML/CSS/JS served by the same Express app (from
`public/`). No build step. Three interfaces:

| Interface        | Pages                                                                 |
| ---------------- | -------------------------------------------------------------------- |
| Public site      | `/` (home), `/browse.html`, `/listing/:slug`, `/login.html`, `/favorites.html` |
| Vendor dashboard | `/vendor/index.html`, `/vendor/listing-form.html`                    |
| Admin panel      | `/admin/index.html`                                                  |

Shared JS lives in `public/js/`: `config.js` (API + Firebase config),
`api.js` (fetch + Bearer token), `auth.js` (Firebase Auth wrapper),
`upload.js` (Storage image upload), `components.js` (header/footer/cards).

## Firebase setup (needed for Google sign-in + image storage only)

Email/password login and browsing work **without** Firebase. Set it up to
enable Google sign-in and vendor image uploads:

1. In the Firebase console, create a project and a **Web app**. Copy the SDK
   config into `public/js/config.js` (`FIREBASE_CONFIG`). These values are
   public by design — access is controlled by rules, not secrecy.
2. Enable **Authentication** → **Google** provider (email/password is handled by
   this backend, so it does not need Firebase).
3. Enable **Storage**. Uploads go through the backend Admin SDK; the
   `storage.rules` file is provided if you also want direct client access.
4. Create a **service account** (Project settings → Service accounts) and set
   the backend env vars `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`,
   `FIREBASE_PRIVATE_KEY` (or `FIREBASE_SERVICE_ACCOUNT_JSON`) and
   `FIREBASE_STORAGE_BUCKET`.

### Creating the first admin

Roles live in Postgres. Sign up once through the site, then promote yourself:

```bash
npm run prisma:studio     # open the users table, set your row's role = admin
# or with SQL:  UPDATE users SET role = 'admin' WHERE email = 'you@example.com';
```

## API (Phase 1)

| Method | Path                   | Notes                                  |
| ------ | ---------------------- | -------------------------------------- |
| GET    | `/api`                 | API index                              |
| GET    | `/api/health`          | Liveness                               |
| GET    | `/api/health/ready`    | Readiness (checks DB + Firebase)       |
| GET    | `/api/listings`        | Browse/search **approved** listings    |
| GET    | `/api/listings/:slug`  | Single approved listing detail         |

### Auth model (two login methods)

- **Email / password** — handled entirely by this backend (no Firebase).
  `POST /api/auth/register` and `/login` hash with bcrypt and return a backend
  **JWT** (signed with `JWT_SECRET`). The frontend stores it and sends it as
  `Authorization: Bearer <token>`.
- **Google sign-in** — uses Firebase on the frontend; the Firebase ID token is
  sent as the same Bearer header and verified with the Firebase Admin SDK.

The auth middleware accepts **either** token type, maps it to a `users` row, and
authorizes using the **`role` column in Postgres** — never the token's claims.
So Firebase is only required for Google sign-in and image storage; email/password
login works without it.

**Image uploads** go through the backend (`POST /api/vendor/listings/:id/upload`,
multipart) which stores them in Firebase Storage via the Admin SDK — so uploads
work for both login methods, not just Google users.

---

## Deploying to Railway (backend + Postgres)

1. Create a Railway project and add a **PostgreSQL** plugin. Railway exposes
   `DATABASE_URL` to the service automatically.
2. Add a service from this repo. Set the remaining variables from
   `.env.example` (`JWT_SECRET`, Firebase credentials, `CORS_ORIGINS`, etc.) in
   the service's **Variables** tab — never commit secrets.
3. `railway.json` already sets the build + start commands, so nothing else is
   needed: on each deploy it runs **build → migrate → seed → start**
   (`npm run start:prod`, which is `prisma migrate deploy && prisma db seed &&
   node dist/index.js`). The seed is idempotent (safe to run every deploy).

To skip the demo listings on deploy, set `SEED_SAMPLE_DATA=false` in Railway
Variables (reference data — categories, amenities, districts, plans — still
seeds). `prisma` and `tsx` are runtime dependencies so the release step works
even if devDependencies are pruned.

---

## Build order / roadmap

- [x] **Phase 1 — Backend scaffold:** Express + TypeScript, Prisma + Postgres, full schema, health + public listing reads.
- [x] **Phase 2 — Backend API:** auth middleware, vendor + admin + user routes, Firebase Storage helper + rules, subscription-expiry job.
- [x] **Phase 3–4 — Public site:** shared layout/design system, homepage, search/browse, listing detail (wired to API).
- [x] **Phase 5 — Vendor dashboard:** listing CRUD + Firebase Storage image upload, 3–10 image + plan-limit rules.
- [x] **Phase 6 — Admin panel:** verification queue, vendor/category/amenity/district/plan/banner mgmt, reports, users.
- [x] **Phase 7 — Subscriptions:** manual activation flow + daily expiry job.
- [x] **Phase 8 — Public site wired to live API** (approved listings only).
- [x] **Phase 9 — Reporting/flagging, server-side view/contact counters, responsive layout, SEO meta.**
- [ ] Phase 10 — Deploy to Railway (needs your Firebase + Postgres credentials).

### Not yet done (needs your accounts / later polish)
- Deploy to Railway + connect a real Firebase project (env vars only — no code changes).
- Optional: PayHere gateway for paid subscriptions (manual activation works today).
- Optional: real email provider (approval/rejection emails are stubbed/logged).
- Optional: Google Analytics/Firebase Analytics, map view, image resize extension.

## Out of scope

No online payments/booking for stays, no availability calendar, no in-app chat
(contact is via native `tel:` / WhatsApp links only).
