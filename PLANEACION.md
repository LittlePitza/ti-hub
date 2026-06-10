# Planeación — TI Hub · PIMSA

> Hoja de ruta del sistema interno de TI. Integra todo lo definido con el encargado de TI
> (Luis Hernandez · sistemas@plasticospimsa.com). Empresa: Plásticos PIMSA, Santa Catarina, N.L.
>
> **Convención:** 🔴 crítico · 🟡 importante · 🟢 mejora. Marcar `[x]` al completar.
> El esquema de BD es la fuente de verdad: todo cambio va a `supabase/schema.sql`.

---

## Visión

El **TI Hub** es la herramienta operativa del área de TI de PIMSA. Tiene dos caras:

1. **Panel de TI** (`app/(panel)/`) — uso interno del equipo de sistemas: inventario, mantenimientos, tickets, directorio, proveedores.
2. **Portal del empleado** (`app/portal/`, próxima fase) — interfaz simple para que cualquier trabajador levante tickets sin fricción.

Lo que NO vive en esta app (queda como documentación/administración en `PIMSA-Microsoft365/`): configuración de seguridad de M365 (MFA, roles), respaldos, red e infraestructura. La app es lo **operativo del día a día**.

---

## Estado actual (Fase 0 — ✅ hecho)

- [x] Inventario de equipos (alta, estado, baja, garantía).
- [x] Mantenimientos (preventivo/correctivo, programados, vencidos resaltados).
- [x] Tickets internos (folio TK-####, categoría, prioridad, ciclo de vida).
- [x] Dashboard con métricas + próximos mantenimientos + últimos tickets.
- [x] Auth Supabase + 3 capas de seguridad (middleware, server actions, RLS).
- [x] Tema claro/oscuro, gráficas SVG, todo en español.
- [x] Tokens de branding PIMSA documentados (aún no aplicados al CSS).

---

## Fase 1 — Pimsificar + datos reales 🔴

**Objetivo:** que el hub se vea y hable como PIMSA, con datos verdaderos.

- [x] 🔴 Aplicar paleta PIMSA en `app/globals.css` (remapear tokens): primario `#294466`, acento verde `#7F9D41`, variantes claras `#B0CD75`/`#517AAD`. Sin colores hardcodeados.
- [ ] 🔴 Reemplazar el seed de ejemplo (oficinas QRO/video) por **datos reales de PIMSA** en `schema.sql`: equipos reales (del inventario carpeta 01) y ubicaciones reales (Santa Catarina, planta/oficina).
- [x] 🟡 Integrar el **logo oficial** PIMSA (SVG) en sidebar y login (`public/pimsa-logo.svg` completo, `public/pimsa-isotipo.svg` para encabezados, favicon `app/icon.svg`).
- [ ] 🟡 Ajustar ubicaciones del inventario al sitio real (planta, oficinas, site/rack).

**Decisión resuelta:** Signika (marca oficial) se adoptó **solo en el portal del empleado**; el panel de TI conserva Geist.

---

## Fase 2 — Portal de tickets para el empleado 🔴

**Objetivo:** que cualquier trabajador de PIMSA levante un ticket en una sola pantalla, sin jerga de TI.

- [x] 🔴 Crear rutas `app/portal/` separadas del panel de TI (layout propio, sin sidebar, tipografía Signika).
- [x] 🔴 Pantalla **crear ticket** (`/portal/nuevo`): pasos numerados — categoría como tarjetas en lenguaje claro, selección del equipo del empleado, resumen + detalles.
- [x] 🔴 Pantalla **mis tickets** (`/portal`): tarjetas con folio, estado amigable (Recibido / En atención / Resuelto) y barra de progreso de 3 pasos. Sin métricas ni jerga.
- [x] 🟡 Branding PIMSA visible (logo oficial, azul `#294466` + verde `#7F9D41`, filo verde en cabecera).
- [ ] 🟡 Definir SLA básico (tiempos de respuesta por prioridad) y mostrarlo.
- [ ] 🟢 Notificar a TI cuando entra un ticket nuevo (correo o Teams vía webhook/Power Automate).

**Cambios de esquema (hechos):**
- `tickets.solicitante_email` + `tickets.equipo_id` (FK a `equipos`) — el ticket queda ligado a su autor y al equipo reportado.
- `equipos.asignado_email` — vincula los equipos al correo del empleado; se captura desde el inventario del panel.

**Decisión resuelta — autenticación del portal:** *solo correo, sin contraseña ni magic link*.
El empleado escribe su correo una vez; queda en una cookie HttpOnly (`portal_correo`, scope `/portal`, 180 días).
El servidor consulta con la **service role key** (`SUPABASE_SERVICE_ROLE_KEY`, nunca expuesta al cliente)
filtrando siempre por ese correo; el RLS sigue cerrado para `anon`. Tradeoff aceptado: quien conozca el
correo de un compañero podría ver sus reportes (portal interno, fricción cero fue la prioridad).

---

## Fase 3 — Directorio de empleados y dispositivos 🟡

**Objetivo:** centralizar quién es quién, su contacto y qué equipo tiene. (Sustituye los CSV de directorio telefónico.)

- [ ] 🟡 Nueva tabla `empleados`: nombre, correo, departamento, puesto, extensión, celular, estado.
- [ ] 🟡 Pre-cargar los **36 empleados reales** (ya listados en `02-Administracion-M365/Usuarios-y-Licencias.csv`).
- [ ] 🟡 Vincular `equipos.asignado_a` → FK a `empleados` (hoy es texto libre).
- [ ] 🟢 Vista **directorio telefónico** (búsqueda por nombre/depto/extensión).
- [ ] 🟢 **Generador de firma de correo** por empleado (toma sus datos y produce el HTML de la firma estándar PIMSA).

**Cambios de esquema:** tabla `empleados` + FK desde `equipos` y `tickets`.

---

## Fase 4 — Proveedores, contratos y alertas 🟡

**Objetivo:** no perder renovaciones ni garantías.

- [ ] 🟡 Nueva tabla `proveedores`: nombre, servicio, contacto, teléfono, correo, costo, periodicidad, fecha de renovación.
- [ ] 🟡 Pre-cargar Microsoft (licencias M365) e ISP (internet).
- [ ] 🟢 **Alertas en dashboard**: contratos por renovar (próximos 30/60 días) y **garantías de equipos por vencer** (ya tenemos `garantia_hasta`).

**Cambios de esquema:** tabla `proveedores` (+ opcional `contratos`).

---

## Fase 5 — Mejoras operativas 🟢

- [ ] 🟢 Adjuntar **fotos a tickets** (Supabase Storage) — útil para reportar fallas.
- [ ] 🟢 **Exportar a CSV** inventario y tickets.
- [ ] 🟢 **Mantenimientos recurrentes** (cada N meses, autogenera el siguiente).
- [ ] 🟢 **Base de conocimiento / procedimientos**: checklists alta/baja de empleado (de `08-Procesos-y-Politicas`) accesibles desde la app.
- [ ] 🟢 Histórico/bitácora de cambios por ticket (comentarios).

---

## Resumen de cambios de base de datos previstos

| Fase | Cambio en `schema.sql` |
|---|---|
| 1 | Reemplazar seed por datos PIMSA |
| 2 | ✅ `tickets.solicitante_email`, `tickets.equipo_id`, `equipos.asignado_email` (portal vía service role, sin políticas `anon`) |
| 3 | Tabla `empleados`; FK `equipos.asignado_a` y `tickets` → `empleados` |
| 4 | Tabla `proveedores` (y/o `contratos`) |
| 5 | Bucket de Storage para adjuntos; tabla `comentarios_ticket` |

## Decisiones abiertas (para resolver con el usuario)

1. ~~Autenticación del portal del empleado~~ → resuelta: solo correo en cookie (ver Fase 2).
2. ~~Tipografía~~ → resuelta: Signika en el portal, Geist en el panel.
3. **Notificaciones de ticket**: ¿correo, Teams, o ambos?
4. **Empleados como tabla** vs. seguir con texto libre en `asignado_a`/`solicitante` (en Fase 3 `equipos.asignado_email` migraría a FK de `empleados`).

---

## Orden de construcción recomendado

**Fase 1 → Fase 2 → Fase 3 → Fase 4 → Fase 5.**
La 1 es rápida y de alto impacto visual (se ve PIMSA). La 2 es el objetivo central (portal del empleado). La 3 habilita a la 4. La 5 es pulido.

---
_Última actualización: 2026-06-10_
