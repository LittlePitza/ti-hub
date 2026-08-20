# Changelog

All notable changes to TI Hub are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project does not
publish versioned releases — `main` is what is deployed — so entries are grouped
by the date they shipped.

## [Unreleased]

### Changed

- **Repository restructured.** All application code moved under `src/`
  (`src/app`, `src/components`, `src/lib`, `src/styles`, `src/types`,
  `src/middleware.ts`), leaving the root for configuration and documentation.
  The `@/*` alias now resolves to `./src/*`, so no import path changed.
- **The English naming rule declared in `CONTRIBUTING.md` is now actually
  applied.** Files, exported types, functions, constants, components, server
  actions and every code comment are in English. UI copy, CSS class names,
  database identifiers and routes remain in Spanish, exactly as the contributing
  guide requires. Verified against the original tree: no user-visible string and
  no CSS class name changed.
- `tsconfig` target raised from `ES2017` to `ES2022`.
- `.nvmrc` moved to Node 22 (the current LTS); `engines` still allows Node 20+.

### Added

- **Test suite.** 160 Vitest tests over the pure domain modules — the SLA clock,
  the payment projection, the petty-cash ledger, the derived service status,
  month arithmetic and the jsonb sanitisers. `npm run test`.
- **Continuous integration.** GitHub Actions runs formatting, lint, typecheck,
  tests and a production build on every push and pull request.
- `npm run verify` — the whole gate in one command.
- Dependabot, grouped by ecosystem, with framework majors deliberately excluded.
- `LICENSE` (proprietary), `SECURITY.md`, `CHANGELOG.md`, `CODEOWNERS`, issue
  forms and a pull-request template.
- Shared editor configuration in `.vscode/`.

### Fixed

- **The documentation no longer describes files that do not exist.**
  `docs/architecture.md` referenced `lib/domain/inventory.ts`, `custody.ts`,
  `email.ts`, `reports.ts` and the functions `getAuthenticatedSupabase()` /
  `getPortalSupabase()` — none of which existed under those names. Those names
  are now real. `docs/roadmap.md` claimed the English naming pass was complete;
  it had only reached the directory level.
- Corrected two code comments that documented output the runtime does not
  produce: under `es-MX`, `currency(99, "USD")` renders `USD 99.00`, not
  `US$99.00`.
- Removed the unused `SLA` back-compatibility alias from
  `src/lib/domain/tickets.ts`.
- `graphify-out/` is now ignored instead of sitting untracked in the tree.

### Notes for the next rename

Three categories survived the English pass unchanged, because renaming them
breaks silently rather than loudly. They are documented in
[`CONTRIBUTING.md`](CONTRIBUTING.md), and the migration verified each one
against the original tree:

- **CSS class names** — untyped string literals; the build stays green while the
  styling breaks.
- **UI copy** — Spanish is the product, not an accident.
- **jsonb keys** — `ExtraCredential.etiqueta` (in `equipos.accesos`) and
  `TemplateClause.texto` (in `plantillas_responsiva.clausulas` and
  `responsivas.clausulas`) are database identifiers. Values cross into Postgres
  through `Json`, so renaming one type-checks perfectly and orphans every row
  already written. The same holds for any raw row read as
  `Record<string, unknown>` — `fieldFromRow` must read `f.etiqueta`. Tests now
  pin all of these.

## 2026-08-18 — Repository health

- English identifiers, comments and documentation adopted as the rule; Spanish
  kept for UI copy, CSS classes and database identifiers.
- ESLint, Prettier, `.editorconfig`, `.nvmrc` and the `lint` / `typecheck` /
  `format` scripts.
- Generated Supabase types in `types/database.ts`; all three clients typed as
  `SupabaseClient<Database>`.
- `tsconfig` `strict: true`.
- `components/` and `lib/` grouped by domain; `globals.css` split into eight
  files under `styles/`.
- Dropped the unused `geist` dependency.

## Earlier

Phases 0 through 7 — inventory, maintenance, tickets and SLA, the employee
portal, the employee directory, vendors and invoices, systems status, tasks and
projects, and monthly KPI reports — are recorded in
[`docs/roadmap.md`](docs/roadmap.md).
