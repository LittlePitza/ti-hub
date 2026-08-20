# Security policy

TI Hub is an internal tool for the IT department of Plásticos PIMSA. It holds
employee contact details, device inventory with stored credentials, help-desk
tickets and supplier invoices, so a vulnerability here has real consequences for
the plant.

## Reporting a vulnerability

**Do not open a public issue.**

Use [GitHub's private vulnerability reporting](https://github.com/LittlePitza/ti-hub/security/advisories/new),
or email **sistemas@plasticospimsa.com**.

Please include the affected route, what an attacker gains, and the steps to
reproduce it. You will get an acknowledgement within five business days.

Only the deployed `main` branch is supported; there are no maintained older
releases.

## What the threat model already assumes

These are accepted design decisions, not findings. Reporting them is welcome
only if you have found a way to make them worse than described.

- **The employee portal has no password.** Identity is an HttpOnly cookie
  holding the employee's email address (`portal_correo`, 180 days). Anyone who
  knows a colleague's address could see that colleague's reports. Zero friction
  was the priority for an internal, plant-network tool. It is documented in
  [`docs/architecture.md`](docs/architecture.md).
- **There is no public sign-up.** Panel accounts are created by hand in the
  Supabase dashboard. A missing registration flow is intentional.
- **There is no Content-Security-Policy header.** The root layout uses an inline
  script to apply the theme before first paint, plus inline styles; a strict CSP
  would break both without a per-request nonce. Every other security header is
  set in `next.config.mjs`.

## What is in scope

- Anything that reads or writes a row belonging to a different employee.
- Anything that reaches `/ti/*` or invokes a server action without a Supabase
  Auth session.
- Any path that exposes `SUPABASE_SERVICE_ROLE_KEY`, or any value derived from
  it, to the browser.
- Any query in `src/app/(portal)/` that uses `getPortalSupabase()` without
  filtering by `solicitante_email` or `asignado_email` — that client bypasses
  RLS by design.
- Stored credentials (`equipos.accesos`) or Storage objects reachable without a
  session or a valid signed URL.
- Any RLS policy that is not `to authenticated`.

## Handling secrets

`SUPABASE_SERVICE_ROLE_KEY` is server-only and must never carry the
`NEXT_PUBLIC_` prefix. SMTP and Microsoft Graph credentials live in the
`config_correo` table, not in environment variables, and are never returned to
the client.

If a key is ever exposed, rotate it in the Supabase dashboard first and update
the Vercel environment variables second — in that order.
