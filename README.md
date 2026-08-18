# TI Hub

Internal site for the IT department of **Plásticos PIMSA** (plastics recycling, Santa Catarina, N.L.).

The application has **two faces** that share one Next.js app and one database:

- **Employee portal** — public routes `/`, `/nuevo`, `/reporte/[id]`. Any worker files a report with
  zero friction; identity is a cookie holding their email address, no password.
- **IT panel** — `/ti`, protected by Supabase Auth. Inventory, employees, maintenance, tickets,
  custody letters, services status, tasks, invoices, petty cash and reports. The only public link
  into the panel is the small "TI" in the portal footer, which points at `/login`.

Stack: Next.js 15 (App Router) · React 19 · TypeScript · Supabase (PostgreSQL + Auth + Storage) · deployed on Vercel.

> The UI is intentionally in Spanish: it is read by plant and office staff at the Santa Catarina
> site. Code, comments and documentation are in English — see [CONTRIBUTING.md](CONTRIBUTING.md).

## Getting started

### 1. Database (Supabase)

1. Create a project at [supabase.com](https://supabase.com) (the free plan is enough).
2. Open **SQL Editor → New query**, paste the whole contents of [`supabase/schema.sql`](supabase/schema.sql)
   and hit **Run**. That creates the 16 tables, the indexes, the RLS policies, the three Storage
   buckets and — on a fresh install only — the sample data.
3. Under **Authentication → Users → Add user**, create the accounts for the IT team (email +
   password, tick **Auto Confirm User**). There is no public sign-up: only the users you add here
   can reach the panel.
4. Under **Project Settings → API**, copy the **Project URL**, the **anon public key** and the
   **service_role key**.

> `schema.sql` is idempotent — `create table if not exists` plus an `ALTER` section for older
> databases. Do **not** re-run the "DATOS DE EJEMPLO" (sample data) section against real data.

### 2. Run locally

```bash
npm install
cp .env.example .env.local   # then fill in the three variables
npm run dev                  # http://localhost:3000
```

Requires Node 20 or newer (see `.nvmrc`).

### 3. Deploy to Vercel

1. Push the repository to GitHub.
2. At [vercel.com](https://vercel.com) → **Add New → Project** → import the repo. Vercel detects
   Next.js on its own; nothing to configure.
3. Under **Environment Variables**, add all three:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` — **server-only**, never prefixed with `NEXT_PUBLIC_`. The
     employee portal does not work without it.
4. **Deploy**.

> Deploying without the two `NEXT_PUBLIC_` variables still builds and serves: every page shows a
> configuration notice instead of crashing.

Email notifications (SMTP, sender, templates, portal URL) are **not** environment variables — IT
configures them from the panel at `/ti/correo`. Same for SLA targets.

## Scripts

```bash
npm run dev           # dev server
npm run build         # production build — the pre-commit gate
npm run start         # serve the build
npm run lint          # ESLint
npm run typecheck     # tsc --noEmit
npm run format        # Prettier, write
npm run format:check  # Prettier, check only
```

There is no test suite. `npm run lint && npm run typecheck && npm run build` is the verification.

## Structure

```
middleware.ts              Requires a session on /ti/* and refreshes the token
app/
  layout.tsx               Poppins font, theme bootstrap, viewport
  globals.css              Ordered @imports of styles/
  login/                   Panel sign-in (Supabase Auth email + password)
  (portal)/                Employee portal — public, cookie identity
    page.tsx               My reports
    nuevo/                 File a report (numbered steps)
    reporte/[id]/          Report detail + reply thread
  ti/                      IT panel — session required
    page.tsx               Dashboard (metrics, charts, alerts)
    inventario/            Devices, phones, phone lines, software (tabs by category)
    empleados/             Employee directory + email-signature generator
    mantenimientos/        Preventive/corrective scheduling
    tickets/               Help-desk cycle, SLA, board and list views
    responsivas/           Asset-custody letters (+ printable document)
    servicios/             Systems status and incidents
    tareas/                Tasks and projects
    facturas/              Invoices and vendors
    caja/                  Petty cash
    reportes/              Monthly KPI report
    correo/                Email + SLA configuration
components/                Grouped by domain: ui, layout, charts, inventory,
                           tickets, custody, shared
lib/
  supabase/client.ts       Three per-request Supabase clients
  domain/                  Business rules per module
  utils/                   Formatting, FormData, images, attachments
types/database.ts          Generated Supabase types
styles/                    Design system split into eight files
docs/                      Architecture, roadmap, system documentation
supabase/schema.sql        Full schema + RLS + buckets + seed — source of truth
```

Deeper detail — the three Supabase clients, the three security layers, the domain modules — lives in
[`docs/architecture.md`](docs/architecture.md).

## Security

Three layers for the IT panel, all requiring a Supabase Auth session:

1. **Middleware** — no valid session on `/ti/*` redirects to `/login`.
2. **Server actions** — verify the user via `getAuthenticatedSupabase()` _before_ writing.
3. **RLS** — every policy is `to authenticated`, so the anon key alone cannot read or write any
   table even if someone extracts it from the browser.

The employee portal at `/` is public. Its identity is an HttpOnly cookie holding the employee's
email; the server reads with the service-role key and **always filters by that email**. RLS stays
closed to `anon` — do not add public policies.

Users are managed by hand in the Supabase dashboard (**Authentication → Users**). There is no
sign-up page; that is deliberate for an internal tool.

## Roadmap

See [`docs/roadmap.md`](docs/roadmap.md).
