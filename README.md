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

## API (Phase 1)

| Method | Path                   | Notes                                  |
| ------ | ---------------------- | -------------------------------------- |
| GET    | `/api`                 | API index                              |
| GET    | `/api/health`          | Liveness                               |
| GET    | `/api/health/ready`    | Readiness (checks DB + Firebase)       |
| GET    | `/api/listings`        | Browse/search **approved** listings    |
| GET    | `/api/listings/:slug`  | Single approved listing detail         |

Auth model: the frontend gets a Firebase ID token and sends it as
`Authorization: Bearer <token>`. The backend verifies it, finds-or-creates the
matching `users` row by `firebase_uid`, and authorizes using the **`role`
column in Postgres** — never the token's claims.

---

## Deploying to Railway (backend + Postgres)

1. Create a Railway project and add a **PostgreSQL** plugin. Railway exposes
   `DATABASE_URL` to the service automatically.
2. Add a service from this repo. Set the remaining variables from
   `.env.example` (Firebase credentials, `CORS_ORIGINS`, etc.) in the service's
   **Variables** tab — never commit secrets.
3. Build command: `npm run build` · Start command: `npm run prisma:deploy && npm start`.

---

## Build order / roadmap

- [x] **Phase 1 — Backend scaffold:** Express + TypeScript, Prisma + Postgres, full schema, health + public listing reads.
- [ ] Phase 2 — Firebase Auth + Storage wiring, auth middleware end-to-end.
- [ ] Phase 3 — Shared frontend structure (header/footer/nav, design system).
- [ ] Phase 4 — Public site (homepage, search/browse, listing detail).
- [ ] Phase 5 — Vendor dashboard (listing CRUD + image upload, 3–10 rule).
- [ ] Phase 6 — Admin panel (verification queue, vendor/category/amenity mgmt).
- [ ] Phase 7 — Subscription plan logic (manual activation first).
- [ ] Phase 8 — Wire public site to the live API (approved only).
- [ ] Phase 9 — Reporting/flagging, analytics counters, responsive + SEO pass.
- [ ] Phase 10 — Deploy to Railway.

## Out of scope

No online payments/booking for stays, no availability calendar, no in-app chat
(contact is via native `tel:` / WhatsApp links only).
