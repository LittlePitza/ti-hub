# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

> Todo el código, los textos y la comunicación de este repo van **en español** (nombres de archivos, componentes, clases CSS, columnas de BD, variables). El nuevo código debe seguir igual.

## Qué es

Sitio interno del departamento de TI de **Plásticos PIMSA** (empresa de reciclaje de plástico en Santa Catarina, N.L.). Tiene **dos caras** que comparten la misma app Next.js y la misma base de datos:

- **Portal del empleado** — `app/(portal)/`, rutas públicas `/`, `/nuevo`, `/reporte/[id]`. Cualquier trabajador levanta reportes sin fricción; su identidad es una cookie con su correo (sin contraseña).
- **Panel de TI** — `app/ti/`, protegido con Supabase Auth. Inventario, empleados, mantenimientos, tickets, responsivas y configuración de correo. Único enlace público al panel: el "TI" del pie del portal → `/login`.

## Comandos

```bash
npm run dev      # http://localhost:3000 (requiere .env.local, ver .env.example)
npm run build    # build de producción — ES LA verificación antes de commitear
npm start        # sirve el build
```

No hay tests ni linter configurados. **`npm run build` es la única verificación** (corre el type-check de TypeScript). Node ≥ 20.

Variables de entorno (`.env.example`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` (solo servidor, para el portal). Sin las dos primeras el sitio carga igual y muestra el aviso `SinConexion` en vez de tronar.

## Arquitectura

**Stack:** Next.js 15 (App Router) + React 19 + TypeScript. Server Components por defecto; `"use client"` solo donde hay interactividad (`TemaToggle`, `Graficas`, `TableroTickets`, `MoverEstado`, `BotonImprimir`). Sin Tailwind ni librerías de UI: **todo el estilo vive en `app/globals.css`** con variables CSS (tema claro/oscuro vía `[data-theme="dark"]`); las gráficas son SVG hechas a mano en `components/Graficas.tsx`.

### Tres clientes de Supabase (`lib/supabase.ts`) — nunca un singleton

La sesión cambia por petición, así que el cliente se crea por petición ligado a cookies (`@supabase/ssr`). Cuál usar:

- **`getSupabase()`** — lecturas en Server Components del panel. Devuelve `null` si faltan las env vars (dispara `SinConexion`).
- **`getSupabaseAutenticado()`** — server actions del panel. Devuelve `null` si no hay usuario; las actions lo verifican **antes de escribir**.
- **`getSupabasePortal()`** — solo el portal del empleado. Usa `SUPABASE_SERVICE_ROLE_KEY` (solo servidor) y **salta el RLS**: por eso hay que **filtrar siempre** por `solicitante_email` / `asignado_email`. Nunca debe llegar al cliente.

### Seguridad en 3 capas (panel de TI)

`middleware.ts` exige sesión en `/ti/*` y redirige a `/login` → server actions verifican usuario con `getSupabaseAutenticado` → **RLS en Postgres** (`to authenticated`). No hay registro público: los usuarios de TI se dan de alta a mano en el dashboard de Supabase. El portal (`/`) es público y su identidad es la cookie de correo (`lib/portal.ts`, `portal_correo`, HttpOnly, 180 días) — el RLS sigue cerrado para `anon`; **no agregar políticas públicas**.

### La BD es código: `supabase/schema.sql` es la fuente de verdad

Tablas: `empleados`, `equipos`, `mantenimientos`, `tickets`, `ticket_eventos`, `config_correo`, `responsivas`, `plantillas_responsiva`. El archivo es **idempotente**: `create table if not exists` + una sección `ALTER` para bases viejas + RLS + un bucket de Storage + seed (la sección "DATOS DE EJEMPLO" es **solo para instalaciones nuevas**, no re-ejecutar sobre datos reales). Aplicar cambios de esquema reproduciendo aquí el DDL y, sobre el proyecto remoto, vía el MCP de Supabase (`apply_migration`).

### Módulos de dominio en `lib/` (reusar antes de inventar)

- **`lib/inventario.ts`** — el inventario es **una sola tabla `equipos`** dividida por `categoria` (`computo` | `celular` | `linea` | `software`); las columnas genéricas cambian de significado por categoría (p. ej. `marca` = compañía telefónica en líneas) y las etiquetas/campos visibles viven aquí. Una línea/celular sin `asignado_email` está **libre**.
- **`lib/tickets.ts`** — estados (ciclo tipo mesa de ayuda), prioridades, categorías y **SLA por prioridad** (`respuesta`/`resolucion` en horas). `SLA_DEFAULTS` son los valores base (ITIL 4), pero TI los **sobreescribe desde `/ti/correo`** (columnas `sla_*` de `config_correo`): `resolverSla(config)` en `lib/correo.ts` mezcla overrides sobre los defaults y se pasa a `evaluarRespuesta`/`evaluarResolucion`, que calculan el semáforo (cumplido/por vencer/incumplido/pausado). Toda la lógica de SLA y etiquetas de estado pasa por aquí.
- **`lib/responsivas.ts`** — cartas de resguardo (documento legal de custodia). Las **8 plantillas base viven en código** (`PLANTILLAS_DEFAULT`); la tabla `plantillas_responsiva` solo guarda los overrides que TI edita. Cada responsiva guarda un **snapshot congelado** del empleado y el equipo (no se rompe si luego cambian).
- **`lib/correo.ts`** — notificaciones por correo, **configuradas desde el panel** (`/ti/correo`, tabla `config_correo`), no por env vars. Tres métodos de envío: `smtp_basico`, `graph_app` (Microsoft Graph app-only) y `oauth_interactivo`. El envío lo dispara TI a voluntad, no es automático (salvo el aviso de ticket nuevo). `config_correo` es además la fila única de configuración general del panel: aquí vive `resolverSla(config)` (ver `lib/tickets.ts`).
- **`lib/portal.ts`** — identidad del portal y mapeos a lenguaje del empleado (categorías, estados con `paso` 1-3).
- **`lib/format.ts`** — folios (`folio` → `TK-####`, `folioResponsiva`), fechas y duraciones.

### Detalles que cruzan varios archivos

- **Mutaciones = Server Actions** (`actions.ts` junto a cada página): verifican sesión, escriben, terminan con `revalidatePath`.
- **Folios** = prefijo + `num` (serial de Postgres) con padding, formateado en `lib/format.ts`.
- **Estados** tienen check constraints en la BD; en UI se mapean a `.insignia.ok|aviso|critico|info|neutro`.
- **Bitácora de tickets** (`ticket_eventos`): comentarios internos, respuestas al solicitante y mensajes del cliente (hilo bidireccional con el portal).
- **URL base dinámica:** el código **no tiene el dominio escrito** en ningún lado — lo deriva de los headers del proxy (`x-forwarded-host`). Los enlaces de los correos usan `config_correo.sitio_url`, configurable en el panel. Cambiar de dominio no requiere tocar código.

## Convenciones de UI

Antes de crear clases nuevas, reusar las semánticas ya definidas en `globals.css`: `.boton`, `.insignia`, `.tabla`, `.formulario`, `.campo`, `.tarjeta`, `.metrica`, `.vacio`, `.banner-exito`, `.resguardo-chip`, etc. **No introducir colores hardcodeados**: siempre variables CSS.

## Identidad de marca PIMSA

Empresa: **Plásticos PIMSA** (NO usar "Plásticos Industriales de Monterrey" — no son de Monterrey). Tono industrial, sustentable, economía circular.

- **Colores** (ya remapeados a tokens en `globals.css`): azul marino corporativo `#294466`, verde PIMSA `#7F9D41`, verde claro `#B0CD75`, azul profundo `#064D79`. Existen constantes `--pimsa-azul`, `--pimsa-verde`, `--pimsa-verde-claro`, `--pimsa-azul-profundo` para superficies grandes y botones.
- **Tipografía:** **Poppins** (`next/font/google`) en toda la app — familia visual compartida con el Portal de Mantenimiento de PIMSA. Se carga una sola vez en `app/layout.tsx` (variable `--font-poppins`) y la heredan tanto el panel de TI como el portal del empleado.
- **Lenguaje visual compartido:** ti-hub replica el look del Portal de Mantenimiento — chrome **navy `#15273a`** (sidebar/login), fondo **mist `#f2f4f7`**, superficies planas flotantes (sin gradientes) con esquinas generosas (`--radio-campo: 12px`, `--radio-tarjeta: 16px`, `--radio-pastilla`) y sombras suaves (`--sombra-tarjeta`/`--sombra-pop`). Utilidades `.press` (feedback táctil) y `.eyebrow` (labels en mayúsculas). Se conserva el toggle claro/oscuro.
- **Logo:** `public/pimsa-logo.svg` (completo), `public/pimsa-isotipo.svg` (solo olas, para encabezados compactos), `app/icon.svg` (favicon). El azul del logo se pierde en modo oscuro: envolver siempre el `<img>` en `<span className="logo-claro">`.

## Hoja de ruta

La planeación por fases y los cambios de esquema previstos viven en **`PLANEACION.md`** (fuente de verdad del roadmap).
