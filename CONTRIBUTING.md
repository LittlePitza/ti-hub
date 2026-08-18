# Contributing

## Language rules

This repository mixes languages on purpose. The rule is **audience-based**:

| Layer                                                                               | Language    | Why                                                                                                                                          |
| ----------------------------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Identifiers — files, directories, functions, components, types, constants           | **English** | Standard practice; keeps the code readable to anyone                                                                                         |
| Code comments                                                                       | **English** | Same                                                                                                                                         |
| Documentation — `README`, `CONTRIBUTING`, `docs/architecture.md`, `docs/roadmap.md` | **English** | Same                                                                                                                                         |
| **UI copy** — every string a user reads                                             | **Spanish** | Read by plant and office staff in Santa Catarina; English here is a regression, not a cleanup                                                |
| **CSS class names**                                                                 | **Spanish** | ~510 existing classes are untyped string literals across 68 files. Renaming them fails silently — the build stays green while styling breaks |
| **Database** — tables, columns, enum values                                         | **Spanish** | Enum values are live production data; renaming needs a data migration, not just DDL                                                          |
| `docs/documentacion-sistema.md`                                                     | **Spanish** | Audience is PIMSA management and employees                                                                                                   |

So: an English variable may hold a Spanish string, and an English function may write to a Spanish
column. That is correct and intended.

```ts
// correct
const requesterEmail = formData.get("solicitante_email");   // DB column stays Spanish
await sb.from("empleados").insert({ solicitante_email: requesterEmail });
return <span className="insignia ok">Resuelto</span>;        // class + copy stay Spanish
```

### Glossary

Use these consistently. Inconsistent English is worse than Spanish.

| Spanish              | English            | Note                                                          |
| -------------------- | ------------------ | ------------------------------------------------------------- |
| `responsiva`         | `custodyLetter`    | Mexican legal asset-custody document                          |
| `caja chica`         | `pettyCash`        |                                                               |
| `folio`              | `folio`            | **Keep as-is** — document serial number, a domain term of art |
| `bitácora`           | `activityLog`      |                                                               |
| `insignia`           | `badge`            |                                                               |
| `equipo`             | `device`           | Not "team"                                                    |
| `empleado`           | `employee`         |                                                               |
| `solicitante`        | `requester`        |                                                               |
| `semáforo`           | `slaStatus`        | The cumplido/por vencer/incumplido/pausado indicator          |
| `vencimiento`        | `dueDate`          |                                                               |
| `criticidad`         | `criticality`      |                                                               |
| `mantenimiento`      | `maintenance`      |                                                               |
| `proveedor`          | `vendor`           |                                                               |
| `factura`            | `invoice`          |                                                               |
| `servicio`           | `service`          |                                                               |
| `incidente`          | `incident`         |                                                               |
| `tarea` / `proyecto` | `task` / `project` |                                                               |
| `plantilla`          | `template`         |                                                               |
| `firma`              | `signature`        |                                                               |
| `adjunto`            | `attachment`       |                                                               |
| `ubicación`          | `location`         |                                                               |
| `estado`             | `status`           | For lifecycle states; `state` only for UI state               |

Routes are **not** renamed. `/ti/inventario`, `/nuevo` and `/reporte/[id]` are live URLs baked into
links already sent by email through `config_correo.sitio_url`. Changing them breaks bookmarks and
delivered mail.

## Commands

```bash
npm run dev           # http://localhost:3000 (needs .env.local)
npm run lint          # ESLint
npm run typecheck     # tsc --noEmit
npm run format        # Prettier, write
npm run build         # production build
```

**Before committing:** `npm run lint && npm run typecheck && npm run build`. There is no test
suite, so this is the whole gate. Node 20 or newer.

## Conventions

### Server Components by default

`"use client"` only where there is real interactivity — modals, toggles, pickers, the drag-and-drop
ticket board. If a component only reads data and renders, it stays on the server.

### Mutations are Server Actions

One `actions.ts` next to each page. Every action follows the same shape:

1. Get the client via `getAuthenticatedSupabase()` — it returns `null` when there is no session.
2. Bail out if it is `null`. **Verify before writing**, never after.
3. Write.
4. `revalidatePath(...)` for every route whose data changed.

Always destructure `error` from a Supabase call and handle it. `const { data } = await ...` silently
renders an empty page when the query fails.

### The three Supabase clients

Never a singleton — the session differs per request. Pick by caller:

- `getSupabase()` — reads in panel Server Components. Returns `null` if env vars are missing (which
  triggers the `NoConnection` notice).
- `getAuthenticatedSupabase()` — panel server actions. Returns `null` without a user.
- `getPortalSupabase()` — the employee portal only. Uses `SUPABASE_SERVICE_ROLE_KEY`, **bypasses
  RLS**, and must therefore **always filter by `solicitante_email` / `asignado_email`**. It must
  never reach the client.

### Styling

No Tailwind, no UI library. Everything is plain CSS in `styles/`, imported in order by
`app/globals.css`. **Cascade order is load-bearing** — later files deliberately override earlier
ones. If you split or reorder, verify the concatenation is byte-identical.

Reuse the existing semantic classes before inventing new ones: `.boton`, `.insignia`, `.tabla`,
`.formulario`, `.campo`, `.tarjeta`, `.metrica`, `.vacio`, `.banner-exito`, `.resguardo-chip`, and
the utilities `.press` (tactile feedback) and `.eyebrow` (uppercase labels).

**Never hardcode a color.** Use the CSS variables. Brand tokens: `--pimsa-azul` `#294466`,
`--pimsa-verde` `#7F9D41`, `--pimsa-verde-claro` `#B0CD75`, `--pimsa-azul-profundo` `#064D79`.
Light/dark theming is `[data-theme="dark"]` overrides, so test both.

### Database changes

`supabase/schema.sql` is the source of truth. Apply a change by (1) writing the DDL into that file,
keeping it idempotent, and (2) applying it to the remote project via the Supabase MCP
(`apply_migration`). After a schema change, regenerate types into `types/database.ts`.

### Folios

Prefix + a Postgres serial (`num`), padded and formatted in `lib/utils/format.ts`
(`TK-####`, `INC-####`, and the custody-letter and invoice variants). Do not format folios inline.

### Brand

The company is **Plásticos PIMSA**. Never "Plásticos Industriales de Monterrey" — they are not from
Monterrey. Tone: industrial, sustainable, circular economy.

Typography is **Poppins** for the whole app, loaded once in `app/layout.tsx`. Logos live in
`public/`: `pimsa-logo.svg` (full), `pimsa-isotipo.svg` (waves only, for compact headers),
`app/icon.svg` (favicon). The logo's blue disappears in dark mode — always wrap the `<img>` in
`<span className="logo-claro">`.

### Base URL

The domain is not written anywhere in the code. It is derived from the proxy headers
(`x-forwarded-host`), and email links use `config_correo.sitio_url`, configurable from the panel.
Changing domain requires no code change — keep it that way.
