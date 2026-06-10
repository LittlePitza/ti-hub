# CLAUDE.md — TI Hub · Plásticos PIMSA

Sitio interno del departamento de TI de **Plásticos PIMSA** (Plásticos Industriales de Monterrey, S.A. de C.V.): inventario de equipos, mantenimientos y tickets, más un **portal del empleado** (`app/portal/`) para levantar reportes sin fricción.

## Comandos

```bash
npm run dev      # http://localhost:3000 (requiere .env.local, ver .env.example)
npm run build    # build de producción (úsalo para verificar antes de commitear)
```

No hay tests ni linter configurados; `npm run build` es la verificación.

## Stack y arquitectura

- **Next.js 15 (App Router) + React 19 + TypeScript.** Server Components por defecto; `"use client"` solo donde hay interactividad (`TemaToggle`, `Graficas`).
- **Supabase**: PostgreSQL + Auth. Cliente por petición ligado a cookies en `lib/supabase.ts` (`@supabase/ssr`), **nunca singleton** (la sesión cambia por petición). Tres funciones: `getSupabase()` para lecturas en Server Components —devuelve `null` si faltan las env vars, lo que dispara el aviso de `SinConexion`—, `getSupabaseAutenticado()` para server actions del panel —devuelve `null` si no hay usuario— y `getSupabasePortal()` para el portal del empleado —usa `SUPABASE_SERVICE_ROLE_KEY` (solo servidor, **salta el RLS**): siempre filtrar por el correo del empleado—. La key pública se lee de `NEXT_PUBLIC_SUPABASE_ANON_KEY` (o, como fallback, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`). `supabase/schema.sql` es la **fuente de verdad** de la BD (tablas `equipos`, `mantenimientos`, `tickets`, RLS `to authenticated`, seed).
- **Sin Tailwind ni librerías de UI.** Todo el estilo vive en `app/globals.css` con variables CSS (tema claro/oscuro vía `[data-theme="dark"]`). Las gráficas son SVG hechas a mano en `components/Graficas.tsx`.
- **Mutaciones con Server Actions** (`actions.ts` junto a cada página); verifican sesión con `getSupabaseAutenticado` antes de escribir y terminan con `revalidatePath`.
- **Seguridad en 3 capas** (panel de TI): `middleware.ts` redirige a `/login` sin sesión → server actions verifican usuario → RLS en Postgres. No hay registro público; los usuarios se dan de alta a mano en el dashboard de Supabase. Las rutas `/portal` quedan **exentas** del middleware: ahí la identidad es la cookie de correo (ver abajo).

## Convenciones del código

- **Todo en español**: nombres de archivos, componentes, clases CSS, columnas de BD, variables (`Insignia`, `boton-salir`, `solicitante`, `mantenimientos`). El nuevo código debe seguir igual.
- UI: clases CSS semánticas reutilizables ya definidas en `globals.css` (`.boton`, `.insignia`, `.tabla`, `.formulario`, `.campo`, `.tarjeta`, `.metrica`, `.vacio`). Reúsalas antes de crear nuevas.
- Folios de ticket: `TK-` + `num` (serial) con padding, formateado en `lib/format.ts`.
- Estados con check constraints en la BD; en UI se mapean a `.insignia.ok|aviso|critico|info|neutro`.

## Identidad de marca PIMSA

Fuente: https://plasticospimsa.com (WordPress + Elementor). Empresa de reciclaje de plástico, molienda y peletizado, recolección de scrap y contenedores colapsables en Santa Catarina, N.L. Tono: industrial, sustentable, economía circular.

### Logo

- SVG oficial: https://plasticospimsa.com/wp-content/uploads/2024/05/PIMSA-Logo-SVG@Q2-1.svg
- Isotipo de olas/flechas en verde + wordmark "PIMSA" en azul marino, tagline itálica (Myriad Pro).
- Colores exactos del logo: verde `#84A33F` / `#83A33F`, azul marino `#2A476B` / `#29466A`.

### Paleta (colores globales de Elementor del sitio oficial)

| Rol en el sitio | Hex | Uso sugerido aquí |
|---|---|---|
| Primario | `#294466` | Azul marino corporativo: encabezados, sidebar, botones primarios |
| Acento | `#7F9D41` | Verde PIMSA: acciones, links activos, estados positivos |
| Verde claro | `#B0CD75` | Fondos tenues del acento, hovers |
| Azul claro | `#517AAD` | Variante del primario (modo oscuro, info) |
| Azul profundo | `#064D79` | Hovers/énfasis del primario |
| Verde oscuro | `#003F2E` | Detalles, footer |
| Secundario | `#54595F` | Texto secundario / gris |
| Texto | `#1A1A1A` | Texto principal |

### Tipografía del sitio oficial

- Títulos: **Signika Negative** (300/400) · Texto: **Signika** (300/400), ambas en Google Fonts.
- El panel de TI usa Geist; el portal del empleado usa **Signika** (`next/font/google` en `app/portal/layout.tsx`).

### Assets de marca en el repo

- `public/pimsa-logo.svg` — logo completo (isotipo + wordmark, sin tagline; la fuente del tagline no existe en web).
- `public/pimsa-isotipo.svg` — solo las olas, para encabezados compactos (sidebar, login, header del portal).
- `app/icon.svg` — favicon: isotipo sobre azul marino.
- El azul del logo se pierde en modo oscuro: envolver siempre el `<img>` en `<span className="logo-claro">` (chip claro en dark).

### Cómo está aplicada la marca en este repo

Los tokens de `globals.css` ya están remapeados: `--petroleo` → azul `#294466` (claro) / `#7fa7d6` (oscuro), `--ok` → verde (oscurecido a `#5d7a2c` en claro para contraste de texto), y existen constantes de marca `--pimsa-azul`, `--pimsa-verde`, `--pimsa-verde-claro`, `--pimsa-azul-profundo` para superficies grandes y botones. No introducir colores hardcodeados en componentes: siempre variables.

## Hoja de ruta

La planeación completa por fases (pimsificación, portal del empleado, directorio, proveedores, mejoras) y los cambios de esquema previstos viven en **`PLANEACION.md`** — esa es la fuente de verdad del roadmap. Resumen de la fase central abajo.

## Portal del empleado (`app/portal/`) — construido

Cualquier empleado levanta un reporte **sin fricción**: escribe su correo una sola vez y listo.

- **Identidad sin contraseña**: el correo vive en una cookie HttpOnly (`portal_correo`, scope `/portal`, 180 días). Helpers en `lib/portal.ts` (`getCorreoPortal`, categorías y estados en lenguaje del empleado).
- **Datos**: el servidor consulta con `getSupabasePortal()` (service role key, solo servidor) filtrando **siempre** por `solicitante_email` / `asignado_email`. El RLS sigue cerrado para `anon`; no agregar políticas públicas.
- **Vínculo correo → equipos**: `equipos.asignado_email` (se captura en el inventario del panel). El empleado ve "sus equipos" y al reportar elige con cuál se relaciona (`tickets.equipo_id`).
- **Pantallas**: `/portal` (identificación o inicio con CTA + mis reportes con progreso de 3 pasos) y `/portal/nuevo` (pasos numerados: categoría en tarjetas → equipo → resumen/detalles). Prioridad fija en `media`; TI la ajusta desde el panel. Estados amigables: Recibido / En atención / Resuelto / Cerrado.
- **Branding**: Signika, logo oficial, cabecera con filo verde, botones azul marino; clases `.portal-*`, `.opcion`, `.ticket-card` en `globals.css` (mobile-first).
- Requiere `SUPABASE_SERVICE_ROLE_KEY` en el entorno (ver `.env.example`); sin ella el portal muestra aviso de configuración.
