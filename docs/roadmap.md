# Roadmap — TI Hub · PIMSA

> Roadmap for the internal IT system, capturing everything agreed with the IT lead
> (Luis Hernandez · sistemas@plasticospimsa.com). Company: Plásticos PIMSA, Santa Catarina, N.L.
>
> **Convention:** 🔴 critical · 🟡 important · 🟢 nice to have. Tick `[x]` when done.
> The database schema is the source of truth: every change goes into `supabase/schema.sql`.

---

## Vision

**TI Hub** is the operational tool for the PIMSA IT department. It has two faces:

1. **Employee portal** (`app/(portal)/`, **the home page**: routes `/` and `/nuevo`) — a simple
   interface for any worker to file a ticket without friction.
2. **IT panel** (`app/ti/`, the discreet `/ti` route behind a login) — internal use by the systems
   team: inventory by category, employees, maintenance, tickets, vendors.

What does **not** live in this app (it stays as documentation/administration in
`PIMSA-Microsoft365/`): M365 security configuration (MFA, roles), backups, network and
infrastructure. This app is the **day-to-day operational** layer.

---

## Current state (Phase 0 — ✅ done)

- [x] Device inventory (create, status, retire, warranty).
- [x] Maintenance (preventive/corrective, scheduled, overdue highlighted).
- [x] Internal tickets (folio `TK-####`, category, priority, lifecycle).
- [x] Dashboard with metrics + upcoming maintenance + latest tickets.
- [x] Supabase Auth + the three security layers (middleware, server actions, RLS).
- [x] Light/dark theme, SVG charts, Spanish UI throughout.
- [x] PIMSA branding tokens documented (not yet applied to the CSS at that point).

---

## Phase 1 — PIMSA identity + real data 🔴

**Goal:** make the hub look and speak like PIMSA, with real data.

- [x] 🔴 Apply the PIMSA palette in the stylesheets (remap the tokens): primary `#294466`, green
      accent `#7F9D41`, light variants `#B0CD75` / `#517AAD`. No hardcoded colors.
- [ ] 🔴 Replace the sample seed (QRO offices / video) with **real PIMSA data** in `schema.sql`:
      real devices (from the inventory in folder 01) and real locations (Santa Catarina, plant/office).
- [x] 🟡 Integrate the **official PIMSA logo** (SVG) in the sidebar and login (`public/pimsa-logo.svg`
      full, `public/pimsa-isotipo.svg` for compact headers, favicon `app/icon.svg`).
- [ ] 🟡 Align inventory locations with the real site (plant, offices, server room/rack).

**Decision made:** Signika (the official brand face) was adopted **for the employee portal only**;
the IT panel kept Geist.
_Superseded:_ both faces now use **Poppins**, matching the PIMSA Portal de Mantenimiento. The
`geist` package is no longer used.

---

## Phase 2 — Employee ticket portal 🔴

**Goal:** let any PIMSA worker file a ticket on a single screen, with no IT jargon.

- [x] 🔴 Create portal routes separate from the IT panel (its own layout, no sidebar).
      **Update:** the portal is now the home page (`/`); the panel moved to `/ti`, reachable discreetly
      from the portal footer.
- [x] 🔴 **Create ticket** screen (now `/nuevo`): numbered steps — categories as cards in plain
      language, pick the employee device, summary + details.
- [x] 🔴 **My tickets** screen (now `/`): cards with folio, friendly status (Received / In progress /
      Resolved) and a 3-step progress bar. No metrics, no jargon.
- [x] 🟡 PIMSA branding visible (official logo, blue `#294466` + green `#7F9D41`, green edge on the
      header).
- [x] 🟡 Define a basic SLA (response times per priority) and surface it. **Done:** per-priority
      targets (response/resolution) in `lib/domain/tickets.ts`, an indicator (on time / due soon /
      breached / paused), an SLA column in the list, SLA metrics in the ticket detail and an aggregate
      summary on the dashboard. `en_espera` pauses the clock.
- [ ] 🟢 Notify IT when a new ticket arrives (email or Teams via webhook / Power Automate).
      _Partially done:_ email notification on new ticket is implemented and configured from `/ti/correo`.

**Schema changes (done):**

- `tickets.solicitante_email` + `tickets.equipo_id` (FK to `equipos`) — the ticket is tied to its
  author and to the reported device.
- `equipos.asignado_email` — links devices to an employee email; captured from the panel inventory.
- `tickets.estado` widened to six board-style statuses: `abierto`, `en_proceso`, `en_espera`,
  `resuelto`, `cerrado`, `reabierto`.
- `tickets.asignado_email`, `tickets.primera_respuesta_at`, `tickets.resuelto_at` — back the
  assignment and the SLA calculation (first response and resolution).

**Decision made — portal authentication:** _email only, no password and no magic link._
The employee types their email once; it is kept in an HttpOnly cookie (`portal_correo`, 180 days).
The server queries with the **service role key** (`SUPABASE_SERVICE_ROLE_KEY`, never exposed to the
client), always filtering by that email; RLS stays closed to `anon`. Accepted trade-off: anyone who
knows a colleague email could see their reports — this is an internal portal and zero friction was
the priority.

---

## Phase 3 — Employee and device directory 🟡

**Goal:** centralize who is who, their contact details and what equipment they hold. (Replaces the
phone-directory CSVs.)

- [x] 🟡 New `empleados` table: name, email (unique), department, position, extension, status. Page
      `/ti/empleados` with create, retire and devices assigned by email.
- [ ] 🟡 Preload the **36 real employees** (already listed in
      `02-Administracion-M365/Usuarios-y-Licencias.csv`).
- [x] 🟡 Link devices to employees: assignment in the inventory is an **employee select** that stores
      `asignado_a` (name) + `asignado_email` (the link). Email is the key; there is no hard FK, so
      historical free-text records remain valid.
- [x] 🟡 **Inventory by category**: computers / phones / phone lines / software in tabs; unassigned
      phones and lines show as "free". (User request, pulled forward from a later phase.)
- [ ] 🟢 **Phone directory** view (search by name / department / extension).
- [x] 🟢 **Email signature generator** per employee (takes their details and produces the standard
      PIMSA signature HTML). Available at `/ti/empleados/[id]/firma`.

**Schema changes (done):** table `empleados`; `equipos.categoria` + `equipos.telefono`; widened
`tipo` check (phone, tablet, line, software).

---

## Phase 4 — Vendors, contracts and alerts ✅

**Goal:** never miss a renewal or a warranty.

- [x] 🟡 New `proveedores` table: name, service, contact, phone, email, cost, recurrence, next
      payment. **Done:** catalogue at `/ti/facturas/proveedores` plus an **invoices** module
      (`/ti/facturas`, table `facturas` with PDF/XML attachments in Storage) with a 90-day payment
      agenda combining captured invoices and recurring due dates projected from `proximo_pago`
      (`lib/domain/invoices.ts`).
- [x] 🟡 ~~Preload Microsoft (M365 licences) and the ISP (internet)~~ → decided against seeding: IT
      captures them from the panel.
- [x] 🟢 **Dashboard alerts**: upcoming/overdue payments and the month outstanding in the summary;
      **device warranties about to expire** ("Garantías · 90 días" panel).

**Schema changes (done):** tables `proveedores` and `facturas` + the `facturas` Storage bucket.

---

## Phase 5 — Operational improvements 🟢

- [x] 🟢 Attach **photos to reports** (Supabase Storage) — useful for reporting faults. Done for the
      portal, with browser-side compression before upload and `sharp` recompression on archive.
- [ ] 🟢 **Export to CSV** for inventory and tickets.
- [ ] 🟢 **Recurring maintenance** (every N months, auto-generating the next one).
- [ ] 🟢 **Knowledge base / procedures**: employee onboarding and offboarding checklists (from
      `08-Procesos-y-Politicas`) reachable from the app.
- [x] 🟢 Per-ticket change history / activity log (comments). **Done:** table `ticket_eventos`
      (comment / status / assignment / system), a timeline in the ticket detail and an automatic entry on
      every status or assignment change. These are internal notes: visible only in the IT panel, never in
      the employee portal.

---

## Phase 6 — Systems status + Tasks and projects ✅

**Goal:** give IT a health board for the services the company uses daily, plus its own work agenda
(to-do + projects).

- [x] 🟡 **Systems status** (`/ti/servicios`): a catalogue of services (internet, Microsoft 365, SAP,
      network, telephony, printing…) and a record of **incidents** (outage / degraded / maintenance) with
      the cycle `activo → vigilando → resuelto`. Each service status is **derived** from its open
      incidents rather than stored, the same way `vencida` works for invoices. Folio `INC-####`. The
      board groups by category with a status dot and halo, and keeps a history of resolved incidents with
      their duration.
- [x] 🟡 **Notice in the employee portal**: a banner announcing outages of services flagged
      `visible_portal`, so a worker knows IT is already aware and does not file a duplicate report
      (`components/shared/ServicesNotice.tsx`, on `/` and `/nuevo`). It shows only the incident title,
      never the internal note.
- [x] 🟢 **"Systems with problems" panel** in the summary (`/ti`), shown only when there are open
      incidents.
- [x] 🟡 **Tasks and projects** (`/ti/tareas`): quick capture of to-dos, grouped by due date (Overdue
      / Today / Next 7 days / Later / No date), with priority, project and deadline. Completing stamps
      `completada_at` (derived status). **Projects** carry a progress bar (done/total), a status and a
      target date; a task with no project lives in the inbox.

**Schema changes (done):** tables `servicios`, `incidentes`, `proyectos`, `tareas` (+ indexes and
`to authenticated` RLS). The service catalogue self-seeds, idempotent by `nombre`.

---

## Phase 7 — Monthly reports (KPIs) ✅

**Goal:** a monthly cut, browsable and printable, that IT uses to report its KPIs: how the month went
for tickets, SLA, systems and maintenance.

- [x] 🟡 **`/ti/reportes` page** with a month picker (`?mes=YYYY-MM`, ‹ › arrows, capped at the
      current month) and a print button to take the PDF to the meeting. "Reportes" entry in the sidebar
      (Panel group).
- [x] 🟡 **`lib/domain/reports.ts`**: everything is **derived** from existing tables (no new tables,
      no snapshots); a closed month can always be reconstructed because the timestamps are immutable.
      Standard help-desk cohorts: _created_ (`created_at` in the month), _responded_
      (`primera_respuesta_at` in the month, giving the response SLA), _resolved_ (`resuelto_at` in the
      month, giving the resolution SLA) and _backlog at close_ (for the current month the cut is "now").
- [x] 🟡 **KPIs with variation against the previous month** (▲/▼ chips, green or red depending on
      whether up is good) + a **6-month trend** of created vs resolved (the `Columnas` chart added to
      the charts module).
- [x] 🟡 **Systems status for the month**: incidents opened/resolved/still open, total downtime and a
      per-service impact table with **availability %** (outage overlap with the month, computed over the
      elapsed span so the current month is not inflated).
- [x] 🟢 **Maintenance for the month**: scheduled, completed, pending and % completion (cancelled
      excluded from the base).
- [x] 🟢 Along the way: fix in the summary (`/ti`) — the "due soon" count now uses the SLA configured
      at `/ti/correo`, matching the "out of SLA" count (it previously used the defaults).

**Schema changes:** none — the report is 100% derived.

---

## Phase 8 — Repository health ✅

**Goal:** make the repo conventional and maintainable.

- [x] 🟡 English identifiers, comments and documentation; Spanish kept for UI copy, CSS classes and
      database identifiers (see [`../CONTRIBUTING.md`](../CONTRIBUTING.md) for the rule and glossary).
- [x] 🟡 Tooling: ESLint, Prettier, `.editorconfig`, `.nvmrc`, and `lint` / `typecheck` / `format`
      scripts.
- [x] 🟡 Generated Supabase types (`types/database.ts`); all three clients typed as
      `SupabaseClient<Database>`.
- [x] 🟡 `tsconfig` `strict: true`.
- [x] 🟡 Structure: `components/` and `lib/` grouped by domain; `globals.css` split into `styles/`.
- [ ] 🟢 CI on GitHub Actions running lint + typecheck + build on every push and PR.
- [ ] 🟢 A test suite. There is none today; `npm run build` is the only gate.

---

## Summary of database changes by phase

| Phase | Change in `schema.sql`                                                                                                                                                                                           |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Replace the seed with PIMSA data                                                                                                                                                                                 |
| 2     | ✅ `tickets.solicitante_email`, `tickets.equipo_id`, `equipos.asignado_email` (portal via service role, no `anon` policies); ✅ widened statuses + `asignado_email`, `primera_respuesta_at`, `resuelto_at` (SLA) |
| 3     | ✅ Table `empleados`; FK `equipos.asignado_a` and `tickets` → `empleados`                                                                                                                                        |
| 4     | ✅ Tables `proveedores` and `facturas` + the `facturas` Storage bucket                                                                                                                                           |
| 5     | ✅ Storage bucket for attachments; ✅ table `ticket_eventos` (activity log / comments)                                                                                                                           |
| 6     | ✅ Tables `servicios`, `incidentes` (systems status) and `proyectos`, `tareas` (to-do)                                                                                                                           |
| 7     | None — the report is fully derived                                                                                                                                                                               |

## Open decisions

1. ~~Employee portal authentication~~ → resolved: email in a cookie (see Phase 2).
2. ~~Typography~~ → resolved: Poppins across both faces.
3. **Ticket notifications**: email, Teams, or both? Email is done; Teams is still open.
4. **Employees as a table** vs. free text in `asignado_a` / `solicitante` — `empleados` exists, but
   `equipos.asignado_email` is still a soft link rather than a hard FK, so historical free-text
   records stay valid.

---

_Last updated: 2026-08-18_
